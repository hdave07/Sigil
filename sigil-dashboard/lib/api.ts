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

import { Agent, AgentAction, AuditEvent, Mission } from "./types";
import { agents as seedAgents, actions as seedActions, auditLog as seedAuditLog, missions as seedMissions } from "./mockData";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ""; // set this when the real backend is ready

// In-memory mutable store standing in for the database during frontend dev.
let _missions: Mission[] = [...seedMissions];
let _agents: Agent[] = [...seedAgents];
let _actions: AgentAction[] = [...seedActions];
let _audit: AuditEvent[] = [...seedAuditLog];

const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

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

// GET /agents
export async function getAgents(): Promise<Agent[]> {
  await delay();
  return _agents;
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

// GET /pending
export async function getPendingActions(): Promise<AgentAction[]> {
  await delay();
  return _actions.filter((a) => a.status === "pending");
}

// GET /action/:id/status
export async function getActionStatus(actionId: string): Promise<AgentAction["status"] | undefined> {
  await delay(150);
  return _actions.find((a) => a.id === actionId)?.status;
}

// POST /action/:id/status  (approve / deny / stop)
export async function decideAction(
  actionId: string,
  decision: "approve" | "deny" | "stop"
): Promise<AgentAction | undefined> {
  await delay();
  const action = _actions.find((a) => a.id === actionId);
  if (!action) return undefined;

  action.status = decision === "approve" ? "approved" : "denied";
  _actions = _actions.map((a) => (a.id === actionId ? action : a));

  if (decision === "approve") {
    _agents = _agents.map((ag) => (ag.name === action.agentName ? { ...ag, status: "running" } : ag));
    pushAudit({
      agentName: action.agentName,
      what: `Resumed after your approval — executing: ${action.label}`,
      result: "Resumed",
      type: "human",
    });
  } else if (decision === "deny") {
    pushAudit({
      agentName: action.agentName,
      what: `You denied: ${action.label}`,
      result: "Denied — agent continues without this action",
      type: "human",
    });
  } else {
    _agents = _agents.map((ag) => (ag.name === action.agentName ? { ...ag, status: "done" } : ag));
    pushAudit({
      agentName: action.agentName,
      what: `You stopped the agent`,
      result: "Agent shut down",
      type: "human",
    });
  }
  return action;
}

// GET /audit
export async function getAuditLog(): Promise<AuditEvent[]> {
  await delay();
  return _audit;
}
