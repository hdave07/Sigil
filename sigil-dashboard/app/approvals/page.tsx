"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { decideAction, getAgents, getPendingActions } from "@/lib/api";
import { Agent, AgentAction } from "@/lib/types";
import FlagTag from "@/components/FlagTag";

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const requestedActionId = searchParams.get("actionId");

  const [items, setItems] = useState<AgentAction[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [confirmation, setConfirmation] = useState<{ agentName: string } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

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

  useEffect(() => {
    getAgents().then(setAgents);
  }, []);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (!confirmation) return;
    setModalVisible(false);
    const raf = requestAnimationFrame(() => setModalVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [confirmation]);

  async function handleDecision(decision: "approve" | "deny" | "stop") {
    if (!selected) return;
    setDeciding(true);
    await decideAction(selected.id, decision);
    if (decision === "approve") {
      setConfirmation({ agentName: selected.agentName });
    }
    const pending = await getPendingActions();
    setItems(pending);
    setSelectedId(pending[0]?.id ?? null);
    setDeciding(false);
  }

  const groups: { agentId: string; agentName: string; items: AgentAction[] }[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.agentId === item.agentId);
    if (group) group.items.push(item);
    else groups.push({ agentId: item.agentId, agentName: item.agentName, items: [item] });
  }

  // Keeps a delegated child's group directly under its parent's, same
  // treatment as the Dashboard's agent list, so the relationship reads the
  // same way everywhere.
  const childrenByParent = new Map<string, typeof groups>();
  const rootGroups: typeof groups = [];
  for (const group of groups) {
    const agent = agents.find((a) => a.id === group.agentId);
    const parent = agent?.parentAgentId ? agents.find((a) => a.id === agent.parentAgentId) : undefined;
    if (parent && groups.some((g) => g.agentId === parent.id)) {
      const siblings = childrenByParent.get(parent.id) ?? [];
      siblings.push(group);
      childrenByParent.set(parent.id, siblings);
    } else {
      rootGroups.push(group);
    }
  }
  const orderedGroups: typeof groups = [];
  for (const root of rootGroups) {
    orderedGroups.push(root);
    orderedGroups.push(...(childrenByParent.get(root.agentId) ?? []));
  }

  return (
    <div className="flex flex-col h-full p-9 overflow-hidden">
      <h1 className="text-[26px] font-bold tracking-tight text-ink mb-1">Approval queue</h1>
      <p className="text-[13px] text-gray-500 mb-8">Review and decide what your agents are asking to do</p>

      <div className="grid grid-cols-[1fr_420px] gap-4 flex-1 min-h-0">
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-y-auto">
          <div className="px-5 py-3.5 border-b border-hairline font-semibold text-[13px] text-ink flex items-center gap-2">
            Waiting for your decision
            <span className="badge bg-orange/10 text-orange">{items.length}</span>
          </div>
          {loading && <div className="p-5 text-gray-400">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="p-5 text-gray-400">All caught up — nothing waiting.</div>
          )}
          {orderedGroups.map((group) => {
            const agent = agents.find((a) => a.id === group.agentId);
            const parent = agent?.parentAgentId ? agents.find((a) => a.id === agent.parentAgentId) : undefined;
            // Indicate the delegation even if the parent has no pending
            // items of its own (so no group to visually nest under) — the
            // relationship is still worth surfacing.
            const isChild = Boolean(parent);
            return (
              <div key={group.agentId}>
                <div
                  className={`px-5 py-2 bg-zebra border-b border-hairline flex items-center gap-2 ${
                    isChild ? "pl-9" : ""
                  }`}
                >
                  {isChild && <span className="text-lineageText">↳</span>}
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-600">{group.agentName}</span>
                      <span className="text-[10px] text-gray-400">{group.items.length} waiting</span>
                    </span>
                    {isChild && (
                      <span className="text-[10px] text-lineageText/70">delegated by {parent!.name}</span>
                    )}
                  </div>
                </div>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`px-5 py-3.5 border-b border-hairline last:border-none cursor-pointer transition-colors ${
                      isChild ? "ml-9" : ""
                    } ${
                      item.id === selectedId
                        ? "bg-accent/[0.13] shadow-[inset_0_1px_0_rgba(74,78,105,0.08)]"
                        : "hover:bg-zebra"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-sm font-semibold text-ink">{item.label}</div>
                      <FlagTag flagType={item.flagType} />
                    </div>
                    <div className="text-[12px] text-orange leading-snug mb-1.5">{item.reason}</div>
                    <div className="text-[10px] text-gray-400">{item.requestedAt}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-border rounded-xl shadow-sm overflow-y-auto">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
              Nothing selected
            </div>
          )}
          {selected && (
            <div>
              <div className="px-5 py-3.5 border-b border-orange/20 bg-orange/[0.07] flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-ink">Your agent has paused and is waiting for you</div>
                  <div className="text-xs text-gray-500">
                    {selected.agentName} · {selected.requestedAt}
                  </div>
                </div>
                <FlagTag flagType={selected.flagType} />
              </div>
              <div className="p-5">
                <div className="bg-zebra border border-hairline rounded-lg p-3.5 mb-4">
                  <div className="mb-2.5">
                    <div className="eyebrow mb-1">Mission</div>
                    <div className="text-[13px] text-gray-600">{selected.missionDescription}</div>
                  </div>
                  <div>
                    <div className="eyebrow mb-1">What is it asking to do?</div>
                    <div className="text-[13px] text-gray-600">{selected.label}</div>
                  </div>
                </div>

                {selected.flagType === "off_mission" ? (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-green/[0.07] border border-green/30 rounded-lg p-3.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-green uppercase tracking-wide mb-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green text-white text-[10px] leading-none shrink-0">
                          ✓
                        </span>
                        Allowed
                      </div>
                      <div className="text-[13px] text-ink leading-relaxed">{selected.permittedNote}</div>
                    </div>
                    <div className="bg-red/[0.07] border border-red/30 rounded-lg p-3.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-red uppercase tracking-wide mb-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red text-white text-[10px] leading-none shrink-0">
                          ✕
                        </span>
                        But off-mission
                      </div>
                      <div className="text-[13px] text-ink leading-relaxed">{selected.reason}</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-orange/[0.07] border border-orange/30 rounded-lg p-4 mb-4 shadow-[0_2px_14px_-6px_rgba(187,109,74,0.3)]">
                    <div className="text-[12px] font-bold text-orange uppercase tracking-wide mb-1.5">
                      Why was it flagged?
                    </div>
                    <div className="text-[14px] text-ink leading-relaxed">{selected.reason}</div>
                  </div>
                )}

                {selected.payload && (
                  <div className="bg-ink rounded-lg p-4 mb-4 font-mono text-[11px] text-[#7ee89a] leading-relaxed">
                    {Object.entries(selected.payload).map(([k, v]) => (
                      <div key={k}>
                        {k}: {v}
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-hairline pt-4">
                  <div className="text-sm font-semibold text-ink mb-3">What would you like to do?</div>
                  <div className="flex flex-col gap-2">
                    <button
                      disabled={deciding}
                      onClick={() => handleDecision("approve")}
                      className="px-4 py-2.5 rounded-lg bg-green text-white text-sm font-semibold disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(107,138,111,0.5)] hover:opacity-90 transition-opacity"
                    >
                      Yes, allow this and continue
                    </button>
                    <button
                      disabled={deciding}
                      onClick={() => handleDecision("deny")}
                      className="px-4 py-2 rounded-lg border-[1.5px] border-red/70 text-red text-sm font-semibold disabled:opacity-50 hover:bg-red/5 transition-colors"
                    >
                      No, skip this action
                    </button>
                    <button
                      disabled={deciding}
                      onClick={() => handleDecision("stop")}
                      className="px-4 py-1.5 rounded-lg text-[13px] text-gray-500 font-medium disabled:opacity-50 hover:text-gray-700 hover:underline"
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

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className={`bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-1.5 max-w-sm text-center transition-all duration-150 ${
              modalVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mb-2">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3f7d52"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="text-base font-bold text-ink">Agent resumed</div>
            <div className="text-sm text-gray-500">{confirmation.agentName} is continuing its work.</div>
            <button
              onClick={() => setConfirmation(null)}
              className="mt-2.5 text-[12px] font-medium text-accent hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
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
