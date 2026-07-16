# Sigil — backend foundation

Days 1–2 deliverable: **real Ed25519 signing + RFC 9421 verification, terminal only.**
Zero third-party crypto dependencies — Ed25519 runs on the native Web Crypto API.

## Run it

```bash
npm install
npm run roundtrip      # signs a request, verifies it, then proves 4 tampers are caught
npx tsc --noEmit -p tsconfig.json   # strict type-check, should be clean
```

Expected output: five `PASS` lines — one honest request verifies, four tampers (body, method, wrong key, stale timestamp) rejected.

## Layout

```
packages/
  aauth-core/     ← ALL AAuth protocol crypto lives here (the only swap surface)
    src/keys.ts       Ed25519 keygen + JWK import/export
    src/signing.ts    RFC 9421 signature-base construction + signRequest()
    src/verify.ts     RFC 9421 verifyRequest() + body-integrity + freshness
  middleware/
    src/contract.ts   shared data model — the backend↔dashboard contract
  agent-sdk/          (Days 3+: thin wrapper an agent calls)
scripts/
  roundtrip.ts    ← the Day 1–2 demo
```

`aauth-core` is deliberately the only place protocol crypto lives, so a future
AAuth algorithm change touches three files and nothing else.

## What's real vs. deferred (Day 1–2)

Real: key generation, request signing, signature verification, body-integrity
binding (a flipped body byte fails), replay/freshness window.

Not yet built (by design): the HTTP server (Hono), Supabase persistence,
missions, pause/resume, the audit chain. Those sit on top of this and come next.

---

## Endpoint contract (your + partner's agreed list)

Signed = the request carries `Signature-Input` / `Signature` / `Content-Digest`
and the middleware runs `verifyRequest()` before doing anything else.

### Agent → Middleware

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/agent` | `{ name, publicKeyJwk }` | `{ agentId }` |
| POST | `/mission` *(signed)* | `{ agentId, text }` | `Mission` |
| GET | `/mission?agentId=` *(signed)* | — | `Mission` |
| POST | `/action` *(signed)* | `{ agentId, missionId, type, target, detail }` | `ActionOutcome` |
| GET | `/action?agentId=` *(signed)* | — | `ActionAttempt \| null` |
| GET | `/action/:id/status` *(signed)* | — | `{ status: Decision }` |

### Dashboard → Middleware

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/agents` | — | `AgentSummary[]` |
| GET | `/pending` | — | `PendingApproval[]` |
| GET | `/audit` | — | `AuditEntry[]` |
| POST | `/action/:id/status` | `{ decision: "approve" \| "deny" }` | `{ status: Decision }` |

All object shapes are defined once in `packages/middleware/src/contract.ts`.

---

## Two honest flags on the endpoint list (worth a 2-minute decision with your partner)

**1. `POST /audit` should not be a public endpoint.** The audit log is only
tamper-evident if *nothing outside the middleware can write to it*. If an agent
or a browser can POST an audit entry, anyone can forge history and the
hash-chain guarantee is worthless. Recommendation: the middleware writes audit
entries internally as a side effect of the actions it processes — there's no
external POST. If you keep `POST /audit` at all, make it internal-only
(unreachable from an agent or the dashboard). I've modeled it as internal in
the contract; nothing about the demo depends on it.

**2. `GET /action` (no `:id`) is fine but needs to know *which* agent.** "The
agent's current action" is only unambiguous once the request identifies the
agent — so it should be scoped by the signed agent identity (or `?agentId=`),
otherwise "current action" has no subject. Minor; just flagging so it doesn't
bite during integration.

---

## Next (Days 3–5): mission + scope enforcement

The mission resolves to a **deterministic allowlist** (`MissionScope` in the
contract) — no LLM in the enforcement path. `POST /action` looks up the action
`type`: in `allow` → allow, in `requireApproval` → pause, otherwise → deny.
The plain-language mission text is shown to humans; the structured scope is what
enforcement actually checks. The smart NLP mission parser is explicitly later.
