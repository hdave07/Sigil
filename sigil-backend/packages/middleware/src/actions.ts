/**
 * Stateful action-attempt tracking: pause / approve / resume.
 *
 * mission.ts's checkAction stays pure and side-effect free by design (see
 * its file header). This module is the side-effecting layer wrapped around
 * it: every attempt and every human decision is written to the audit log
 * from here, so "every action outcome is logged" is guaranteed by the
 * store, not left to callers to remember.
 */

import { checkAction } from "./mission.js";
import type { AuditLog } from "./audit.js";
import type {
  ActionAttempt,
  ActionOutcome,
  ActionVerdict,
  Decision,
  Mission,
} from "./contract.js";

type ActionInput = Pick<ActionAttempt, "type" | "target" | "detail">;

interface ActionRecord {
  attempt: ActionAttempt;
  outcome: ActionOutcome;
  decision: Decision;
}

export interface ActionStore {
  attempt(
    mission: Mission,
    action: ActionInput
  ): Promise<{ attempt: ActionAttempt; outcome: ActionOutcome }>;
  /** undefined means "no action with this id was ever recorded" (404 territory). */
  status(actionId: string): Decision | undefined;
  /**
   * Only succeeds if the stored decision is currently "pending" - guards
   * against re-deciding an already-decided or never-paused action.
   * Returns the new Decision, or undefined if the guard failed.
   */
  decide(actionId: string, decision: "approved" | "denied"): Promise<Decision | undefined>;
  /** Every action currently awaiting a human decision, across all agents. */
  pending(): { attempt: ActionAttempt; outcome: ActionOutcome }[];
  /** The most recently attempted action for this agent, if any. */
  getCurrentForAgent(agentId: string): ActionAttempt | undefined;
}

function initialDecision(verdict: ActionVerdict): Decision {
  if (verdict === "pause") return "pending";
  if (verdict === "deny") return "denied";
  return "approved"; // "allow" is cleared immediately
}

export function createActionStore(auditLog: AuditLog): ActionStore {
  const records = new Map<string, ActionRecord>();

  async function attempt(
    mission: Mission,
    action: ActionInput
  ): Promise<{ attempt: ActionAttempt; outcome: ActionOutcome }> {
    const fullAttempt: ActionAttempt = {
      id: crypto.randomUUID(),
      agentId: mission.agentId,
      missionId: mission.id,
      type: action.type,
      target: action.target,
      detail: action.detail,
      createdAt: new Date().toISOString(),
    };

    const result = checkAction(mission, action); // pure, synchronous - unmodified

    const outcome: ActionOutcome = {
      actionId: fullAttempt.id,
      verdict: result.verdict,
      reason: result.reason,
      ...(result.flagType !== undefined ? { flagType: result.flagType } : {}),
      ...(result.verdict === "pause" ? { statusId: fullAttempt.id } : {}),
    };

    records.set(fullAttempt.id, {
      attempt: fullAttempt,
      outcome,
      decision: initialDecision(result.verdict),
    });

    const event =
      result.verdict === "pause" ? "action.paused" : result.verdict === "deny" ? "action.denied" : "action.allowed";
    const type =
      result.verdict === "pause" ? "paused" : result.verdict === "deny" ? "blocked" : "allowed";

    await auditLog.append({
      agentId: mission.agentId,
      event,
      type,
      detail: `${action.type} on "${action.target}" - ${result.reason}`,
      ...(result.flagType !== undefined ? { flagType: result.flagType } : {}),
    });

    return { attempt: fullAttempt, outcome };
  }

  function status(actionId: string): Decision | undefined {
    return records.get(actionId)?.decision;
  }

  async function decide(
    actionId: string,
    decision: "approved" | "denied"
  ): Promise<Decision | undefined> {
    const record = records.get(actionId);
    if (!record || record.decision !== "pending") return undefined;

    record.decision = decision;

    await auditLog.append({
      agentId: record.attempt.agentId,
      event: decision === "approved" ? "action.approved" : "action.denied",
      type: "human",
      detail: `${record.attempt.type} on "${record.attempt.target}" ${decision} by human review.`,
    });

    return decision;
  }

  function pending(): { attempt: ActionAttempt; outcome: ActionOutcome }[] {
    const result: { attempt: ActionAttempt; outcome: ActionOutcome }[] = [];
    for (const record of records.values()) {
      if (record.decision === "pending") result.push({ attempt: record.attempt, outcome: record.outcome });
    }
    return result;
  }

  function getCurrentForAgent(agentId: string): ActionAttempt | undefined {
    let latest: ActionRecord | undefined;
    for (const record of records.values()) {
      if (record.attempt.agentId !== agentId) continue;
      if (!latest || record.attempt.createdAt > latest.attempt.createdAt) latest = record;
    }
    return latest?.attempt;
  }

  return { attempt, status, decide, pending, getCurrentForAgent };
}
