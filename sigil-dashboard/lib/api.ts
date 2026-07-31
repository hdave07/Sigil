// Mock implementation of the backend/frontend contract from the build brief
// (Part 4 — "The contract between backend and frontend").
//
// EVERY function here matches one endpoint on HD's real middleware:
//   getMission        -> GET  /mission
//   getAgents         -> GET  /agents
//   setAgentMission   -> POST /agents/:id/mission
//   getPendingActions -> GET  /pending
//   getAuditLog       -> GET  /audit
//   getActionStatus   -> GET  /action/:id/status
//   decideAction      -> POST /action/:id/status
//
// TO SWITCH TO THE REAL BACKEND: once HD's endpoints are live, replace the
// mock bodies below with `fetch(`${API_BASE}/...`)` calls. The function
// signatures and return shapes are designed to stay the same, so no page
// component should need to change — only this file.

import { Agent, AgentAction, ActionStatus, AuditEvent, AuditEventType, FlagType, Mission } from "./types";
import { actions as seedActions, missions as seedMissions } from "./mockData";
import { ACTION_TYPE_LABELS } from "./actionTypes";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ""; // set in .env.local - see README

// In-memory mutable store standing in for the database during frontend dev.
// Still used by getMission/getActionStatus below, which stay mock for now -
// see the comment on each for why.
let _missions: Mission[] = [...seedMissions];
let _actions: AgentAction[] = [...seedActions];

const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

// ---- shape translation for the 4 endpoints now wired to the real backend --
// The backend's response shapes (docs/CONTRACT.md) aren't identical to ours -
// these helpers do the translation so page components don't have to change.

/** Backend's flagType is 3-valued; ours is 2. See CONTRACT.md's changelog:
 * needs_approval collapses into the same bucket as not_permitted for
 * display - the precise reason is still visible via the reason/what text. */
function toFlagType(backendFlagType: string | undefined): FlagType | undefined {
  if (backendFlagType === undefined) return undefined;
  return backendFlagType === "needs_approval" ? "not_permitted" : (backendFlagType as FlagType);
}

/** Backend sends raw ISO timestamps; formatting to a display string belongs
 * here, at the translation boundary, not baked into the wire format. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
}

/** Short display label per backend audit event name - covers every event
 * name server.ts/actions.ts/missions.ts actually emit. */
const EVENT_RESULT: Record<string, string> = {
  "agent.registered": "Registered",
  "mission.declared": "Mission stored",
  "action.allowed": "Allowed",
  "action.paused": "Paused",
  "action.approved": "Resumed",
  "action.denied": "Denied",
};

/** Backend's `type` is optional (lifecycle events like mission.declared
 * don't get one); ours isn't. "allowed" is a reasonable neutral default for
 * those - they're normal setup events, not a blocked/human-decision case. */
function toAuditEventType(backendType: string | undefined): AuditEventType {
  return (backendType as AuditEventType) ?? "allowed";
}

// GET /mission
export async function getMission(missionId?: string): Promise<Mission | undefined> {
  await delay();
  return missionId ? _missions.find((m) => m.id === missionId) : _missions[0];
}

// The structured allowlist a mission resolves to - mirrors MissionScope in
// sigil-backend/packages/middleware/src/contract.ts exactly (see
// docs/CONTRACT.md §3/§6 for the enforcement semantics this feeds).
export interface MissionScope {
  allow: string[];
  requireApproval: string[];
  offMissionKeywords: string[];
}

export interface AgentMission {
  id: string;
  agentId: string;
  text: string;
  scope: MissionScope;
  hash: string;
  createdAt: string;
}

// GET /agents/:id/mission - the read counterpart of setAgentMission below.
// Non-ok (404, no mission declared yet) is treated the same as "no mission"
// rather than thrown - a missing mission isn't an error condition here.
// Exported so pages can fetch a single agent's real mission directly
// (getMission below is the legacy mock-only version, still local-array-only).
export async function getAgentMission(agentId: string): Promise<AgentMission | undefined> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/mission`);
  if (!res.ok) return undefined;
  return res.json();
}

// GET /agents (real - wired to the backend)
export async function getAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/agents`);
  const summaries = (await res.json()) as { id: string; name: string; status: string; mission: string | null }[];

  // AgentSummary is deliberately compact and doesn't carry scope - fetch the
  // full Mission (in parallel) for each agent that actually has one, so
  // allowedActions/missionId reflect real data instead of placeholders.
  const missions = await Promise.all(
    summaries.map((a) => (a.mission !== null ? getAgentMission(a.id) : Promise.resolve(undefined)))
  );

  return summaries.map((a, i) => {
    const mission = missions[i];
    return {
      id: a.id,
      name: a.name,
      missionId: mission?.id ?? "",
      missionDescription: a.mission ?? "",
      status: a.status as Agent["status"],
      // "Allowed to do" should cover everything the agent can legitimately
      // attempt, including actions that pause for a human first - allow-only
      // would misleadingly suggest e.g. email.send is off the table entirely
      // when it's really just gated on a checkpoint.
      allowedActions: mission ? [...mission.scope.allow, ...mission.scope.requireApproval] : [],
      currentJob: undefined,
      // AgentSummary doesn't include createdAt either (only the fuller Agent
      // type does) - open question, not yet decided (see docs/CONTRACT.md).
      startedAt: "",
      parentAgentId: undefined, // delegation isn't built on the backend yet
    };
  });
}

// POST /agents/:id/mission (real - wired to the backend) - the dashboard's
// checklist path: a human sets an existing agent's mission directly, rather
// than the agent declaring its own. Unsigned, same as every other
// dashboard-facing route today (see CONTRACT.md §2).
export async function setAgentMission(
  agentId: string,
  text: string,
  scope: MissionScope
): Promise<AgentMission> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/mission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, scope }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `failed to set mission (${res.status})`);
  }
  return res.json();
}

/** Several backend strings are built as `<raw type> on <rest>` - e.g.
 * actionAttempted (`web.read on "https://competitor.com"`) and audit detail
 * (`web.read on "..." - "web.read" was never declared...`). Split once here
 * so every caller relabels the type the same way. Returns undefined if the
 * text doesn't have that shape (e.g. lifecycle audit events like
 * "mission declared: ..." - nothing to relabel, left unchanged by callers). */
function splitTypeOn(text: string): { rawType: string; label: string; rest: string } | undefined {
  const idx = text.indexOf(" on ");
  if (idx === -1) return undefined;
  const rawType = text.slice(0, idx);
  const rest = text.slice(idx + " on ".length);
  return { rawType, label: ACTION_TYPE_LABELS[rawType] ?? rawType, rest };
}

/** Swaps every quoted occurrence of the raw type (e.g. `"web.read"`) for its
 * quoted label within a narrative string - reason/detail text quotes the
 * type again mid-sentence (see mission.ts's checkAction), a second spot
 * splitTypeOn's single split doesn't reach. */
function relabelQuotedType(text: string, rawType: string): string {
  const label = ACTION_TYPE_LABELS[rawType] ?? rawType;
  return label === rawType ? text : text.split(`"${rawType}"`).join(`"${label}"`);
}

/** mission.ts's checkAction always phrases an off_mission reason as
 * `"<type>" is an allowed action type, but <off-mission-specific detail>.`
 * - one sentence covering both gates. PendingApproval has no separate field
 * for the "allowed" half, so it's synthesized here (from the label, not the
 * raw type) and the reason is trimmed down to just the off-mission half, so
 * the two halves can render in their own boxes (green/red) instead of the
 * green one sitting empty. */
function splitOffMissionReason(reason: string, label: string): { permittedNote: string; reason: string } {
  const marker = ", but ";
  const idx = reason.indexOf(marker);
  const remainder = idx === -1 ? reason : reason.slice(idx + marker.length);
  return {
    permittedNote: `"${label}" is an allowed action type for this mission.`,
    reason: remainder.charAt(0).toUpperCase() + remainder.slice(1),
  };
}

export interface SuggestedActionType {
  type: string;
  label: string;
  reason: string;
}

export interface SuggestedScope {
  allow: SuggestedActionType[];
  requireApproval: SuggestedActionType[];
  offMissionKeywords: string[];
}

// POST /missions/suggest-scope - authoring aid only, called from the Setup
// screen's debounced effect. Never touches enforcement or the audit log.
export async function suggestMissionScope(
  text: string,
  signal?: AbortSignal
): Promise<SuggestedScope> {
  const res = await fetch(`${API_BASE}/missions/suggest-scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `failed to suggest scope (${res.status})`);
  }
  return res.json();
}

// GET /pending (real - wired to the backend)
export async function getPendingActions(): Promise<AgentAction[]> {
  const res = await fetch(`${API_BASE}/pending`);
  const list = (await res.json()) as {
    id: string;
    agentId: string;
    agentName: string;
    mission: string;
    actionAttempted: string;
    reason: string;
    context: string;
    flagType: string;
    timestamp: string;
  }[];

  return list.map((p) => {
    const split = splitTypeOn(p.actionAttempted);
    const labeledAction = split ? `${split.label} on ${split.rest}` : p.actionAttempted;
    const relabeledReason = split ? relabelQuotedType(p.reason, split.rawType) : p.reason;

    const flagType = toFlagType(p.flagType);
    const isOffMission = p.flagType === "off_mission" && split !== undefined;
    const { permittedNote, reason } = isOffMission
      ? splitOffMissionReason(relabeledReason, split!.label)
      : { permittedNote: undefined, reason: relabeledReason };

    return {
      id: p.id,
      agentId: p.agentId,
      agentName: p.agentName,
      // PendingApproval doesn't separate a raw type from the human-readable
      // label the way our AgentAction does - both get the same string.
      type: labeledAction,
      label: labeledAction,
      inBounds: false, // dead field on our side - never read, kept for shape compatibility
      status: "pending",
      missionDescription: p.mission,
      flagType,
      reason,
      permittedNote,
      payload: undefined, // backend sends a narrative `context` string, not key/value pairs
      requestedAt: p.timestamp,
    };
  });
}

// GET /action/:id/status - NOT wired to the real endpoint: that route is
// signed (agent-only), and the dashboard has no agent private key to sign
// with. Stays mock until/unless the dashboard needs its own unsigned way to
// check a single action's status (getPendingActions already covers "what's
// currently pending" for the dashboard's actual needs).
export async function getActionStatus(actionId: string): Promise<AgentAction["status"] | undefined> {
  await delay(150);
  return _actions.find((a) => a.id === actionId)?.status;
}

// POST /action/:id/status (real - wired to the backend)
export async function decideAction(
  actionId: string,
  decision: "approve" | "deny" | "stop"
): Promise<AgentAction | undefined> {
  // The backend only understands approve/deny - there's no per-agent "stop"
  // concept there yet, so "stop" is treated as a deny for now.
  const backendDecision = decision === "approve" ? "approve" : "deny";

  // The real endpoint only returns { status }, not the full action - fetch
  // pending first so we still have something complete to hand back to the
  // caller without changing this function's return shape.
  const pending = await getPendingActions();
  const match = pending.find((a) => a.id === actionId);
  if (!match) return undefined;

  const res = await fetch(`${API_BASE}/action/${actionId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: backendDecision }),
  });
  if (!res.ok) return undefined;
  const { status } = (await res.json()) as { status: ActionStatus };

  return { ...match, status };
}

// GET /audit (real - wired to the backend)
export async function getAuditLog(): Promise<AuditEvent[]> {
  const [auditRes, agents] = await Promise.all([fetch(`${API_BASE}/audit`), getAgents()]);
  const entries = (await auditRes.json()) as {
    id: string;
    agentId: string;
    event: string;
    type?: string;
    detail: string;
    flagType?: string;
    timestamp: string;
    hash: string;
    previousHash: string;
  }[];
  const nameById = new Map(agents.map((a) => [a.id, a.name]));

  return entries.map((e) => {
    // actions.ts writes detail as `<type> on "<target>" - <reason>` (attempt)
    // or `<type> on "<target>" <decision> by human review.` (decide) - both
    // shapes have the raw type up front, and the attempt shape repeats it
    // quoted inside the reason half.
    const split = splitTypeOn(e.detail);
    const what = split ? `${split.label} on ${relabelQuotedType(split.rest, split.rawType)}` : e.detail;
    return {
      id: e.id,
      time: formatTime(e.timestamp),
      // AuditEntry only carries agentId, not a display name - resolved here
      // against the agent list, same join the backend's own /pending route
      // does internally.
      agentName: nameById.get(e.agentId) ?? "System",
      what,
      result: EVENT_RESULT[e.event] ?? e.event,
      type: toAuditEventType(e.type),
      flagType: toFlagType(e.flagType),
      hash: e.hash,
      prevHash: e.previousHash,
    };
  });
}
