/**
 * Seeds a running Sigil middleware (local or deployed) with a realistic demo
 * scenario, over real signed HTTP - nothing here is faked or written direct
 * to a store. Useful before showing the dashboard to someone, since there's
 * no persistence yet (a server restart / redeploy wipes all state).
 *
 * Usage:
 *   SIGIL_BASE=https://your-railway-url npx tsx scripts/seed-demo.ts
 * Defaults to http://localhost:8787 if SIGIL_BASE isn't set.
 *
 * Creates:
 *   - "Research Agent"      - mission declared, 2 actions done (allowed),
 *                             1 action left PENDING (needs_approval) so the
 *                             approval queue has something live to demo.
 *   - "Onboarding Assistant"- mission declared, 2 actions done (allowed),
 *                             nothing pending - shows a "quiet" configured agent.
 *   - "Unconfigured Agent"  - registered, no mission declared at all - shows
 *                             up in /setup's dropdown, nowhere else.
 */

import {
  generateAgentKeyPair,
  exportPublicKeyJwk,
  signRequest,
} from "../packages/aauth-core/src/index.js";

const BASE = process.env.SIGIL_BASE ?? "http://localhost:8787";

const line = (s = "") => console.log(s);

async function registerAgent(name: string) {
  const { publicKey, privateKey } = await generateAgentKeyPair();
  const publicKeyJwk = await exportPublicKeyJwk(publicKey);
  const res = await fetch(`${BASE}/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, publicKeyJwk }),
  });
  if (!res.ok) throw new Error(`register "${name}" failed: ${res.status} ${await res.text()}`);
  const { agentId } = (await res.json()) as { agentId: string };
  return { agentId, privateKey };
}

async function signedFetch(
  method: string,
  path: string,
  keyid: string,
  privateKey: CryptoKey,
  body?: unknown
) {
  const url = `${BASE}${path}`;
  const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
  const headers = await signRequest({ method, url, body: bodyStr, keyid, privateKey });
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Signature-Input": headers["Signature-Input"],
      Signature: headers.Signature,
      ...(headers["Content-Digest"] ? { "Content-Digest": headers["Content-Digest"] } : {}),
    },
    body: bodyStr,
  });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  line(`Seeding ${BASE} ...`);
  line();

  // --- Agent 1: Research Agent - mission declared, 2 done, 1 on standby ---
  const research = await registerAgent("Research Agent");
  line(`[Research Agent] registered (${research.agentId.slice(0, 8)}…)`);

  await signedFetch("POST", "/mission", research.agentId, research.privateKey, {
    text: "Research competitor pricing and draft a summary email for the team",
    scope: {
      allow: ["web.read", "email.draft", "file.write"],
      requireApproval: ["email.send"],
      offMissionKeywords: ["poach", "switch providers"],
    },
  });
  line(`[Research Agent] mission declared`);

  await signedFetch("POST", "/action", research.agentId, research.privateKey, {
    type: "web.read",
    target: "https://competitor.com/pricing",
    detail: "reading competitor's published pricing tiers",
  });
  line(`[Research Agent] action done: web.read (allowed)`);

  await signedFetch("POST", "/action", research.agentId, research.privateKey, {
    type: "email.draft",
    target: "internal team",
    detail: "drafting the competitor pricing summary for the team",
  });
  line(`[Research Agent] action done: email.draft (allowed)`);

  const pendingOutcome = (await signedFetch("POST", "/action", research.agentId, research.privateKey, {
    type: "email.send",
    target: "sales-team distribution list (200 people)",
    detail: "sending the compiled pricing summary to the full sales team",
  })) as { verdict: string; actionId: string };
  line(
    `[Research Agent] action ON STANDBY: email.send -> ${pendingOutcome.verdict} (actionId ${pendingOutcome.actionId})`
  );

  line();

  // --- Agent 2: Onboarding Assistant - mission declared, all done, quiet ---
  const onboarding = await registerAgent("Onboarding Assistant");
  line(`[Onboarding Assistant] registered (${onboarding.agentId.slice(0, 8)}…)`);

  await signedFetch("POST", "/mission", onboarding.agentId, onboarding.privateKey, {
    text: "Set up calendar invites and files for new-hire onboarding",
    scope: {
      allow: ["calendar.create", "file.write"],
      requireApproval: ["crm.query"],
      offMissionKeywords: ["terminate", "offboard"],
    },
  });
  line(`[Onboarding Assistant] mission declared`);

  await signedFetch("POST", "/action", onboarding.agentId, onboarding.privateKey, {
    type: "calendar.create",
    target: "new hire's calendar",
    detail: "scheduling a welcome meeting for the new hire's first day",
  });
  line(`[Onboarding Assistant] action done: calendar.create (allowed)`);

  await signedFetch("POST", "/action", onboarding.agentId, onboarding.privateKey, {
    type: "file.write",
    target: "onboarding checklist doc",
    detail: "filling out the standard onboarding checklist for the new hire",
  });
  line(`[Onboarding Assistant] action done: file.write (allowed)`);

  line();

  // --- Agent 3: registered, no mission declared at all ---------------------
  const unconfigured = await registerAgent("Unconfigured Agent");
  line(`[Unconfigured Agent] registered (${unconfigured.agentId.slice(0, 8)}…) - no mission declared`);

  line();
  line("Done. Summary:");
  line(`  Research Agent       ${research.agentId}  (1 pending action waiting in the approval queue)`);
  line(`  Onboarding Assistant ${onboarding.agentId}`);
  line(`  Unconfigured Agent   ${unconfigured.agentId}  (no mission - shows up in /setup only)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
