"use client";

import { useEffect, useState } from "react";
import { getAgents, setAgentMission, AgentMission, MissionScope } from "@/lib/api";
import { Agent } from "@/lib/types";

// Fixed v0 action-type vocabulary - checkAction() treats action.type as an
// opaque string, so any value here is automatically enforceable; this list
// is just which ones the checklist offers. Each type gets exactly one of
// three mutually-exclusive states.
const ACTION_TYPES: { type: string; label: string }[] = [
  { type: "web.read", label: "Read web pages" },
  { type: "email.draft", label: "Draft emails" },
  { type: "email.send", label: "Send emails" },
  { type: "file.write", label: "Write files" },
  { type: "crm.query", label: "Query CRM" },
  { type: "calendar.create", label: "Schedule calendar events" },
  { type: "payment.charge", label: "Process payments" },
  { type: "file.delete", label: "Delete files" },
  { type: "data.export", label: "Export data" },
];

type ScopeChoice = "not_permitted" | "allow" | "requireApproval";

// Selected-segment fill - mirrors components/Badge.tsx's color treatment
// exactly (green/orange/gray), so this reads as the same status language as
// the rest of the app rather than a one-off control.
const SCOPE_OPTIONS: { choice: ScopeChoice; label: string; selectedClass: string }[] = [
  { choice: "not_permitted", label: "Not permitted", selectedClass: "bg-gray-200 text-gray-600 font-medium" },
  { choice: "allow", label: "Auto-allow", selectedClass: "bg-green/15 text-green font-medium" },
  { choice: "requireApproval", label: "Always needs approval", selectedClass: "bg-orange/15 text-orange font-medium" },
];

function previewHash(text: string): string {
  let h = 0xdeadbeef ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 2654435761);
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export default function SetupPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [text, setText] = useState("");
  const [choices, setChoices] = useState<Record<string, ScopeChoice>>({});
  const [offMissionKeywords, setOffMissionKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AgentMission | null>(null);

  useEffect(() => {
    getAgents().then(setAgents);
  }, []);

  function setChoice(type: string, choice: ScopeChoice) {
    setChoices((cur) => ({ ...cur, [type]: choice }));
  }

  function addKeywords(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) return;
    setOffMissionKeywords((cur) => Array.from(new Set([...cur, ...parts])));
    setKeywordInput("");
  }

  function removeKeyword(word: string) {
    setOffMissionKeywords((cur) => cur.filter((w) => w !== word));
  }

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeywords(keywordInput);
    }
  }

  const allow = ACTION_TYPES.filter(({ type }) => choices[type] === "allow").map(({ type }) => type);
  const requireApproval = ACTION_TYPES.filter(({ type }) => choices[type] === "requireApproval").map(
    ({ type }) => type
  );
  const scope: MissionScope = { allow, requireApproval, offMissionKeywords };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || !text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const mission = await setAgentMission(agentId, text.trim(), scope);
      setCreated(mission);
      setText("");
      setChoices({});
      setOffMissionKeywords([]);
      setKeywordInput("");
      getAgents().then(setAgents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set mission.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-9 grid grid-cols-[1fr_380px] gap-6 items-start">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-ink mb-1">Mission setup</h1>
        <p className="text-[13px] text-gray-500 mb-7 max-w-lg leading-relaxed">
          Pick an agent, describe its mission in plain language, then tick exactly which action
          types it can use on its own and which always need your sign-off. Every action it
          attempts gets checked against this — anything that doesn&apos;t fit gets flagged and
          paused for your review.
        </p>

        <form onSubmit={handleSubmit} className="bg-white border border-border rounded-xl shadow-sm p-6 flex flex-col gap-5">
          <div>
            <label className="block eyebrow mb-1.5">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50"
            >
              <option value="">
                {agents.length === 0 ? "No registered agents yet" : "Select an agent…"}
              </option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block eyebrow mb-1.5">What is this agent for?</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Research competitor pricing and draft a summary email"
              rows={3}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Stored and shown as the mission&apos;s description — enforcement runs on the
              checklist below, not on this text.
            </p>
          </div>

          <div>
            <label className="block eyebrow mb-1.5">Action types</label>
            <div className="flex flex-col gap-2">
              {ACTION_TYPES.map(({ type, label }) => {
                const current = choices[type] ?? "not_permitted";
                return (
                  <div key={type} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{label}</span>
                    <div className="flex border border-border rounded-lg overflow-hidden">
                      {SCOPE_OPTIONS.map(({ choice, label: optionLabel, selectedClass }) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => setChoice(type, choice)}
                          aria-pressed={current === choice}
                          className={`px-3 py-1.5 text-[12px] transition-colors ${
                            current === choice ? selectedClass : "bg-zebra text-gray-400"
                          }`}
                        >
                          {optionLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block eyebrow mb-1.5">Off-mission trip words</label>
            <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
              Flag this agent&apos;s allowed actions as off-mission if their description mentions
              any of these words or phrases — e.g., for a pricing-research mission, &quot;poach&quot;
              or &quot;switch providers&quot; would catch an allowed email.draft being misused to
              lure away a competitor&apos;s customers.
            </p>
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              onBlur={() => addKeywords(keywordInput)}
              placeholder="Type a word or phrase, then press Enter or comma"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50"
            />
            {offMissionKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {offMissionKeywords.map((word) => (
                  <span key={word} className="badge bg-accent/10 text-accent flex items-center gap-1">
                    {word}
                    <button
                      type="button"
                      onClick={() => removeKeyword(word)}
                      aria-label={`Remove ${word}`}
                      className="hover:opacity-70"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red/[0.07] border border-red/25 rounded-lg p-3 text-[13px] text-red">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !agentId || !text.trim()}
            className="self-start px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50 shadow-[0_4px_16px_-4px_rgba(74,78,105,0.45)] hover:opacity-90 transition-opacity"
          >
            {submitting ? "Setting mission…" : "Set mission"}
          </button>
        </form>

        {created && (
          <div className="mt-5 bg-green/[0.07] border border-green/25 rounded-lg p-4 text-sm text-green">
            Mission stored · hash: {created.hash} — check the{" "}
            <a href="/agents" className="underline font-medium">
              agent list
            </a>
            .
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="eyebrow mb-1.5">Mission object (live preview)</div>
          <div className="bg-ink rounded-lg p-4 font-mono text-[11px] text-[#7ee89a] leading-relaxed whitespace-pre-wrap break-words">
            {`{
  text: "${text || "…"}",
  scope: {
    allow: [${allow.map((s) => `"${s}"`).join(", ")}],
    requireApproval: [${requireApproval.map((s) => `"${s}"`).join(", ")}],
    offMissionKeywords: [${offMissionKeywords.map((s) => `"${s}"`).join(", ")}]
  },
  hash: "${previewHash(text)}",
  status: "not yet stored"
}`}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Preview only — the real hash is generated when you submit.
          </p>
        </div>

        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-hairline font-semibold text-[13px] text-ink">
            Agents
          </div>
          {agents.length === 0 && (
            <div className="px-4 py-4 text-[13px] text-gray-400">No agents registered yet.</div>
          )}
          {[...agents].reverse().map((a) => (
            <div key={a.id} className="px-4 py-3 border-b border-hairline last:border-none">
              <div className="text-accent text-[11px] font-semibold mb-0.5">{a.name}</div>
              <div className="text-[13px] text-gray-600">
                {a.missionDescription || "No mission set yet."}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
