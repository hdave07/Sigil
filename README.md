# Sigil

A permission-and-oversight layer for AI agents: agents prove their identity
with real Ed25519 signatures, declare a mission that resolves to a
**deterministic** allowed-actions scope (no LLM in the enforcement path), and
any action outside that scope pauses for a human instead of failing silently
or running unchecked. Every attempt — allowed, paused, approved, or denied —
lands in a hash-chained, tamper-evident audit log.

The differentiator isn't just "is this action type permitted" (a type-only
allowlist any competitor can build) — it's catching an agent using a
**fully-permitted** action type to do something that doesn't actually serve
its mission (e.g. an agent allowed to draft emails using that permission to
try to poach a competitor's customers instead of the summary it was asked
for). See [`docs/CONTRACT.md`](docs/CONTRACT.md) §6 for the exact two-phase
check that makes this possible.

## Repo layout

```
sigil-backend/     Real Hono middleware — identity, mission enforcement,
                    pause/approve/resume, hash-chained audit log
sigil-dashboard/    Next.js dashboard — set missions, review paused actions,
                    browse the audit timeline
docs/CONTRACT.md    The authoritative object shapes + endpoint contract
                    between the two — read this before touching lib/api.ts
                    or contract.ts
```

Each subproject has its own `README.md` with more detail
([backend](sigil-backend/README.md), [dashboard](sigil-dashboard/README.md));
this one is the map between them.

## Quickstart (run both together)

```bash
# terminal 1 — backend, http://localhost:8787
cd sigil-backend
npm install
npm run dev

# terminal 2 — dashboard, http://localhost:3000
cd sigil-dashboard
npm install
echo "NEXT_PUBLIC_API_BASE=http://localhost:8787" > .env.local
npm run dev
```

Open http://localhost:3000 — it redirects to `/agents`. The backend is
in-memory only (no persistence yet), so state resets on restart; use the
helper scripts below to populate it.

### Useful backend scripts

All run via `npm run <name>` from `sigil-backend/` against a server already
listening on 8787 unless noted:

| Script | What it does |
|---|---|
| `dev` / `start` | Starts the server |
| `seed-demo` | Populates a running server with a full demo scenario over real signed HTTP |
| `register-test-agent -- "<name>"` | Registers a fresh agent, saves its keypair to `.agent-keys/` (gitignored — real private keys) |
| `attempt-action -- <agentId> <type> <target> <detail>` | Signs and attempts one action as a saved agent, prints the verdict |
| `demo` | One-command, self-contained run of the full Part 3 story (spawns its own server) |
| `roundtrip` | Standalone signing/verification proof — no server needed |
| `mission-demo`, `pause-resume-demo` | Earlier in-process checkpoints for mission enforcement and the pause/approve flow |

## What's real vs. deferred

**Real:** Ed25519 signing (RFC 9421 HTTP message signatures) with zero
third-party crypto dependencies, all 10 contract endpoints live over HTTP,
deterministic mission-scope enforcement, the pause/approve/deny state
machine, and a hash-chained audit log where tampering with any past entry is
detectable.

**Not yet built:** persistence (everything lives in memory and resets on
restart), authentication on the dashboard-facing routes (a known, accepted
gap for this stage), and agent delegation (parent/child agents) is
scaffolded in the dashboard's types but not wired to anything real on the
backend.

## Deploying

The backend reads `PORT` and `DASHBOARD_ORIGIN` from the environment
(falling back to `8787` / `http://localhost:3000` for local dev), and has a
`start` script — see `sigil-backend/scripts/server.ts`. Set
`NEXT_PUBLIC_API_BASE` on the dashboard to wherever the backend ends up.
