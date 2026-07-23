/**
 * Agent registration + lookup.
 *
 * Registration (POST /agent) and every later signed request are separate
 * HTTP calls, possibly far apart in time - so unlike a demo script's local
 * Map, this store needs to live for as long as the server runs, not just
 * for one script's execution.
 */

import type { Agent, AgentStatus } from "./contract.js";

export interface RegisterAgentInput {
  name: string;
  publicKeyJwk: JsonWebKey;
}

export interface AgentStore {
  register(input: RegisterAgentInput): Agent;
  /** undefined means "no agent with this id was ever registered" (404 territory). */
  get(agentId: string): Agent | undefined;
  /** Convenience accessor for signature verification, which only needs the key. */
  getPublicKeyJwk(agentId: string): JsonWebKey | undefined;
  setStatus(agentId: string, status: AgentStatus): void;
  all(): Agent[];
}

/** In-memory agent store factory. One instance per running middleware/demo. */
export function createAgentStore(): AgentStore {
  const agents = new Map<string, Agent>();

  function register(input: RegisterAgentInput): Agent {
    const agent: Agent = {
      id: crypto.randomUUID(),
      name: input.name,
      publicKeyJwk: input.publicKeyJwk,
      status: "idle",
      createdAt: new Date().toISOString(),
    };
    agents.set(agent.id, agent);
    return agent;
  }

  function get(agentId: string): Agent | undefined {
    return agents.get(agentId);
  }

  function getPublicKeyJwk(agentId: string): JsonWebKey | undefined {
    return agents.get(agentId)?.publicKeyJwk;
  }

  function setStatus(agentId: string, status: AgentStatus): void {
    const agent = agents.get(agentId);
    if (agent) agent.status = status;
  }

  function all(): Agent[] {
    return [...agents.values()];
  }

  return { register, get, getPublicKeyJwk, setStatus, all };
}
