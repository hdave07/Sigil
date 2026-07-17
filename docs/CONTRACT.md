# SIGIL — Shared Contract

**Last updated:** 2026-07-16
**Owner:** HD (backend/protocol). Handoff reference for LK (frontend) and for future Claude Code sessions on this repo.

## 1. Purpose & status

This document is the durable, single source of truth for the object shapes and endpoints that cross the wire between the middleware (`sigil-backend/packages/middleware/src/contract.ts`) and the dashboard (`sigil-dashboard/lib/types.ts`). It supersedes the external "build brief" doc for these specifics — the brief is still the source of truth for scope/timeline/product framing, but the two sides' shapes have diverged from what the brief sketched, and this doc is the reconciliation.

Re-upload this file into future Claude Code sessions working on `sigil-backend` so shape decisions aren't re-derived from scratch each time. Hand it to Lucy before she next touches `lib/types.ts`/`lib/api.ts` — section 5 lists exactly what she needs to change.

## 2. Endpoint list (agreed contract)

**Agent → Middleware**

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/agent` | identity + public key | `{ agentId }` |
| POST | `/mission` | declare a mission | `Mission` |
| GET | `/mission` | fetch a mission | `Mission` |
| POST | `/action` | attempt an action | `ActionOutcome` |
| GET | `/action` | agent's current in-flight action | `ActionAttempt \| null` |
| GET | `/action/:id/status` | poll: am I cleared yet? | `{ status: Decision }` |

**Dashboard → Middleware**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/agents` | — | `AgentSummary[]` |
| GET | `/pending` | — | `PendingApproval[]` |
| GET | `/audit` | — | `AuditEntry[]` |
| POST | `/action/:id/status` | `{ decision: "approve" \| "deny" }` | `{ status: Decision }` |

`POST /audit` is intentionally **not** part of the public surface — the audit log is only tamper-evident if entries are written solely by the middleware itself. If it exists at all, it's internal-only.

## 3. Canonical types

The authoritative version is always `sigil-backend/packages/middleware/src/contract.ts` — this is a snapshot as of the date above, reproduced here for reference:

```ts
export type AgentStatus = "idle" | "running" | "paused" | "waiting" | "completed";
export type Decision = "pending" | "approved" | "denied";
export type ActionVerdict = "allow" | "pause" | "deny";

/**
 * Why an action was flagged instead of auto-allowed:
 *   "not_permitted"  - action.type isn't declared anywhere in this mission's
 *                       scope (neither allow nor requireApproval).
 *   "needs_approval" - action.type IS in requireApproval: a sensitivity rule
 *                       that applies the same way regardless of mission.
 *   "off_mission"    - action.type IS in allow (fully permitted), but this
 *                       specific action's target/detail doesn't serve what
 *                       THIS mission is trying to accomplish. The only one
 *                       that's an instance-level judgment, not a type lookup.
 */
export type FlagType = "not_permitted" | "needs_approval" | "off_mission";

export interface Agent {
  id: string;
  name: string;
  publicKeyJwk: JsonWebKey; // Ed25519 public key: { kty:"OKP", crv:"Ed25519", x:"..." }
  status: AgentStatus;
  createdAt: string; // ISO 8601
}

export interface AgentSummary {
  id: string;
  name: string;
  status: AgentStatus;
  mission: string | null;
}

export interface Mission {
  id: string;
  agentId: string;
  text: string; // "research competitor pricing, draft a summary email"
  scope: MissionScope;
  hash: string; // SHA-256 hex, tamper-evident
  createdAt: string;
}

/**
 * Two-phase deterministic check (see mission.ts's checkAction):
 *   1. Type lookup: type in requireApproval -> "needs_approval" (pause);
 *      type not in allow at all -> "not_permitted" (pause); else continue.
 *   2. Content check (only reached if type was in allow): case-insensitive
 *      substring match of offMissionKeywords against target+detail.
 *      A hit -> "off_mission" (pause). No hit -> allow.
 * Nothing here auto-produces verdict "deny" in v0 - every flagged case
 * pauses for a human. `deny` stays valid on ActionVerdict for future use.
 */
export interface MissionScope {
  allow: string[];
  requireApproval: string[];
  offMissionKeywords: string[];
}

export interface ActionAttempt {
  id: string;
  agentId: string;
  missionId: string;
  type: string;
  target: string;
  detail: string;
  createdAt: string;
}

export interface ActionOutcome {
  actionId: string;
  verdict: ActionVerdict;
  reason: string;
  flagType?: FlagType; // present iff verdict !== "allow"
  statusId?: string; // present when verdict === "pause"
}

export interface PendingApproval {
  id: string;
  agentName: string;
  mission: string;
  actionAttempted: string;
  reason: string;
  context: string;
  flagType: FlagType; // always present
  timestamp: string;
}

export interface AuditEntry {
  id: string;
  agentId: string;
  event: string; // specific, extensible: "mission.declared", "action.paused", ...
  type?: AuditEventType; // coarse category; omitted for lifecycle-only events
  detail: string;
  flagType?: FlagType;
  timestamp: string;
  hash: string;
  previousHash: string;
}

export type AuditEventType = "allowed" | "blocked" | "paused" | "human";
```

## 4. Reconciliation rationale

| Backend name (before) | Dashboard name (before) | Reconciled | Why |
|---|---|---|---|
| `verdict: ActionVerdict` | `inBounds: boolean` | `verdict` kept; `inBounds` dropped | `inBounds` was confirmed dead in the dashboard UI (declared, mock-set, never read anywhere in `app/`). Backend's 3-state `verdict` is strictly richer. |
| — (no field) | `flagType: "not_permitted" \| "off_mission"` | `flagType: FlagType` (now 3-valued) on `ActionOutcome`, `PendingApproval`, `AuditEntry` | Net-new on the backend, matching the dashboard's already-built field — but expanded to 3 values (see §5, this needs a dashboard follow-up). |
| `scope.allow` / `scope.requireApproval` (on `MissionScope`) | `allowedActions: string[]` (on `Agent`) | `MissionScope` stays canonical and richer; no new field added to backend `Agent`/`AgentSummary` | The backend needs the allow/requireApproval split for real enforcement — `requireApproval` has no dashboard equivalent at all, it's new behavior, not a rename. Dashboard's flat `allowedActions` is a display convenience that should be derived from `Mission.scope` at integration time (dashboard-side decision, not made here — see §5). |
| `event: string` (free-form) | `type: AuditEventType` (4-value enum) | Both kept: `event` (specific) + new `type` (coarse) | Dashboard's `type` is load-bearing (drives color maps + the primary audit filter in two files). Backend adopts that name/union verbatim rather than imposing its own, since backend has no legacy code depending on `event` alone yet. `event` stays for detail a 4-value enum can't carry. |
| `Decision = "pending" \| "approved" \| "denied"` | inline `status: "pending" \| "approved" \| "denied"` (on `AgentAction`) | No change — **already aligned** | Character-for-character identical union on both sides already. Flagged here so it isn't mistaken for unfinished work. |
| `timestamp` / `createdAt` (ISO strings) | `time: "3:45 PM"` (pre-formatted, mock-only) | Backend keeps ISO 8601 everywhere | The dashboard mock currently bakes display formatting into the data layer. This must NOT be replicated when `lib/api.ts` is rewired to real endpoints — formatting belongs in the UI layer, at render time. |

## 5. Open items requiring frontend follow-up

These are not resolved by this doc — they're the explicit handoff to Lucy:

1. **`flagType` needs a 3rd value.** Dashboard's `AgentAction`/`AuditEvent` currently type `flagType` as `"not_permitted" | "off_mission"`. The backend now also emits `"needs_approval"` (for `requireApproval`-listed action types — a mission-independent sensitivity rule, distinct from the mission-specific `off_mission` judgment). `lib/types.ts` needs this 3rd value added before real integration, and the approval-screen UI (currently a two-gate green/red panel) may want a third visual treatment for it.
2. **`allowedActions` ↔ `MissionScope` mapping isn't decided.** When `lib/api.ts` is rewired to real endpoints, `Agent.allowedActions` (currently flat, display-only) needs to come from somewhere — likely `mission.scope.allow` (or `allow.concat(requireApproval)` if the dashboard wants to show everything the agent could ever attempt). This is a dashboard-side UI decision, not resolved here.
3. **Lifecycle audit events have no `type` mapping.** `mission.declared` and `agent.registered` don't fit any of the dashboard's 4 `AuditEventType` buckets and are deliberately left with `type` omitted in the backend. If the dashboard's audit timeline wants to render these at all, it needs its own handling for `type: undefined`.

## 6. Mission enforcement semantics

Given a declared `Mission` (with `MissionScope`) and an attempted action `{ type, target, detail }`:

1. **Is this action type always sensitive, regardless of mission?** If `action.type` is in `scope.requireApproval` → pause, `flagType: "needs_approval"`. (Example: `email.send` — sending mail is always a human-check action, independent of what the mission is.)
2. **Was this action type ever granted to this mission at all?** If `action.type` is not in `scope.allow` (and didn't match step 1) → pause, `flagType: "not_permitted"`. (Example: an agent on a pricing-research mission attempting `crm.query` — a capability it was simply never given.)
3. **Given the type is fully permitted, does this specific instance actually serve the mission?** Case-insensitive substring match of `scope.offMissionKeywords` against `target + " " + detail`. A hit → pause, `flagType: "off_mission"`. No hit → `verdict: "allow"`.

Step 3 only ever runs on actions that already passed steps 1–2 — this is the important part. It's what catches an agent using a fully-permitted action type (e.g. `email.draft`) to do something that technically fits the type but not the mission (e.g. drafting outreach to poach a competitor's customers, instead of drafting the requested summary). That's the case a type-only permission check (what competitors do) structurally cannot see — it's Sigil's actual differentiator, not just a relabeling of an existing tier.

Nothing in this check ever auto-produces `verdict: "deny"` in v0 — every flagged case pauses for a human, matching AAuth's human-in-the-loop principle. `deny` remains valid on `ActionVerdict` for potential future use (e.g. an explicit blocklist), it's just never returned automatically today.

## 7. Non-goals / firm constraints

**Enforcement is deterministic, never an LLM call — by design, not a temporary v0 shortcut.** The mission-scope check (`checkAction` in `mission.ts`) is a pure, synchronous lookup. This is a security decision: an LLM sitting in the enforcement path is a prompt-injection surface in a system whose entire job is enforcing trust boundaries — not an acceptable trade for "smarter" parsing. The right place for an LLM, if/when one is added, is **authoring**, not enforcement: e.g. helping a human draft `allow`/`requireApproval`/`offMissionKeywords` from plain-language mission text, with the human reviewing and confirming the generated scope before it's locked in. That keeps the security-critical path exactly as deterministic as it is today.

## 8. Changelog

- **2026-07-16** — Added `FlagType` (3-valued: `not_permitted`/`needs_approval`/`off_mission`) to `ActionOutcome`, `PendingApproval`, `AuditEntry`. Added `MissionScope.offMissionKeywords`. Added `AuditEntry.type` (optional). Corrected `MissionScope`'s doc comment (was "denied by default," is actually "paused by default, flagged by reason"). Built `mission.ts` (`declareMission`, `checkAction`) and `scripts/mission-demo.ts`. Added `sha256Hex` to `aauth-core/src/signing.ts`.
