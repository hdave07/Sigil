# Sigil Dashboard (LK's track)

Next.js 14 (App Router) + TypeScript + Tailwind, scaffolded from `sigil_prototype.html`
and the Build Brief endpoint contract (Part 4). Runs entirely on mock data right now — no
backend needed to develop against.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 — redirects to `/agents`.

## Structure

- `app/setup` — mission setup screen (the differentiator screen: plain-language field + the
  structured allowlist it resolves to, per the brief's v0 scope decision)
- `app/agents` — agent list + status
- `app/approvals` — pending-approval queue with real approve/deny/stop actions
- `app/audit` — audit timeline, filterable, hash display
- `lib/types.ts` — shared types matching the backend contract
- `lib/api.ts` — **the one file to change** when HD's real backend is live. Every function
  here (`getMission`, `createMission`, `getAgents`, `createAgent`, `getPendingActions`,
  `getActionStatus`, `decideAction`, `getAuditLog`) maps 1:1 to an endpoint in the brief.
  Swap the mock bodies for `fetch(`${API_BASE}/...`)` calls — page components don't need to
  change.
- `lib/mockData.ts` — seed data (mirrors the demo scenario from Part 3 of the brief)

## Endpoint contract (from the brief, Part 4)

| Function in `lib/api.ts` | Real endpoint |
|---|---|
| `createMission` | `POST /` |
| `getMission` | `GET /mission` |
| `createAgent` | `POST /agent` |
| `getAgents` | `GET /agents` |
| `getPendingActions` | `GET /pending` |
| `getActionStatus` | `GET /action/:id/status` |
| `decideAction` | `POST /action/:id/status` |
| `getAuditLog` | `GET /audit` |

Set `NEXT_PUBLIC_API_BASE` in `.env.local` once the real middleware URL exists.

## Status vs. the build brief (as of Jul 14)

Done: project shell, nav, all 4 screens wired to mock data end-to-end (declare a mission →
see the agent in the list → approve/deny a pending action → see it land in the audit log).

Not done yet: real backend integration (waiting on HD's middleware), delegation view
(explicitly a stretch goal in the brief, not required), visual polish pass.

## Before the Jul 18–22 vacation gap

Given the trip lands mid-build, priority order to protect the Jul 21–22 integration point and
the Jul 23–26 landing window:

1. Finish and sanity-check all 4 screens against mock data (this scaffold gets you most of
   the way — review the approval and audit screens especially, they're the most complex).
2. Confirm the endpoint contract table above with HD *before* leaving — if any shape changes,
   `lib/api.ts` and `lib/types.ts` are the only files that need to move.
3. Push to a shared repo so HD can wire the real backend against `lib/api.ts` even while
   you're offline, if needed.
4. Leave a note on what's mocked vs. real so nothing gets mistaken for done.
