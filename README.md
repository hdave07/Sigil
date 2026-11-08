# Sigil

**Sigil allows a company to say, in plain language, what each of its AI agents is *for* and then stops the agent the moment it does something that doesn't fit, until it receives human approval.**

It's built on [AAuth](https://github.com/dickhardt/AAuth), an emerging IETF standard for agent authentication written by Dick Hardt (the author of OAuth 2.0). This repo is the working prototype with cryptographic agent identity, enforcement, an approval dashboard, and a tamper-evident record of everything that happened.

---

## The problem

AI agents now run for hours on their own, reading files, drafting and sending email, querying databases, calling dozens of tools, with no human watching each step.

The security tools companies already have were built for a person clicking a button once. They answer one question: *is this account allowed to do this kind of thing?* For an agent, that isn't enough. Most companies today can **see** what their agents did, after the fact. They can't **stop** an agent in the middle of a task when it starts going somewhere it shouldn't.

## What Sigil does

1. **Every agent gets its own identity.** The agent creates a cryptographic key pair and signs every request, so you can prove *which* agent did *what*.
2. **Every agent declares a mission.** A plain-language statement of its job — e.g. *"Research competitor pricing and write a summary for the sales team."*
3. **Every action is checked against that mission while the agent runs.** Actions that fit go through. Actions that don't are **paused, not killed**; the agent waits in place.
4. **A human approves or denies in the dashboard.** On approval, the agent picks up exactly where it stopped.
5. **Everything is recorded in a tamper-evident log.** Each entry is cryptographically chained to the one before it, so editing or deleting any past entry is detectable.

## What makes it different:

Most agent-permission tools check one thing: *is this type of action allowed?* Sigil checks two things:

| Check | Question | Example |
|---|---|---|
| **1. Permission** | Was this agent ever given this kind of action? | A pricing-research agent tries to query the CRM → **paused: not permitted** |
| **2. Mission** | It's allowed, but does *this specific* action serve the mission? | The same agent is allowed to draft emails, and uses that to draft outreach luring a competitor's customers to switch → **paused: off-mission** |

The second case is the one a permission check alone can't catch: every individual step is technically allowed, but the agent is no longer doing its job. That's the screen that matters — the dashboard shows the action type as *allowed* and the decision as *paused*, with the reason why.

A third category, **needs approval**, covers actions that are always worth a human look no matter the mission (like sending email to 200 people).

> **Honest note on v0:** the mission check today is deterministic — each mission carries a short list of "off-mission" signals that are matched against what the action is doing. It's deliberately simple: it proves the second gate is real and enforced in the request path. Richer semantic matching is the next step. **No LLM ever sits in the enforcement path.** An LLM is used only as an optional helper that *suggests* a scope from the mission text when a human is setting it up; the human reviews and edits it before it takes effect.

## See it in action

The demo story (every step is real signed HTTP against a real server):

```
Agent registers, creates its key pair
Agent declares mission: "Research competitor pricing, write a summary"

  read competitor's pricing page        → ALLOWED      (logged)
  draft the pricing summary             → ALLOWED      (logged)
  draft outreach to poach their customers → PAUSED: off-mission
  send summary to 200-person sales list → PAUSED: needs approval
        ↳ agent waits · human reviews in dashboard · approves
        ↳ agent resumes and sends

Audit log shows every step, each entry hash-chained to the last.
```

### Run it yourself

Requires a recent version of Node.js.

```bash
# One command, terminal only — starts its own server and runs the
# read → draft → pause → approve → resume story
cd sigil-backend
npm install
npm run demo

# The off-mission catch specifically (all three verdicts side by side)
npm run mission-demo
```

To see it in the dashboard:

```bash
# terminal 1 — backend on http://localhost:8787
cd sigil-backend
npm install
npm run dev

# terminal 2 — dashboard on http://localhost:3000
cd sigil-dashboard
npm install
echo "NEXT_PUBLIC_API_BASE=http://localhost:8787" > .env.local
npm run dev

# terminal 3 — fill the dashboard with a demo scenario
cd sigil-backend
npm run seed-demo
```

Then open http://localhost:3000.

**Dashboard screens:**
- **Setup** — write an agent's mission in plain language and define what it's allowed to do
- **Agents** — every agent, its mission, and whether it's running or waiting on you
- **Approvals** — paused actions with full context: what the agent was doing, what it wants to do, and *why* it was stopped (not permitted / off-mission / needs approval)
- **Audit** — the full timeline, readable by a non-technical reviewer, with each entry's hash visible

## Who it's for

Mid-market companies in regulated industries, intech, healthtech, insurance, that build their own agent workflows and are moving from pilots to production, but don't have the in-house security team a large enterprise would use to build this themselves.

The setup is technical and done once by engineers. The ongoing part, deciding what an agent is for, and approving or denying what it does, is meant for the people who actually own the work, not just the security team.

## Why build on AAuth

AAuth is a protocol and not a product. It describes how agents should prove who they are and get permission, so that any agent can work with any system. OAuth was the same: a standard that companies like Auth0 turned into something businesses could actually use.

Sigil aims to be that usable layer for agents: built on the open standard rather than a proprietary format a customer gets locked into, with mission enforcement and human-readable oversight on top.

## How it's built

```
 ┌─────────────┐   signed requests    ┌──────────────────────┐
 │  AI agent   │ ───────────────────▶ │   Sigil middleware   │
 │  key pair   │                      │  1. verify signature │
 │  + mission  │ ◀─────────────────── │  2. permission check │
 └─────────────┘  allow / pause       │  3. mission check    │
       ▲                              │  4. write audit log  │
       │ resumes on approval          └──────────┬───────────┘
       │                                         │
       │                              ┌──────────▼───────────┐
       └────────── approve / deny ─── │      Dashboard       │
                                      └──────────────────────┘
```

- **`sigil-backend/`** — TypeScript + Hono
  - `packages/aauth-core` — Ed25519 keys and HTTP Message Signatures (RFC 9421) using the built-in Web Crypto API, no third-party crypto libraries. Kept separate from everything else so the protocol layer can change without touching enforcement.
  - `packages/middleware` — the permission and mission checks, pause / approve / resume, and the hash-chained audit log
  - `scripts/` — the server and the demo scripts
- **`sigil-dashboard/`** — Next.js + Tailwind
- **`docs/CONTRACT.md`** — the exact API and data shapes shared by backend and dashboard; §6 spells out the enforcement order step by step

### Backend scripts

Run from `sigil-backend/` with `npm run <name>`:

| Script | What it does |
|---|---|
| `demo` | Full story in one command (starts its own server) |
| `dev` / `start` | Starts the server on port 8787 |
| `seed-demo` | Fills a running server with a demo scenario, including an off-mission catch |
| `mission-demo` | Shows all three verdicts: allowed, not permitted, off-mission |
| `pause-resume-demo` | Shows an agent pausing, waiting, and resuming on approval |
| `roundtrip` | Proves signing and verification on their own, no server needed |
| `register-test-agent -- "<name>"` | Registers a new agent and saves its keys locally (gitignored) |
| `attempt-action -- <agentId> <type> <target> <detail>` | Signs and sends one action, prints the verdict |

## Development Status

**Built:** per-agent cryptographic identity and signed requests, the permission and mission checks, pause / approve / deny / resume, and the tamper-evident audit log — all running over real HTTP between real processes.

**Not yet built:**
- **Persistence** — state is in memory and resets when the server restarts
- **Auth on dashboard routes** — accepted gap for a prototype
- **Plugging into a company's existing agent setup** — the demo agent talks to Sigil directly; the plan is to attach once at the framework or cloud level rather than per agent
- **Sub-agent limits** (a helper agent can never have more permission than its parent) — designed, not wired up
- **Semantic mission matching** — v0 uses the deterministic check described above
- **Real third-party tools** — actions in the demo hit mock endpoints; the point is the enforcement, not the integrations
