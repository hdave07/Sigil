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
 * Deterministic enforcement rule set. An action's `type` is looked up here:
 *   in `allow`           -> allow
 *   in `requireApproval` -> pause (wait for a human)
 *   anything else        -> deny  (default-deny)
 */
export interface MissionScope {
  allow: string[]; // action types permitted outright, e.g. "web.read"
  requireApproval: string[]; // action types that pause, e.g. "email.send"
  // everything not listed is denied by default
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
  /** present when verdict === "pause": the id the agent polls at /action/:id/status */
  statusId?: string;
}

// ---- pending approval (agreed shape) -------------------------------------

export interface PendingApproval {
  id: string;
  agentName: string;
  mission: string;
  actionAttempted: string;
  reason: string;
  context: string;
  timestamp: string;
}

// ---- audit chain (agreed shape) ------------------------------------------

/**
 * Append-only, hash-chained. Each entry commits to the previous entry's hash,
 * so any edit to a past entry breaks the chain from that point onward.
 *   hash = SHA-256( canonical(id, agentId, event, detail, timestamp, previousHash) )
 * The first entry uses previousHash = "GENESIS".
 */
export interface AuditEntry {
  id: string;
  agentId: string;
  event: string; // "mission.declared" | "action.allowed" | "action.paused" | ...
  detail: string;
  timestamp: string;
  hash: string;
  previousHash: string;
}
