"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { decideAction, getPendingActions } from "@/lib/api";
import { AgentAction } from "@/lib/types";

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const requestedActionId = searchParams.get("actionId");

  const [items, setItems] = useState<AgentAction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);

  async function load(preferId?: string | null) {
    const pending = await getPendingActions();
    setItems(pending);
    setSelectedId((current) => {
      if (preferId && pending.some((i) => i.id === preferId)) return preferId;
      return current ?? pending[0]?.id ?? null;
    });
    setLoading(false);
  }

  useEffect(() => {
    load(requestedActionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedActionId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  async function handleDecision(decision: "approve" | "deny" | "stop") {
    if (!selected) return;
    setDeciding(true);
    await decideAction(selected.id, decision);
    const pending = await getPendingActions();
    setItems(pending);
    setSelectedId(pending[0]?.id ?? null);
    setDeciding(false);
  }

  return (
    <div className="flex flex-col h-full p-8 overflow-hidden">
      <h1 className="text-xl font-semibold mb-1">Approval queue</h1>
      <p className="text-gray-500 mb-6">Review and decide what your agents are asking to do</p>

      <div className="grid grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
        <div className="bg-white border border-border rounded-lg overflow-y-auto">
          <div className="px-5 py-3.5 border-b border-[#e8e8ec] font-semibold flex items-center gap-2">
            Waiting for your decision
            <span className="badge bg-[#fff4e6] text-[#b85c00]">{items.length}</span>
          </div>
          {loading && <div className="p-5 text-gray-400">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="p-5 text-gray-400">All caught up — nothing waiting.</div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`px-5 py-3.5 border-b border-[#f0f0f3] last:border-none cursor-pointer hover:bg-[#fafafa] ${
                item.id === selectedId ? "bg-[#eef1ff] border-l-4 border-l-accent" : ""
              }`}
            >
              <div className="text-accent text-[11px] font-medium mb-1">{item.agentName}</div>
              <div className="text-sm font-semibold mb-0.5">{item.label}</div>
              <div className="text-[11px] text-gray-500">While: {item.missionDescription}</div>
              <div className="text-[10px] text-gray-300 mt-1">{item.requestedAt}</div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-border rounded-lg overflow-y-auto">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
              Nothing selected
            </div>
          )}
          {selected && (
            <div>
              <div className="px-5 py-3.5 border-b border-[#f0f0f3] bg-[#fffbf5] flex gap-3">
                <div>
                  <div className="font-semibold">Your agent has paused and is waiting for you</div>
                  <div className="text-xs text-gray-500">
                    {selected.agentName} · {selected.requestedAt}
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="bg-[#f7f8ff] border border-[#d4daff] rounded-lg p-4 mb-4">
                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Mission</div>
                    <div className="text-sm">{selected.missionDescription}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                      What is it asking to do?
                    </div>
                    <div className="text-sm">{selected.label}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-[#b85c00] uppercase mb-1">
                      Why was it flagged?
                    </div>
                    <div className="text-sm text-[#b85c00]">{selected.reason}</div>
                  </div>
                </div>

                {selected.payload && (
                  <div className="bg-ink rounded-lg p-4 mb-4 font-mono text-[11px] text-[#7ee89a] leading-relaxed">
                    {Object.entries(selected.payload).map(([k, v]) => (
                      <div key={k}>
                        {k}: {v}
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-[#f0f0f3] pt-4">
                  <div className="text-sm font-semibold mb-3">What would you like to do?</div>
                  <div className="flex flex-col gap-2">
                    <button
                      disabled={deciding}
                      onClick={() => handleDecision("approve")}
                      className="px-4 py-2 rounded-lg bg-green text-white text-sm font-semibold disabled:opacity-50"
                    >
                      Yes, allow this and continue
                    </button>
                    <button
                      disabled={deciding}
                      onClick={() => handleDecision("deny")}
                      className="px-4 py-2 rounded-lg border-[1.5px] border-red text-red text-sm font-semibold disabled:opacity-50"
                    >
                      No, skip this action
                    </button>
                    <button
                      disabled={deciding}
                      onClick={() => handleDecision("stop")}
                      className="px-4 py-2 rounded-lg border-[1.5px] border-gray-300 text-gray-600 text-sm font-semibold disabled:opacity-50"
                    >
                      Stop the agent
                    </button>
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

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <ApprovalsContent />
    </Suspense>
  );
}
