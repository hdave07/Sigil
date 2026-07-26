/**
 * Claude-assisted mission scope authoring aid - despite the name (kept for
 * import-site stability), this currently calls Groq's free tier
 * (llama-3.3-70b-versatile) over its OpenAI-compatible endpoint, chosen for
 * demo purposes where cost is $0 rather than the ~$0.01/call this cost on
 * Sonnet 5. Swapping providers again later only means changing this file -
 * server.ts, the frontend, and the SuggestedMissionScope shape don't know or
 * care which model answered.
 *
 * NOT in the enforcement path - checkAction() (mission.ts) never calls this
 * and never will. This module only helps a human draft a MissionScope from
 * plain-language mission text; the human reviews and edits every suggestion
 * before POST /agents/:id/mission actually declares (and audits) a mission.
 * See docs/CONTRACT.md §7, which anticipated exactly this split.
 */

import OpenAI from "openai";

export interface SuggestedActionType {
  type: string;
  label: string;
  reason: string;
}

export interface SuggestedMissionScope {
  allow: SuggestedActionType[];
  requireApproval: SuggestedActionType[];
  offMissionKeywords: string[];
}

export class MissingApiKeyError extends Error {
  constructor() {
    super("GROQ_API_KEY is not configured");
  }
}

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const MODEL = "llama-3.3-70b-versatile";

const BASELINE_ACTION_TYPES = [
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

// Groq's llama-3.3-70b-versatile isn't on the strict-schema allowlist (only
// their gpt-oss models support constrained decoding) - so unlike Anthropic's
// output_config.format, nothing here GUARANTEES the response matches this
// shape. The prompt spells out the exact JSON shape explicitly, and
// isValidSuggestion() below validates it at runtime before this module ever
// returns it to a caller.
const SYSTEM_PROMPT = `You help a human draft the enforcement scope for an AI agent's mission, before that scope is locked in. You never make the final decision - the human reviews and can override every suggestion you make.

Enforcement semantics you're drafting for:
- "allow": this action type is auto-permitted whenever the agent attempts it.
- "requireApproval": this action type always pauses for a human to approve, regardless of mission - reserve it for sensitive/sensitive-adjacent actions.
- Anything you don't list in either bucket is implicitly "not permitted" for this agent - do not pad the lists with capabilities the mission doesn't actually need.

Baseline action types already known to the system (reuse these verbatim, by their exact "type" string, when they fit the mission):
${BASELINE_ACTION_TYPES.map((a) => `- ${a.type}: ${a.label}`).join("\n")}

You may also propose new action types beyond this baseline when the mission calls for a capability the baseline doesn't cover. New types should follow the same "category.verb" naming convention (e.g. "payment.refund", "ticket.close") and come with a short human-readable label.

Guidance:
- Be conservative: sensitive-sounding actions (payments, deletions, data exports, sending anything externally) should default to "requireApproval" rather than "allow", and should only appear at all if the mission text plausibly implies them.
- Be specific and mission-tailored, not broad or generic.
- Propose a small handful (roughly 2-6) of offMissionKeywords: words or phrases that would indicate an otherwise-allowed action has drifted off the mission's actual purpose (e.g. for a pricing-research mission, "poach" or "switch providers" would flag an allowed email-drafting action being misused to lure away a competitor's customers).
- For every suggested action type, write one clear sentence in "reason" explaining why you chose that type and that bucket - this is shown directly to the human reviewing your suggestion.

Respond with ONLY a single JSON object - no markdown code fences, no explanation before or after it. It must match this exact shape:
{
  "allow": [{ "type": "string", "label": "string", "reason": "string" }],
  "requireApproval": [{ "type": "string", "label": "string", "reason": "string" }],
  "offMissionKeywords": ["string"]
}`;

function isValidActionType(x: unknown): x is SuggestedActionType {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  return typeof obj.type === "string" && typeof obj.label === "string" && typeof obj.reason === "string";
}

function isValidSuggestion(x: unknown): x is SuggestedMissionScope {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  return (
    Array.isArray(obj.allow) &&
    Array.isArray(obj.requireApproval) &&
    Array.isArray(obj.offMissionKeywords) &&
    obj.allow.every(isValidActionType) &&
    obj.requireApproval.every(isValidActionType) &&
    obj.offMissionKeywords.every((k) => typeof k === "string")
  );
}

/** Strips a ```json ... ``` (or bare ``` ... ```) fence if the model wrapped
 * its output in one despite being told not to - common enough on models
 * without strict schema enforcement that it's worth guarding defensively. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : trimmed;
}

/**
 * Calls Groq (llama-3.3-70b-versatile) to draft a MissionScope suggestion
 * from plain-language mission text. Pure authoring aid - stateless, writes
 * nothing, never touches the audit log or any store. The caller (server.ts)
 * is responsible for mapping failures to an HTTP response; this function
 * only throws.
 */
export async function suggestMissionScope(missionText: string): Promise<SuggestedMissionScope> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: missionText },
    ],
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("empty scope suggestion response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error("scope suggestion response was not valid JSON");
  }

  if (!isValidSuggestion(parsed)) {
    throw new Error("scope suggestion response did not match the expected shape");
  }

  return parsed;
}
