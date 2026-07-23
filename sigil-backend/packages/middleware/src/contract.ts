/**
 * SIGIL shared contract.
 *
 * The single source of truth for the object shapes that cross the wire between
 * the middleware (backend) and the dashboard (frontend). Both sides import
 * these types so the contract can't silently drift.
 *
 * Endpoint list is the one you + your partner agreed on (screenshot), NOT the
 * older handoff list. See ENDPOINTS below.
 */

// ===========================================================================
// ENDPOINTS (agreed contract)
// ===========================================================================
//
// Agent -> Middleware
//   POST /agent               register an agent + its public key           -> { agentId }
//   POST /mission             declare a mission                            -> Mission
//   GET  /mission             fetch a mission (also yields the allowlist)  -> Mission
//   POST /action              attempt an action                            -> ActionOutcome
//   GET  /action              describe the agent's current in-flight action-> ActionAttempt | null
//   GET  /action/:id/status   agent polls: am I cleared yet?               -> { status: Decision }
//
// Dashboard -> Middleware
//   GET  /agents              list agents + status + mission               -> AgentSummary[]
//   GET  /pending             actions awaiting human approval              -> PendingApproval[]
//   GET  /audit               the audit timeline                          -> AuditEntry[]
//   POST /action/:id/status   human decision on a pending action          -> { status: Decision }
//   POST /agents/:id/mission  human sets an agent's mission directly       -> Mission
//   (NOT signed - a human at the dashboard, not an agent proving its own
//   identity. No auth on this route yet, same as POST /action/:id/status -
//   a known, already-accepted gap for this demo stage, not unique to this
//   endpoint.)
//
//   POST /audit               *** see note ***
//   The audit log is tamper-evident ONLY if entries are written solely by the
//   middleware. An externally writable POST /audit lets a caller forge history
//   and defeats the whole point. Recommendation: do not expose it publicly.
//   If it must exist, make it internal-only (never reachable by an agent or a
//   browser). Modeled here as internal, not part of the public surface.
//
// ===========================================================================

/** Where an agent / action currently stands. */
export type AgentStatus =
  | "idle"
  | "running"
  | "paused" // blocked on a pending human decision
  | "waiting" // polling for its decision
  | "completed";

export type Decision = "pending" | "approved" | "denied";

/** Result the middleware returns from POST /action. */
export type ActionVerdict = "allow" | "pause" | "deny";

/**
 * Why an action was flagged instead of auto-allowed. See mission.ts's
 * checkAction for the two-phase logic that produces this:
 *   "not_permitted"  - action.type isn't declared anywhere in this mission's
 *                      scope (neither allow nor requireApproval).
 *   "needs_approval" - action.type IS in requireApproval: a sensitivity rule
 *                      that applies the same way regardless of mission
 *                      ("email.send always needs a human nod").
 *   "off_mission"    - action.type IS in allow (fully permitted), but this
 *                      specific action's target/detail doesn't serve what
 *                      THIS mission is trying to accomplish. The only one of
 *                      the three that's an instance-level judgment, not a
 *                      type-level lookup.
 */
export type FlagType = "not_permitted" | "needs_approval" | "off_mission";

// ---- agent ----------------------------------------------------------------

export interface Agent {
  id: string;
  name: string;
  /** Ed25519 public key as a JWK: { kty:"OKP", crv:"Ed25519", x:"..." } */
  publicKeyJwk: JsonWebKey;
  status: AgentStatus;
  createdAt: string; // ISO 8601
}

/** Compact view for GET /agents. */
export interface AgentSummary {
  id: string;
  name: string;
  status: AgentStatus;
  mission: string | null; // plain-language mission text
}

// ---- mission + scope ------------------------------------------------------

/**
 * The mission the agent declares in plain language, plus the STRUCTURED scope
 * it resolves to. v0: the scope is a deterministic allowlist, NOT an LLM in the
 * enforcement path. The plain text is for humans; `scope` is what enforcement
 * actually checks against.
 */
export interface Mission {
  id: string;
  agentId: string;
  text: string; // "research competitor pricing, write a summary"
  scope: MissionScope;
  hash: string; // SHA-256 over the canonical mission, tamper-evident
  createdAt: string;
}

/**
 * Two-phase deterministic check, run in this order by mission.ts's checkAction:
 *   1. Type lookup: type in `requireApproval` -> "needs_approval" (pause);
 *      type not in `allow` at all -> "not_permitted" (pause); else continue.
 *   2. Content check (only reached if type was in `allow`): case-insensitive
 *      substring match of `offMissionKeywords` against the action's
 *      target+detail. A hit -> "off_mission" (pause). No hit -> allow.
 * Nothing here auto-produces verdict "deny" in v0 - every flagged case
 * pauses for a human (AAuth's human-in-the-loop principle). `deny` stays
 * valid on ActionVerdict for future use (e.g. an explicit blocklist).
 */
export interface MissionScope {
  allow: string[]; // action types permitted outright, e.g. "web.read"
  requireApproval: string[]; // action types that always pause, e.g. "email.send"
  offMissionKeywords: string[]; // trip words checked against an allowed action's target+detail
}

// ---- actions --------------------------------------------------------------

export interface ActionAttempt {
  id: string;
  agentId: string;
  missionId: string;
  type: string; // e.g. "web.read", "email.send"
  target: string; // e.g. a URL, a recipient list
  detail: string; // human-readable description
  createdAt: string;
}

export interface ActionOutcome {
  actionId: string;
  verdict: ActionVerdict;
  reason: string;
  /** present iff verdict !== "allow" */
  flagType?: FlagType;
  /** present when verdict === "pause": the id the agent polls at /action/:id/status */
  statusId?: string;
}

// ---- pending approval (agreed shape) -------------------------------------

export interface PendingApproval {
  id: string;
  agentId: string; // for lookups - names aren't guaranteed unique
  agentName: string; // for display
  mission: string;
  actionAttempted: string;
  reason: string;
  context: string;
  /** always present - a PendingApproval only exists because something paused */
  flagType: FlagType;
  timestamp: string;
}

// ---- audit chain (agreed shape) ------------------------------------------

/**
 * Append-only, hash-chained. Each entry commits to the previous entry's hash,
 * so any edit to a past entry breaks the chain from that point onward.
 *   hash = SHA-256( canonical(id, agentId, event, detail, timestamp, previousHash) )
 * The first entry uses previousHash = "GENESIS".
 *
 * `event` is the specific, extensible name ("mission.declared",
 * "action.allowed", "action.paused", "action.approved", "action.denied",
 * "agent.registered", ...). `type` is the coarse category the dashboard
 * groups/colors by - omitted for lifecycle-only events (mission.declared,
 * agent.registered) that aren't themselves an enforcement verdict.
 */
export interface AuditEntry {
  id: string;
  agentId: string;
  event: string;
  type?: AuditEventType;
  detail: string;
  flagType?: FlagType;
  timestamp: string;
  hash: string;
  previousHash: string;
}

/** Coarse category for the dashboard's audit-timeline coloring/filtering. */
export type AuditEventType = "allowed" | "blocked" | "paused" | "human";
