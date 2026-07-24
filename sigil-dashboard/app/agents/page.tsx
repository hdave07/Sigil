"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAgents, getAgentMission, getAuditLog, getPendingActions, type AgentMission } from "@/lib/api";
import { Agent, AgentAction, AgentStatus, AuditEvent, AuditEventType } from "@/lib/types";
import Badge from "@/components/Badge";
import FlagTag from "@/components/FlagTag";
import { ACTION_TYPE_LABELS } from "@/lib/actionTypes";

const statusColor: Record<AgentStatus, "green" | "orange" | "red" | "gray"> = {
  idle: "gray",
  running: "green",
  paused: "orange",
  waiting: "orange",
  completed: "gray",
  stopped: "red",
};

const statusLabel: Record<AgentStatus, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
  waiting: "Waiting",
  completed: "Completed",
  stopped: "Stopped",
};

// TODO: once the real backend is live, confirm whether we should trust
// agent.status directly instead of deriving "paused" client-side here — the
// backend already tracks "paused" (and "waiting") as real states, and we
// haven't confirmed whether their semantics match what we derive below from
// pending-approval count. Until then, this keeps our existing derivation and
// just passes through any other backend value unchanged.
//
// Terminal states ("stopped", "completed") always win. Otherwise an agent
// displays as "paused" if anything's pending, or its raw status if not.
function displayStatus(agent: Agent, pendingCount: number): AgentStatus {
  if (agent.status === "stopped" || agent.status === "completed") return agent.status;
  return pendingCount > 0 ? "paused" : agent.status;
}

function labelActions(types: string[]): string {
  return types.map((t) => ACTION_TYPE_LABELS[t] ?? t).join(", ");
}

const resultColor: Record<AuditEventType, string> = {
  allowed: "#3f7d52",
  blocked: "#a34a42",
  paused: "#bb6d4a",
  human: "#bb6d4a",
};

type FilterKey = "all" | "running" | "waiting";

// Keeps parent/child agents adjacent so delegated agents render indented
// directly under the agent that spawned them. Children whose parent isn't in
// the current (filtered) list are left un-indented since there's no parent
// row above them to nest under.
function withDelegationOrder(list: Agent[]): Agent[] {
  const childrenByParent = new Map<string, Agent[]>();
  const roots: Agent[] = [];
  for (const a of list) {
    if (a.parentAgentId && list.some((p) => p.id === a.parentAgentId)) {
      const siblings = childrenByParent.get(a.parentAgentId) ?? [];
      siblings.push(a);
      childrenByParent.set(a.parentAgentId, siblings);
    } else {
      roots.push(a);
    }
  }
  const ordered: Agent[] = [];
  for (const root of roots) {
    ordered.push(root);
    ordered.push(...(childrenByParent.get(root.id) ?? []));
  }
  return ordered;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pending, setPending] = useState<AgentAction[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mission, setMission] = useState<AgentMission | null>(null);

  useEffect(() => {
    Promise.all([getAgents(), getPendingActions(), getAuditLog()]).then(([a, p, log]) => {
      setAgents(a);
      setPending(p);
      setAuditLog(log);
      setSelectedId((current) => current ?? a[0]?.id ?? null);
      setLoading(false);
    });
  }, []);

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setMission(null);
      return;
    }
    let cancelled = false;
    getAgentMission(selected.id).then((m) => {
      if (!cancelled) setMission(m ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const waitingAgentIds = new Set(pending.map((p) => p.agentId));
  const pendingCountByAgent = new Map<string, number>();
  for (const p of pending) {
    pendingCountByAgent.set(p.agentId, (pendingCountByAgent.get(p.agentId) ?? 0) + 1);
  }

  const runningCount = agents.filter(
    (a) => displayStatus(a, pendingCountByAgent.get(a.id) ?? 0) === "running"
  ).length;

  const filteredAgents =
    filter === "all"
      ? agents
      : filter === "running"
      ? agents.filter((a) => displayStatus(a, pendingCountByAgent.get(a.id) ?? 0) === "running")
      : agents.filter((a) => waitingAgentIds.has(a.id));

  function toggleFilter(key: FilterKey) {
    setFilter((f) => (f === key ? "all" : key));
  }

  const sectionLabel =
    filter === "running" ? "Running agents" : filter === "waiting" ? "Agents waiting for your decision" : "Active agents";

  const selectedPending = selected ? pending.filter((p) => p.agentId === selected.id) : [];
  const selectedStatus: AgentStatus = selected ? displayStatus(selected, selectedPending.length) : "running";
  const selectedAudit = selected ? auditLog.filter((e) => e.agentName === selected.name) : [];
  const parentAgent = selected?.parentAgentId ? agents.find((a) => a.id === selected.parentAgentId) : undefined;
  const childAgents = selected ? agents.filter((a) => a.parentAgentId === selected.id) : [];

  const orderedAgents = withDelegationOrder(filteredAgents);

  return (
    <div className="flex flex-col h-full p-9 overflow-hidden">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink mb-1">Dashboard</h1>
          <p className="text-[13px] text-gray-500">Overview of all active agents and pending decisions</p>
        </div>
        <Link
          href="/setup"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-[0_4px_16px_-4px_rgba(74,78,105,0.45)]"
        >
          <span className="text-base leading-none">+</span> Declare a mission
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Active agents"
          value={agents.length}
          color="text-ink"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatCard
          label="Running"
          value={runningCount}
          color="text-green"
          active={filter === "running"}
          onClick={() => toggleFilter("running")}
        />
        <StatCard
          label="Waiting for your decision"
          value={waitingAgentIds.size}
          color="text-orange"
          active={filter === "waiting"}
          emphasize={waitingAgentIds.size > 0}
          onClick={() => toggleFilter("waiting")}
        />
      </div>

      <div className="grid grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-y-auto">
          <div className="px-5 py-3.5 border-b border-hairline font-semibold text-[13px] text-ink flex items-center gap-2 sticky top-0 bg-white z-10">
            {sectionLabel}
            {filter !== "all" && (
              <button
                onClick={() => setFilter("all")}
                className="ml-auto text-[11px] font-medium text-accent hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-zebra eyebrow">
                <th className="text-left px-4 py-2.5">Agent</th>
                <th className="text-left px-4 py-2.5">Current job</th>
                <th className="text-left px-4 py-2.5">Allowed to do</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Started</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filteredAgents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    {agents.length === 0
                      ? "No agents yet — declare a mission to start one."
                      : "No agents match this filter."}
                  </td>
                </tr>
              )}
              {orderedAgents.map((a) => {
                const parent = a.parentAgentId ? agents.find((p) => p.id === a.parentAgentId) : undefined;
                const isNestedChild = Boolean(parent) && filteredAgents.some((f) => f.id === parent!.id);
                const aStatus = displayStatus(a, pendingCountByAgent.get(a.id) ?? 0);
                return (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`border-b border-hairline last:border-none cursor-pointer hover:bg-zebra ${
                      a.id === selectedId ? "bg-accent/[0.13]" : ""
                    }`}
                  >
                    <td
                      className={`px-4 py-2.5 font-semibold text-accent ${isNestedChild ? "pl-9" : ""} ${
                        a.id === selectedId ? "border-l-[5px] border-l-accent" : "border-l-[5px] border-l-transparent"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1">
                          {isNestedChild && <span className="text-lineageText font-normal">↳</span>}
                          {a.name}
                        </span>
                        {isNestedChild && (
                          <span className="text-[10px] font-normal text-lineageText/70">
                            delegated by {parent!.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{a.currentJob}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-[12px]">{labelActions(a.allowedActions)}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={statusColor[aStatus]}>{statusLabel[aStatus]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-[12px]">{a.startedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-border rounded-xl shadow-sm overflow-y-auto">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
              Select an agent to see its details
            </div>
          )}
          {selected && (
            <div>
              <div className="px-5 py-3.5 border-b border-hairline flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-bold text-ink">{selected.name}</div>
                  <div className="text-xs text-gray-500">
                    {selected.currentJob} · started {selected.startedAt}
                  </div>
                </div>
                <Badge color={statusColor[selectedStatus]}>{statusLabel[selectedStatus]}</Badge>
              </div>

              <div className="p-5">
                {selectedPending.length > 0 && (
                  <div className="bg-orange/[0.07] border border-orange/30 rounded-lg p-3.5 mb-5 shadow-[0_2px_14px_-6px_rgba(187,109,74,0.35)]">
                    <div className="text-[12px] font-bold text-orange uppercase tracking-wide mb-2">
                      Needs your decision
                    </div>
                    {selectedPending.map((p) => (
                      <div key={p.id} className="mb-2.5 last:mb-0">
                        <div className="text-sm font-semibold text-ink mb-0.5">{p.label}</div>
                        <div className="text-[11px] text-gray-500 mb-1.5">{p.requestedAt}</div>
                        <Link
                          href={`/approvals?actionId=${p.id}`}
                          className="text-[11px] font-semibold text-accent hover:underline"
                        >
                          Review in approval queue →
                        </Link>
                      </div>
                    ))}
                    {selected.status === "running" && (
                      <div className="text-[11px] text-gray-500 mt-2.5 pt-2.5 border-t border-orange/20">
                        Meanwhile, still running: {selected.currentJob}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-accent/[0.045] border border-accent/20 rounded-lg p-4 mb-4">
                  <div className="mb-3">
                    <div className="eyebrow mb-1">Mission</div>
                    <div className="text-[13px] leading-relaxed">{mission?.text ?? selected.missionDescription}</div>
                  </div>
                  <div>
                    <div className="eyebrow mb-1">Mission hash</div>
                    <span className="font-mono text-[11px] bg-ink text-[#7ee89a] px-2 py-0.5 rounded inline-block">
                      {mission ? <>{mission.hash.slice(0, 12)}…</> : "…"}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="eyebrow mb-2">Allowed to do</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.allowedActions.map((action) => (
                      <span key={action} className="badge bg-gray-100 text-gray-500 font-medium">
                        {ACTION_TYPE_LABELS[action] ?? action}
                      </span>
                    ))}
                  </div>
                </div>

                {(parentAgent || childAgents.length > 0) && (
                  <div className="mb-4">
                    <div className="eyebrow mb-2">Delegation</div>
                    {parentAgent && (
                      <button
                        onClick={() => setSelectedId(parentAgent.id)}
                        className="w-full text-left bg-lineage/[0.05] border border-lineage/25 rounded-lg p-3 mb-2 last:mb-0 hover:bg-lineage/[0.09] transition-colors"
                      >
                        <div className="text-[11px] text-gray-500 mb-0.5">Delegated by</div>
                        <div className="text-sm font-semibold text-lineageText">{parentAgent.name}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          This agent's scope ({labelActions(selected.allowedActions)}) is narrower than{" "}
                          {parentAgent.name}'s ({labelActions(parentAgent.allowedActions)}).
                        </div>
                      </button>
                    )}
                    {childAgents.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => setSelectedId(child.id)}
                        className="w-full text-left bg-lineage/[0.05] border border-lineage/25 rounded-lg p-3 mb-2 last:mb-0 hover:bg-lineage/[0.09] transition-colors"
                      >
                        <div className="text-[11px] text-gray-500 mb-0.5">Delegated to</div>
                        <div className="text-sm font-semibold text-lineageText">{child.name}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          Given a narrower scope: {labelActions(child.allowedActions)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <div className="eyebrow mb-2">This agent's activity</div>
                  {selectedAudit.length === 0 && (
                    <div className="text-sm text-gray-400">No activity recorded yet.</div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {selectedAudit.map((ev) => (
                      <div key={ev.id} className="text-[11px] border-b border-hairline last:border-none pb-1.5">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-gray-400">{ev.time}</span>
                          <span className="flex items-center gap-1">
                            <span
                              className="badge whitespace-nowrap text-[10px]"
                              style={{ background: `${resultColor[ev.type]}15`, color: resultColor[ev.type] }}
                            >
                              {ev.result}
                            </span>
                            <FlagTag flagType={ev.flagType} />
                          </span>
                        </div>
                        <div className="text-gray-600">{ev.what}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  emphasize,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  emphasize?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left border rounded-xl px-5 py-4 transition-all ${
        emphasize
          ? "bg-orange/[0.16] border-orange/60 shadow-[0_4px_18px_-4px_rgba(187,109,74,0.4)] hover:border-orange/80 hover:shadow-[0_6px_22px_-4px_rgba(187,109,74,0.5)]"
          : "bg-white border-border shadow-sm hover:border-gray-300 hover:shadow-md"
      } ${active ? "ring-2 ring-accent/25 border-accent/60" : ""}`}
    >
      <div className={`font-bold mb-0.5 ${color} ${emphasize ? "text-3xl" : "text-2xl"}`}>{value}</div>
      <div className={`text-xs ${emphasize ? "text-orange font-medium" : "text-gray-500"}`}>{label}</div>
    </button>
  );
}
