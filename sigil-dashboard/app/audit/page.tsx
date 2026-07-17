"use client";

import { useEffect, useState } from "react";
import { getAgents, getAuditLog } from "@/lib/api";
import { Agent, AuditEvent, AuditEventType, FlagType } from "@/lib/types";
import FlagTag from "@/components/FlagTag";

const resultColor: Record<AuditEventType, string> = {
  allowed: "#3f7d52",
  blocked: "#a34a42",
  paused: "#bb6d4a",
  human: "#bb6d4a",
};

const filters: { key: AuditEventType | "all"; label: string }[] = [
  { key: "all", label: "All events" },
  { key: "allowed", label: "Allowed actions" },
  { key: "blocked", label: "Blocked actions" },
  { key: "paused", label: "Paused for review" },
  { key: "human", label: "Your decisions" },
];

// A second, independent axis from the outcome filters above: not "what
// happened" but "was this ever flagged, and why." It's tracked separately so
// an off-mission action that later gets approved is still findable here —
// the outcome filters alone would show it as a plain "Allowed" row.
const flagFilters: { key: FlagType | "all"; label: string }[] = [
  { key: "all", label: "Any origin" },
  { key: "off_mission", label: "Off-mission" },
  { key: "not_permitted", label: "Not permitted" },
];

type ViewMode = "grouped" | "flat";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<AuditEventType | "all">("all");
  const [flagFilter, setFlagFilter] = useState<FlagType | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLog().then((e) => {
      setEvents(e);
      setLoading(false);
      // default-open the most recently active agent; the rest stay collapsed until clicked
      if (e.length > 0) {
        setExpandedAgents(new Set([e[e.length - 1].agentName]));
      }
    });
    getAgents().then(setAgents);
  }, []);

  function toggleAgent(agentName: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  }

  const rows = events.filter(
    (e) => (filter === "all" || e.type === filter) && (flagFilter === "all" || e.flagType === flagFilter)
  );

  const groups: { agentName: string; events: AuditEvent[]; lastIndex: number }[] = [];
  rows.forEach((ev, i) => {
    const group = groups.find((g) => g.agentName === ev.agentName);
    if (group) {
      group.events.push(ev);
      group.lastIndex = i;
    } else {
      groups.push({ agentName: ev.agentName, events: [ev], lastIndex: i });
    }
  });
  groups.sort((a, b) => b.lastIndex - a.lastIndex);

  // Same treatment as the Dashboard and the approval queue: a delegated
  // child's group sits directly under its parent's, indented, instead of
  // wherever recency would otherwise place it.
  const childGroupsByParentId = new Map<string, typeof groups>();
  const rootGroups: typeof groups = [];
  for (const group of groups) {
    const agent = agents.find((a) => a.name === group.agentName);
    const parent = agent?.parentAgentId ? agents.find((a) => a.id === agent.parentAgentId) : undefined;
    if (parent && groups.some((g) => g.agentName === parent.name)) {
      const siblings = childGroupsByParentId.get(parent.id) ?? [];
      siblings.push(group);
      childGroupsByParentId.set(parent.id, siblings);
    } else {
      rootGroups.push(group);
    }
  }
  const orderedGroups: typeof groups = [];
  for (const root of rootGroups) {
    orderedGroups.push(root);
    const rootAgent = agents.find((a) => a.name === root.agentName);
    orderedGroups.push(...(rootAgent ? childGroupsByParentId.get(rootAgent.id) ?? [] : []));
  }

  return (
    <div className="flex flex-col h-full p-9 overflow-y-auto">
      <h1 className="text-[26px] font-bold tracking-tight text-ink mb-1">Activity log</h1>
      <p className="text-[13px] text-gray-500 mb-5">
        A full record of everything your agents did, tried to do, and were stopped from doing
      </p>

      <div className="bg-ink text-gray-400 px-4 py-2.5 rounded-lg text-[11px] mb-5 flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7ee89a" strokeWidth="2.5">
          <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>
          Every entry in this log is cryptographically signed. Hashes are chained — altering any
          entry breaks the chain and is immediately detectable.
        </span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                filter === f.key ? "bg-gray-100 text-ink font-semibold" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-full border border-border overflow-hidden text-[11px] font-semibold shadow-sm">
          <button
            onClick={() => setViewMode("grouped")}
            className={`px-3.5 py-1.5 ${
              viewMode === "grouped" ? "bg-accent text-white" : "bg-white text-gray-600 hover:bg-zebra"
            }`}
          >
            Grouped by agent
          </button>
          <button
            onClick={() => setViewMode("flat")}
            className={`px-3.5 py-1.5 ${
              viewMode === "flat" ? "bg-accent text-white" : "bg-white text-gray-600 hover:bg-zebra"
            }`}
          >
            All activity
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-5">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">
          Flagged as
        </span>
        {flagFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFlagFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              flagFilter === f.key ? "bg-accent text-white font-semibold" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="bg-white border border-border rounded-xl shadow-sm flex-1 flex items-center justify-center text-gray-400">
          Loading…
        </div>
      )}

      {!loading && viewMode === "flat" && (
        <div className="bg-white border border-border rounded-xl shadow-sm flex-1 overflow-y-auto">
          {rows.length === 0 && <div className="p-5 text-gray-400">No activity matches this filter.</div>}
          {rows.map((ev, i) => (
            <div
              key={ev.id}
              className={`px-5 py-3 flex items-start gap-4 ${i !== 0 ? "border-t border-hairline" : ""}`}
            >
              <span className="text-[11px] text-gray-400 tabular-nums w-14 shrink-0 pt-0.5">{ev.time}</span>
              <span
                className={`text-[11px] font-semibold w-28 shrink-0 pt-0.5 ${
                  ev.agentName === "You" ? "text-orange" : "text-accent"
                }`}
              >
                {ev.agentName}
              </span>
              <span className="text-[13px] text-gray-600 flex-1 pt-0.5">{ev.what}</span>
              <span
                className="badge whitespace-nowrap shrink-0"
                style={{ background: `${resultColor[ev.type]}15`, color: resultColor[ev.type] }}
              >
                {ev.result}
              </span>
              <FlagTag flagType={ev.flagType} />
              <span className="font-mono text-[11px] bg-ink text-[#7ee89a] px-2 py-0.5 rounded shrink-0">
                {ev.hash.slice(0, 12)}…
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && viewMode === "grouped" && (
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-0.5">
          {groups.length === 0 && (
            <div className="bg-white border border-border rounded-xl shadow-sm p-5 text-gray-400">
              No activity matches this filter.
            </div>
          )}
          {orderedGroups.map((group) => {
            const isOpen = expandedAgents.has(group.agentName);
            const agent = agents.find((a) => a.name === group.agentName);
            const parent = agent?.parentAgentId ? agents.find((a) => a.id === agent.parentAgentId) : undefined;
            // Indicate the delegation even if the parent has no events of
            // its own under the current filter (so no group to nest under)
            // — the relationship is still worth surfacing.
            const isChild = Boolean(parent);
            return (
              <div
                key={group.agentName}
                className={`bg-white border border-border rounded-xl shadow-sm overflow-hidden ${
                  isChild ? "ml-8" : ""
                }`}
              >
                <button
                  onClick={() => toggleAgent(group.agentName)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-zebra transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {isChild && <span className="text-lineageText text-[13px]">↳</span>}
                    <div className="flex flex-col items-start">
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`text-[13px] font-semibold ${
                            group.agentName === "You" ? "text-orange" : "text-accent"
                          }`}
                        >
                          {group.agentName}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {group.events.length} event{group.events.length !== 1 ? "s" : ""}
                        </span>
                      </span>
                      {isChild && (
                        <span className="text-[10px] text-lineageText/70">delegated by {parent!.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-400">
                      {group.events[group.events.length - 1].time}
                    </span>
                    <span className="text-gray-400 text-[10px]">{isOpen ? "▾" : "▸"}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-hairline">
                    {group.events.map((ev, i) => (
                      <div
                        key={ev.id}
                        className={`px-5 py-2.5 flex items-start gap-4 ${i !== 0 ? "border-t border-hairline" : ""}`}
                      >
                        <span className="text-[11px] text-gray-400 tabular-nums w-14 shrink-0 pt-0.5">
                          {ev.time}
                        </span>
                        <span className="text-[13px] text-gray-600 flex-1 pt-0.5">{ev.what}</span>
                        <span
                          className="badge whitespace-nowrap shrink-0"
                          style={{ background: `${resultColor[ev.type]}15`, color: resultColor[ev.type] }}
                        >
                          {ev.result}
                        </span>
                        <FlagTag flagType={ev.flagType} />
                        <span className="font-mono text-[11px] bg-ink text-[#7ee89a] px-2 py-0.5 rounded shrink-0">
                          {ev.hash.slice(0, 12)}…
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
