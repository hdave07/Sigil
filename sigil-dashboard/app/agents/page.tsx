"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAgents, getAuditLog, getMission, getPendingActions } from "@/lib/api";
import { Agent, AgentAction, AuditEvent, AuditEventType, Mission } from "@/lib/types";
import Badge from "@/components/Badge";

const statusColor: Record<Agent["status"], "green" | "orange" | "red" | "blue"> = {
  running: "green",
  paused: "orange",
  waiting: "blue",
  done: "red",
};

const resultColor: Record<AuditEventType, string> = {
  allowed: "#1abc6e",
  blocked: "#e74c3c",
  paused: "#e67e22",
  human: "#e67e22",
};

type FilterKey = "all" | "running" | "waiting";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pending, setPending] = useState<AgentAction[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);

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
    getMission(selected.missionId).then((m) => {
      if (!cancelled) setMission(m ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const runningCount = agents.filter((a) => a.status === "running").length;
  const waitingAgentIds = new Set(pending.map((p) => p.agentId));

  const filteredAgents =
    filter === "all"
      ? agents
      : filter === "running"
      ? agents.filter((a) => a.status === "running")
      : agents.filter((a) => waitingAgentIds.has(a.id));

  function toggleFilter(key: FilterKey) {
    setFilter((f) => (f === key ? "all" : key));
  }

  const sectionLabel =
    filter === "running" ? "Running agents" : filter === "waiting" ? "Agents waiting for your decision" : "Active agents";

  const selectedPending = selected ? pending.filter((p) => p.agentId === selected.id) : [];
  const selectedAudit = selected ? auditLog.filter((e) => e.agentName === selected.name) : [];

  return (
    <div className="flex flex-col h-full p-8 overflow-hidden">
      <h1 className="text-xl font-semibold mb-1">Agents</h1>
      <p className="text-gray-500 mb-6">Overview of all active agents and pending decisions</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Active agents"
          value={agents.length}
          color="text-green"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatCard
          label="Running"
          value={runningCount}
          color="text-accent"
          active={filter === "running"}
          onClick={() => toggleFilter("running")}
        />
        <StatCard
          label="Waiting for your decision"
          value={pending.length}
          color="text-orange"
          active={filter === "waiting"}
          onClick={() => toggleFilter("waiting")}
        />
      </div>

      <div className="grid grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
        <div className="bg-white border border-border rounded-lg overflow-y-auto">
          <div className="px-5 py-3.5 border-b border-[#e8e8ec] font-semibold flex items-center gap-2 sticky top-0 bg-white z-10">
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
              <tr className="bg-[#f8f8fa] text-[11px] font-semibold text-gray-400">
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
              {filteredAgents.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`border-b border-[#f0f0f3] last:border-none cursor-pointer hover:bg-[#fafafa] ${
                    a.id === selectedId ? "bg-[#eef1ff]" : ""
                  }`}
                >
                  <td
                    className={`px-4 py-2.5 font-medium text-accent ${
                      a.id === selectedId ? "border-l-4 border-l-accent" : ""
                    }`}
                  >
                    {a.name}
                  </td>
                  <td className="px-4 py-2.5">{a.currentJob}</td>
                  <td className="px-4 py-2.5 text-gray-500">{a.allowedActions.join(", ")}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={statusColor[a.status]}>{a.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400">{a.startedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-border rounded-lg overflow-y-auto">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
              Select an agent to see its details
            </div>
          )}
          {selected && (
            <div>
              <div className="px-5 py-3.5 border-b border-[#f0f0f3] flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{selected.name}</div>
                  <div className="text-xs text-gray-500">
                    {selected.currentJob} · started {selected.startedAt}
                  </div>
                </div>
                <Badge color={statusColor[selected.status]}>{selected.status}</Badge>
              </div>

              <div className="p-5">
                <div className="bg-[#f7f8ff] border border-[#d4daff] rounded-lg p-4 mb-4">
                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Mission</div>
                    <div className="text-sm">{mission?.description ?? selected.missionDescription}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Mission hash</div>
                    <span className="font-mono text-[11px] bg-ink text-[#7ee89a] px-2 py-0.5 rounded inline-block">
                      {mission ? mission.hash : "…"}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Allowed to do</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.allowedActions.map((action) => (
                      <span key={action} className="badge bg-[#f0f0f3] text-gray-600">
                        {action}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Pending decision</div>
                  {selectedPending.length === 0 && (
                    <div className="text-sm text-gray-400">Nothing waiting on you for this agent.</div>
                  )}
                  {selectedPending.map((p) => (
                    <div key={p.id} className="bg-[#fffbf5] border border-[#f5dfb8] rounded-lg p-3 mb-2 last:mb-0">
                      <div className="text-sm font-semibold mb-0.5">{p.label}</div>
                      <div className="text-[11px] text-gray-500 mb-2">{p.requestedAt}</div>
                      <Link
                        href={`/approvals?actionId=${p.id}`}
                        className="text-[11px] font-medium text-accent hover:underline"
                      >
                        Review in approval queue →
                      </Link>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-gray-500 uppercase mb-2">This agent's activity</div>
                  {selectedAudit.length === 0 && (
                    <div className="text-sm text-gray-400">No activity recorded yet.</div>
                  )}
                  <div className="flex flex-col gap-2">
                    {selectedAudit.map((ev) => (
                      <div key={ev.id} className="text-[12px] border-b border-[#f0f0f3] last:border-none pb-2">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-gray-400">{ev.time}</span>
                          <span
                            className="badge whitespace-nowrap"
                            style={{ background: `${resultColor[ev.type]}18`, color: resultColor[ev.type] }}
                          >
                            {ev.result}
                          </span>
                        </div>
                        <div>{ev.what}</div>
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
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white border rounded-lg px-5 py-4 transition-colors ${
        active ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-gray-300"
      }`}
    >
      <div className={`text-2xl font-bold mb-0.5 ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </button>
  );
}
