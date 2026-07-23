/**
 * Mission storage + lookup.
 *
 * mission.ts's declareMission() is pure - it builds a Mission object but
 * doesn't remember it anywhere. On a server, POST /mission and POST /action
 * are separate requests, so something needs to hold onto the result between
 * them. Two lookups are needed, answering two different questions:
 *   - "give me mission X specifically" (byId) - must keep working forever,
 *     even after the agent declares a newer mission.
 *   - "what is agent Y currently working on" (getForAgent) - always the
 *     most recently declared mission for that agent.
 */

import { declareMission as declareMissionPure } from "./mission.js";
import type { Mission, MissionScope } from "./contract.js";

export interface DeclareMissionInput {
  agentId: string;
  text: string;
  scope: MissionScope;
}

export interface MissionStore {
  declare(input: DeclareMissionInput): Promise<Mission>;
  /** undefined means "no mission with this id was ever declared" (404 territory). */
  getById(missionId: string): Mission | undefined;
  /** undefined means "this agent has never declared a mission." */
  getForAgent(agentId: string): Mission | undefined;
}

/** In-memory mission store factory. One instance per running middleware/demo. */
export function createMissionStore(): MissionStore {
  const byId = new Map<string, Mission>();
  const currentByAgent = new Map<string, string>(); // agentId -> missionId, overwritten each declare()

  async function declare(input: DeclareMissionInput): Promise<Mission> {
    const mission = await declareMissionPure(input); // pure, unchanged
    byId.set(mission.id, mission);
    currentByAgent.set(input.agentId, mission.id);
    return mission;
  }

  function getById(missionId: string): Mission | undefined {
    return byId.get(missionId);
  }

  function getForAgent(agentId: string): Mission | undefined {
    const missionId = currentByAgent.get(agentId);
    return missionId !== undefined ? byId.get(missionId) : undefined;
  }

  return { declare, getById, getForAgent };
}
