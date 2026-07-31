"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAgents, setAgentMission, suggestMissionScope, MissionScope, SuggestedScope } from "@/lib/api";
import { Agent } from "@/lib/types";
import { ACTION_TYPES } from "@/lib/actionTypes";

const MIN_SUGGEST_LENGTH = 15; // matches the backend's own guard on POST /missions/suggest-scope
const DEBOUNCE_MS = 900;

// Each type gets exactly one of three mutually-exclusive states.
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
  const [confirmation, setConfirmation] = useState<{ agentName: string; missionText: string } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Claude-assisted scope suggestion (authoring aid only - see CONTRACT.md
  // §7/§8). extraActionTypes holds types Claude proposed beyond the static
  // baseline; reasonsByType feeds the per-row "why" tooltip.
  const [extraActionTypes, setExtraActionTypes] = useState<{ type: string; label: string }[]>([]);
  const [reasonsByType, setReasonsByType] = useState<Record<string, string>>({});
  // Once the human manually touches any toggle/keyword, auto-suggestion stops
  // silently overwriting their edits while they keep typing - see fireSuggestion.
  const [userEditedChecklist, setUserEditedChecklist] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  // Refs, not state: bumping suggestGenerationRef is how a slower, superseded
  // response recognizes it's stale after its own await resolves.
  const suggestGenerationRef = useRef(0);
  const suggestAbortRef = useRef<AbortController | null>(null);

  // Only offer agents that haven't been given a mission yet - once an agent
  // has one, re-configuring it isn't this screen's job (the dropdown
  // shouldn't invite overwriting an existing mission by accident).
  const unconfiguredAgents = agents.filter((a) => !a.missionDescription);

  useEffect(() => {
    getAgents().then(setAgents);
  }, []);

  // Same fade-in pattern as app/approvals/page.tsx's confirmation modal.
  useEffect(() => {
    if (!confirmation) return;
    setModalVisible(false);
    const raf = requestAnimationFrame(() => setModalVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [confirmation]);

  function setChoice(type: string, choice: ScopeChoice) {
    setUserEditedChecklist(true); // freezes auto-suggestion - see the debounce effect below
    setChoices((cur) => ({ ...cur, [type]: choice }));
  }

  function addKeywords(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) return;
    setUserEditedChecklist(true);
    setOffMissionKeywords((cur) => Array.from(new Set([...cur, ...parts])));
    setKeywordInput("");
  }

  function removeKeyword(word: string) {
    setUserEditedChecklist(true);
    setOffMissionKeywords((cur) => cur.filter((w) => w !== word));
  }

  // Baseline 9 always present + any new types Claude proposed, deduped by
  // type - the static label wins for the known 9 by construction (the spread
  // order means ACTION_TYPES entries are never overwritten by extraRows).
  const extraRows = extraActionTypes.filter((extra) => !ACTION_TYPES.some((a) => a.type === extra.type));
  const rows = [...ACTION_TYPES, ...extraRows];

  function applySuggestion(result: SuggestedScope) {
    // Does NOT touch userEditedChecklist - this is the auto-suggestion path,
    // not a manual edit, so it must not freeze itself out.
    setChoices((cur) => {
      const next = { ...cur };
      for (const { type } of result.allow) next[type] = "allow";
      for (const { type } of result.requireApproval) next[type] = "requireApproval";
      return next;
    });
    setExtraActionTypes(
      [...result.allow, ...result.requireApproval]
        .filter(({ type }) => !ACTION_TYPES.some((a) => a.type === type))
        .map(({ type, label }) => ({ type, label }))
    );
    setOffMissionKeywords((cur) => Array.from(new Set([...cur, ...result.offMissionKeywords])));
    setReasonsByType(
      Object.fromEntries([...result.allow, ...result.requireApproval].map((s) => [s.type, s.reason]))
    );
  }

  async function fireSuggestion(missionText: string) {
    suggestGenerationRef.current += 1;
    const myGeneration = suggestGenerationRef.current;
    suggestAbortRef.current?.abort(); // cancel any still-in-flight older request
    const controller = new AbortController();
    suggestAbortRef.current = controller;

    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await suggestMissionScope(missionText, controller.signal);
      if (myGeneration !== suggestGenerationRef.current) return; // superseded, discard
      applySuggestion(result);
    } catch (err) {
      if (controller.signal.aborted) return; // expected: superseded, not a real failure
      if (myGeneration !== suggestGenerationRef.current) return;
      setSuggestError(err instanceof Error ? err.message : "Failed to suggest a scope.");
    } finally {
      if (myGeneration === suggestGenerationRef.current) setSuggesting(false);
    }
  }

  function handleRegenerate() {
    if (text.trim().length < MIN_SUGGEST_LENGTH) return;
    setUserEditedChecklist(false);
    void fireSuggestion(text); // fires immediately, doesn't wait for the debounce timer
  }

  // Debounced auto-suggest: fires ~900ms after typing stops, skipped while
  // frozen (userEditedChecklist) or below the minimum length.
  useEffect(() => {
    if (userEditedChecklist) return;
    if (text.trim().length < MIN_SUGGEST_LENGTH) return;
    const timer = setTimeout(() => void fireSuggestion(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, userEditedChecklist]);

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeywords(keywordInput);
    }
  }

  // Must iterate `rows` (baseline + Claude's extra types), not just the
  // static ACTION_TYPES - otherwise an accepted suggested type (e.g.
  // "payment.refund") would sit in `choices` with a value but silently never
  // make it into scope.allow/scope.requireApproval on submit.
  const allow = rows.filter(({ type }) => choices[type] === "allow").map(({ type }) => type);
  const requireApproval = rows.filter(({ type }) => choices[type] === "requireApproval").map(({ type }) => type);
  const scope: MissionScope = { allow, requireApproval, offMissionKeywords };

  function resetForm() {
    setAgentId("");
    setText("");
    setChoices({});
    setOffMissionKeywords([]);
    setKeywordInput("");
    setExtraActionTypes([]);
    setReasonsByType({});
    setUserEditedChecklist(false);
    setSuggestError(null);
    suggestGenerationRef.current += 1; // orphans any straggling in-flight suggestion
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || !text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const agentName = agents.find((a) => a.id === agentId)?.name ?? "Agent";
      const missionText = text.trim();
      await setAgentMission(agentId, missionText, scope);
      setConfirmation({ agentName, missionText });
      getAgents().then(setAgents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set mission.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="p-9 grid grid-cols-[1fr_380px] gap-6 items-start">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink mb-1">Mission setup</h1>
          <p className="text-[13px] text-gray-500 mb-7 max-w-lg leading-relaxed">
            Choose an unconfigured agent, describe what it's purpose, and resolve which actions it can execute on its own versus which ones need explicit approval from you. Anything outside that gets paused and waits for your desicion.
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
                  {agents.length === 0
                    ? "No registered agents yet"
                    : unconfiguredAgents.length === 0
                      ? "All registered agents already have a mission"
                      : "Select an agent…"}
                </option>
                {unconfiguredAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Only agents that haven&apos;t been given a mission yet show up here.
              </p>
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
              <div className="flex items-center gap-2 mb-1.5">
                <label className="eyebrow">Action types</label>
                {suggesting && <span className="text-[11px] text-gray-400">Suggesting…</span>}
                {userEditedChecklist && !suggesting && (
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    className="text-[11px] text-accent hover:underline"
                  >
                    Regenerate suggestion
                  </button>
                )}
              </div>
              {suggestError && (
                <p className="text-[11px] text-red mb-1.5">
                  {suggestError} — you can still fill this out manually.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {rows.map(({ type, label }) => {
                  const current = choices[type] ?? "not_permitted";
                  const reason = reasonsByType[type];
                  return (
                    <div key={type} className="flex items-center justify-between gap-3">
                      <span className="text-sm">
                        {label}
                        {reason && (
                          <span
                            title={reason}
                            className="ml-1 text-gray-400 cursor-help"
                            aria-label="Why this suggestion"
                          >
                            ⓘ
                          </span>
                        )}
                      </span>
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
                or &quot;switch providers&quot; would catch an allowed draft emails action being misused to
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
            <div className="text-base font-bold text-ink">Mission set</div>
            <div className="text-sm font-semibold text-ink">{confirmation.agentName}</div>
            <div className="text-sm text-gray-500 leading-relaxed">{confirmation.missionText}</div>
            <div className="flex items-center gap-4 mt-3">
              <Link
                href="/agents"
                onClick={() => setConfirmation(null)}
                className="text-[12px] font-semibold text-accent hover:underline"
              >
                View in agent list
              </Link>
              <button
                onClick={() => {
                  setConfirmation(null);
                  resetForm();
                }}
                className="text-[12px] font-medium text-gray-500 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
