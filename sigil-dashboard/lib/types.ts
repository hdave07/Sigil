// Shared types for the Sigil dashboard.
// These mirror the endpoint contract in the build brief (Part 4) so swapping
// the mock API in lib/api.ts for HD's real endpoints is a drop-in change.

// The backend's contract (docs/CONTRACT.md) defines AgentStatus as "idle" |
// "running" | "paused" | "waiting" | "completed" — "paused" is a real stored
// value on their side, not derived. We keep "stopped" alongside it for now
// since lib/mockData.ts and lib/api.ts still set that value directly; once
// the real backend is live we should confirm whether "stopped" maps to
// "completed" or should go away entirely. See the TODO on displayStatus()
// in app/agents/page.tsx for the "paused" derivation this affects.
export type AgentStatus = "idle" | "running" | "paused" | "waiting" | "completed" | "stopped";
export type ActionStatus = "pending" | "approved" | "denied";
export type AuditEventType = "allowed" | "blocked" | "paused" | "human";
// Why a paused/flagged action is waiting on a human:
//   "not_permitted" — the action isn't in the agent's allowed actions at all.
//   "off_mission"   — the action IS permitted, but doesn't fit what the agent
//                      was told to do right now. The more interesting case:
//                      it's not a permission failure, it's a fit failure.
export type FlagType = "not_permitted" | "off_mission";

export interface Mission {
  id: string;
  description: string; // the plain-language field
  scope: string[]; // resolved allowlist behind the plain-language field (v0, per brief)
  hash: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  missionId: string;
  missionDescription: string;
  status: AgentStatus;
  allowedActions: string[];
  currentJob?: string;
  startedAt: string;
  parentAgentId?: string; // set when this agent was spawned by another agent (delegation)
}

export interface AgentAction {
  id: string;
  agentId: string;
  agentName: string;
  type: string; // e.g. "send_email", "read_webpage", "write_file"
  label: string; // human-readable "wants to..."
  inBounds: boolean;
  status: ActionStatus;
  missionDescription: string;
  flagType?: FlagType; // set on paused/flagged items; absent for in-bounds actions
  reason?: string; // why it was flagged. For off_mission, this is the "off-mission" side of the two gates.
  permittedNote?: string; // off_mission only — why the action itself IS allowed (the green gate)
  payload?: Record<string, string>;
  requestedAt: string;
}

export interface AuditEvent {
  id: string;
  time: string;
  agentName: string;
  what: string;
  result: string;
  type: AuditEventType; // the outcome — what the filter chips filter on today
  // The origin, separate from the outcome above: was this action ever
  // flagged, and if so how. Set once, when the action is first flagged, and
  // never changed afterward — even once `type`/`result` move on to
  // "allowed"/"Resumed" or "blocked". Without this, approving a paused
  // off-mission action collapses into an ordinary green row, indistinguishable
  // from an action that was always in-scope and never touched the queue.
  flagType?: FlagType;
  hash: string;
  prevHash: string;
}
