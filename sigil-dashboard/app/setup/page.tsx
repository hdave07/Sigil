"use client";

import { useEffect, useMemo, useState } from "react";
import { createAgent, createMission, getAgents } from "@/lib/api";
import { Agent, Mission } from "@/lib/types";
import { inferScope, SCOPE_LABELS } from "@/lib/scopeInference";

function previewHash(text: string): string {
  let h = 0xdeadbeef ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 2654435761);
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export default function SetupPage() {
  const [description, setDescription] = useState("");
  const [agentName, setAgentName] = useState("");
  const [manualScope, setManualScope] = useState<string[] | null>(null);
  const [editingScope, setEditingScope] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Mission | null>(null);
  const [recentAgents, setRecentAgents] = useState<Agent[]>([]);

  const inferredScope = useMemo(() => inferScope(description), [description]);
  const scope = manualScope ?? inferredScope;

  useEffect(() => {
    getAgents().then(setRecentAgents);
  }, []);

  function toggleScope(key: string) {
    setManualScope((current) => {
      const base = current ?? inferredScope;
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !agentName.trim()) return;
    setCreating(true);
    const mission = await createMission(description.trim(), scope);
    await createAgent({
      name: agentName.trim(),
      missionId: mission.id,
      missionDescription: mission.description,
      status: "running",
      allowedActions: scope,
      currentJob: mission.description,
    });
    setCreated(mission);
    setCreating(false);
    setDescription("");
    setAgentName("");
    setManualScope(null);
    setEditingScope(false);
    getAgents().then(setRecentAgents);
  }

  return (
    <div className="p-8 grid grid-cols-[1fr_380px] gap-6 items-start">
      <div>
        <h1 className="text-xl font-semibold mb-1">Mission setup</h1>
        <p className="text-gray-500 mb-6">
          Say what this agent is for, in plain language. Every action it attempts gets checked
          against this — anything that doesn&apos;t fit gets flagged and paused for your review.
        </p>

        <form onSubmit={handleSubmit} className="bg-white border border-border rounded-lg p-6 flex flex-col gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Agent name</label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Pricing Agent"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              What is this agent for?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Research competitor pricing and draft a summary email"
              rows={3}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              v0: a keyword lookup resolves this to the allowed actions below — not real NLP, but
              the mission decides the scope, not you.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500">
                {editingScope ? "Allowed actions" : "Here's what we understood this agent can do"}
              </label>
              {editingScope ? (
                <button
                  type="button"
                  onClick={() => {
                    setManualScope(null);
                    setEditingScope(false);
                  }}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  Reset to auto-detected
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingScope(true)}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            {editingScope ? (
              <div className="flex flex-col gap-2">
                {Object.entries(SCOPE_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={scope.includes(key)} onChange={() => toggleScope(key)} />
                    {label}
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {scope.length === 0 && (
                  <span className="text-[11px] text-gray-400">
                    Nothing inferred yet — keep typing, or add detail like &quot;search&quot;,
                    &quot;email&quot;, or &quot;file&quot;.
                  </span>
                )}
                {scope.map((key) => (
                  <span key={key} className="badge bg-[#eef1ff] text-accent">
                    {SCOPE_LABELS[key] ?? key}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={creating || !description.trim() || !agentName.trim()}
            className="self-start px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {creating ? "Declaring mission…" : "Declare mission & start agent"}
          </button>
        </form>

        {created && (
          <div className="mt-5 bg-[#eafaf3] border border-[#c9f0dc] rounded-lg p-4 text-sm text-[#0f7a47]">
            Mission stored · hash: {created.hash} — agent is now running. Check the{" "}
            <a href="/agents" className="underline font-medium">
              agent list
            </a>
            .
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1.5">
            Mission object (live preview)
          </div>
          <div className="bg-ink rounded-lg p-4 font-mono text-[11px] text-[#7ee89a] leading-relaxed whitespace-pre-wrap break-words">
            {`{
  description: "${description || "…"}",
  scope: [${scope.map((s) => `"${s}"`).join(", ")}],
  hash: "${previewHash(description)}",
  status: "not yet stored"
}`}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Preview only — the real hash is generated when you submit.
          </p>
        </div>

        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8e8ec] font-semibold text-sm">
            Recently declared
          </div>
          {recentAgents.length === 0 && (
            <div className="px-4 py-4 text-[13px] text-gray-400">Nothing declared yet.</div>
          )}
          {[...recentAgents].reverse().map((a) => (
            <div key={a.id} className="px-4 py-3 border-b border-[#f0f0f3] last:border-none">
              <div className="text-accent text-[11px] font-medium mb-0.5">{a.name}</div>
              <div className="text-[13px] mb-1.5">{a.missionDescription}</div>
              <div className="flex flex-wrap gap-1">
                {a.allowedActions.map((key) => (
                  <span key={key} className="badge bg-[#eef1ff] text-accent">
                    {SCOPE_LABELS[key] ?? key}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
