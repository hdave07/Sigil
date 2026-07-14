// Shared types for the Sigil dashboard.
// These mirror the endpoint contract in the build brief (Part 4) so swapping
// the mock API in lib/api.ts for HD's real endpoints is a drop-in change.

export type AgentStatus = "running" | "paused" | "waiting" | "done";
export type ActionStatus = "pending" | "approved" | "denied";
export type AuditEventType = "allowed" | "blocked" | "paused" | "human";

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
  reason?: string; // why it was flagged, shown when out of bounds
  payload?: Record<string, string>;
  requestedAt: string;
}

export interface AuditEvent {
  id: string;
  time: string;
  agentName: string;
  what: string;
  result: string;
  type: AuditEventType;
  hash: string;
  prevHash: string;
}
