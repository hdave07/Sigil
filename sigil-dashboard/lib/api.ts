// Mock implementation of the backend/frontend contract from the build brief
// (Part 4 — "The contract between backend and frontend").
//
// EVERY function here matches one endpoint on HD's real middleware:
//   getMission        -> GET  /mission
//   createMission     -> POST /
//   getAgents         -> GET  /agents
//   createAgent       -> POST /agent
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
import { agents as seedAgents, actions as seedActions, auditLog as seedAuditLog, missions as seedMissions } from "./mockData";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ""; // set in .env.local - see README

// In-memory mutable store standing in for the database during frontend dev.
// Still used by createMission/createAgent/getMission/getActionStatus below,
// which stay mock for now - see the comment on each for why.
let _missions: Mission[] = [...seedMissions];
let _agents: Agent[] = [...seedAgents];
let _actions: AgentAction[] = [...seedActions];
let _audit: AuditEvent[] = [...seedAuditLog];

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

function nextHash() {
  return Math.random().toString(16).slice(2, 18).padEnd(16, "0");
}

function pushAudit(entry: Omit<AuditEvent, "id" | "hash" | "prevHash" | "time">) {
  const prevHash = _audit.length ? _audit[_audit.length - 1].hash : "0000000000000000";
  const now = new Date();
  const time = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")} ${now.getHours() >= 12 ? "PM" : "AM"}`;
  const event: AuditEvent = {
    id: `e${_audit.length + 1}`,
    time,
    hash: nextHash(),
    prevHash,
    ...entry,
  };
  _audit = [..._audit, event];
  return event;
}

// GET /mission
export async function getMission(missionId?: string): Promise<Mission | undefined> {
  await delay();
  return missionId ? _missions.find((m) => m.id === missionId) : _missions[0];
}

// POST /  (declare a mission)
export async function createMission(description: string, scope: string[]): Promise<Mission> {
  await delay();
  const mission: Mission = {
    id: `m${_missions.length + 1}`,
    description,
    scope,
    hash: Math.random().toString(16).slice(2, 18),
    createdAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
  _missions = [..._missions, mission];
  pushAudit({
    agentName: "System",
    what: `Mission declared: "${description}"`,
    result: "Mission stored",
    type: "allowed",
  });
  return mission;
}

// GET /agents (real - wired to the backend)
export async function getAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/agents`);
  const summaries = (await res.json()) as { id: string; name: string; status: string; mission: string | null }[];

  return summaries.map((a) => ({
    id: a.id,
    name: a.name,
    // AgentSummary doesn't expose the mission's own id, only its text - not
    // read anywhere in the UI today, so a placeholder is harmless for now.
    missionId: "",
    missionDescription: a.mission ?? "",
    status: a.status as Agent["status"],
    // AgentSummary doesn't expose the mission's scope - would need a
    // separate, unsigned way to read scope for display (open question,
    // not yet decided - see docs/CONTRACT.md). Empty until that's built.
    allowedActions: [],
    currentJob: undefined,
    // AgentSummary doesn't include createdAt either (only the fuller Agent
    // type does) - same open question as above.
    startedAt: "",
    parentAgentId: undefined, // delegation isn't built on the backend yet
  }));
}

// POST /agent
export async function createAgent(agent: Omit<Agent, "id" | "startedAt">): Promise<Agent> {
  await delay();
  const newAgent: Agent = {
    ...agent,
    id: `a${_agents.length + 1}`,
    startedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
  _agents = [..._agents, newAgent];
  pushAudit({
    agentName: newAgent.name,
    what: `Agent identity created, key pair generated`,
    result: "Started",
    type: "allowed",
  });
  return newAgent;
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

  return list.map((p) => ({
    id: p.id,
    agentId: p.agentId,
    agentName: p.agentName,
    // PendingApproval doesn't separate a raw type from the human-readable
    // label the way our AgentAction does - both get the same string.
    type: p.actionAttempted,
    label: p.actionAttempted,
    inBounds: false, // dead field on our side - never read, kept for shape compatibility
    status: "pending",
    missionDescription: p.mission,
    flagType: toFlagType(p.flagType),
    reason: p.reason,
    permittedNote: undefined, // backend's reason covers both gates in one sentence for now
    payload: undefined, // backend sends a narrative `context` string, not key/value pairs
    requestedAt: p.timestamp,
  }));
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

  return entries.map((e) => ({
    id: e.id,
    time: formatTime(e.timestamp),
    // AuditEntry only carries agentId, not a display name - resolved here
    // against the agent list, same join the backend's own /pending route
    // does internally.
    agentName: nameById.get(e.agentId) ?? "System",
    what: e.detail,
    result: EVENT_RESULT[e.event] ?? e.event,
    type: toAuditEventType(e.type),
    flagType: toFlagType(e.flagType),
    hash: e.hash,
    prevHash: e.previousHash,
  }));
}
