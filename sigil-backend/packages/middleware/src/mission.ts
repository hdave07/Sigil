/**
 * Mission declaration + deterministic enforcement.
 *
 * NOT an LLM in this file, by design - checkAction is a pure, synchronous
 * lookup so that property is visually obvious at the call site.
 */

import { sha256Hex } from "../../aauth-core/src/index.js";
import type {
  ActionAttempt,
  ActionVerdict,
  FlagType,
  Mission,
  MissionScope,
} from "./contract.js";

export interface DeclareMissionInput {
  agentId: string;
  text: string;
  scope: MissionScope;
}

/** Build a full Mission record, including a tamper-evident hash over its content. */
export async function declareMission(input: DeclareMissionInput): Promise<Mission> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const canonical = JSON.stringify({
    agentId: input.agentId,
    text: input.text,
    scope: input.scope,
  });
  const hash = await sha256Hex(canonical);
  return { id, agentId: input.agentId, text: input.text, scope: input.scope, hash, createdAt };
}

export interface CheckActionResult {
  verdict: ActionVerdict;
  flagType?: FlagType;
  reason: string;
}

type ActionInput = Pick<ActionAttempt, "type" | "target" | "detail">;

/**
 * Two-phase deterministic check - see MissionScope's doc comment in
 * contract.ts for the phase ordering this implements.
 */
export function checkAction(mission: Mission, action: ActionInput): CheckActionResult {
  const { allow, requireApproval, offMissionKeywords } = mission.scope;

  // Phase 1a: is this action type always sensitive, regardless of mission?
  if (requireApproval.includes(action.type)) {
    return {
      verdict: "pause",
      flagType: "needs_approval",
      reason: `"${action.type}" is a sensitive action type that always requires human approval.`,
    };
  }

  // Phase 1b: was this action type ever granted to this mission at all?
  if (!allow.includes(action.type)) {
    return {
      verdict: "pause",
      flagType: "not_permitted",
      reason: `"${action.type}" was never declared in this mission's scope (not in allow or requireApproval).`,
    };
  }

  // Phase 2: the type is fully permitted - does THIS instance actually fit the mission?
  const haystack = `${action.target} ${action.detail}`.toLowerCase();
  const tripped = offMissionKeywords.find((kw) => haystack.includes(kw.toLowerCase()));
  if (tripped) {
    return {
      verdict: "pause",
      flagType: "off_mission",
      reason: `"${action.type}" is an allowed action type, but this action ("${tripped}" detected) doesn't fit the mission "${mission.text}".`,
    };
  }

  return {
    verdict: "allow",
    reason: `"${action.type}" is within the mission's allowed action types and fits the mission's intent.`,
  };
}
