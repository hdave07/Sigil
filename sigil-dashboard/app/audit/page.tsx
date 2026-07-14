"use client";

import { useEffect, useState } from "react";
import { getAuditLog } from "@/lib/api";
import { AuditEvent, AuditEventType } from "@/lib/types";

const resultColor: Record<AuditEventType, string> = {
  allowed: "#1abc6e",
  blocked: "#e74c3c",
  paused: "#e67e22",
  human: "#e67e22",
};

const filters: { key: AuditEventType | "all"; label: string }[] = [
  { key: "all", label: "All activity" },
  { key: "allowed", label: "Allowed actions" },
  { key: "blocked", label: "Blocked actions" },
  { key: "paused", label: "Paused for review" },
  { key: "human", label: "Your decisions" },
];

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState<AuditEventType | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLog().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

  const rows = filter === "all" ? events : events.filter((e) => e.type === filter);

  return (
    <div className="flex flex-col h-full p-8 overflow-y-auto">
      <h1 className="text-xl font-semibold mb-1">Activity log</h1>
      <p className="text-gray-500 mb-4">
        A full record of everything your agents did, tried to do, and were stopped from doing
      </p>

      <div className="bg-ink text-gray-300 px-4 py-2.5 rounded-lg text-[11px] mb-4">
        Every entry in this log is cryptographically signed. Hashes are chained — altering any
        entry breaks the chain and is immediately detectable.
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? "bg-accent text-white border-accent"
                : "bg-white text-gray-600 border-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-border rounded-lg flex-1 overflow-y-auto">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: 72 }} />
            <col style={{ width: 140 }} />
            <col />
            <col style={{ width: 160 }} />
            <col style={{ width: 155 }} />
          </colgroup>
          <thead>
            <tr className="bg-[#f8f8fa] text-[11px] font-semibold text-gray-400">
              <th className="text-left px-3.5 py-2.5">Time</th>
              <th className="text-left px-3.5 py-2.5">Agent</th>
              <th className="text-left px-3.5 py-2.5">What happened</th>
              <th className="text-left px-3.5 py-2.5">Result</th>
              <th className="text-left px-3.5 py-2.5">Proof</th>
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
            {rows.map((ev, i) => (
              <tr key={ev.id} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                <td className="px-3.5 py-2.5 text-gray-400 whitespace-nowrap">{ev.time}</td>
                <td
                  className="px-3.5 py-2.5 font-medium whitespace-nowrap"
                  style={{ color: ev.agentName === "You" ? "#e67e22" : "#3547f0" }}
                >
                  {ev.agentName}
                </td>
                <td className="px-3.5 py-2.5">{ev.what}</td>
                <td className="px-3.5 py-2.5">
                  <span
                    className="badge whitespace-nowrap"
                    style={{ background: `${resultColor[ev.type]}18`, color: resultColor[ev.type] }}
                  >
                    {ev.result}
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  <span className="font-mono text-[11px] bg-ink text-[#7ee89a] px-2 py-0.5 rounded inline-flex items-center gap-1">
                    {ev.hash.slice(0, 12)}…
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
