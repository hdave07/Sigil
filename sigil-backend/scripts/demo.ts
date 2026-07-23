/**
 * The one-command demo scenario (Days 9-10) - the exact story from Part 3
 * of the build brief, run over real HTTP against a real server, not
 * in-process function calls like the earlier demo scripts.
 *
 * This script starts the server itself (as a child process) so running it
 * is genuinely one command - no need to open a second terminal.
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  generateAgentKeyPair,
  exportPublicKeyJwk,
  signRequest,
} from "../packages/aauth-core/src/index.js";

const BASE = "http://localhost:8787";

const line = (s = "") => console.log(s);
const pass = (s: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${s}`);
const fail = (s: string) => console.log(`  \x1b[31mFAIL\x1b[0m  ${s}`);

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) pass(label);
  else {
    fail(label);
    failures++;
  }
}

async function waitForServer(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {
      // not up yet - keep polling
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start in time");
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
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Signature-Input": headers["Signature-Input"],
      Signature: headers.Signature,
      ...(headers["Content-Digest"] ? { "Content-Digest": headers["Content-Digest"] } : {}),
    },
    body: bodyStr,
  });
}

async function main() {
  line("=".repeat(70));
  line("SIGIL — one-command demo: the Part 3 story, over real HTTP");
  line("=".repeat(70));

  line();
  line("[server] starting...");
  const server: ChildProcess = spawn("npx", ["tsx", "scripts/server.ts"], { stdio: "ignore" });

  try {
    await waitForServer();
    line(`[server] listening on ${BASE}`);

    // --- agent starts, generates a real key pair, registers ---------------
    const { publicKey, privateKey } = await generateAgentKeyPair();
    const publicKeyJwk = await exportPublicKeyJwk(publicKey);
    const regRes = await fetch(`${BASE}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Research Agent", publicKeyJwk }),
    });
    const { agentId } = (await regRes.json()) as { agentId: string };
    line();
    line(`[agent]  registered as "Research Agent" (${agentId.slice(0, 8)}…)`);

    // --- declares its mission ----------------------------------------------
    const missionRes = await signedFetch("POST", "/mission", agentId, privateKey, {
      text: "research competitor pricing, draft a summary email",
      scope: {
        allow: ["web.read", "email.draft", "file.write"],
        requireApproval: ["email.send"],
        offMissionKeywords: ["switch providers", "poach"],
      },
    });
    const mission = (await missionRes.json()) as { text: string };
    line(`[agent]  declared mission: "${mission.text}"`);

    line();
    line("[middleware] the demo story from the brief, over real HTTP:");
    line("-".repeat(70));

    // --- Action 1: read a public webpage -> IN BOUNDS ----------------------
    const readRes = await signedFetch("POST", "/action", agentId, privateKey, {
      type: "web.read",
      target: "https://competitor.com/pricing",
      detail: "reading competitor's published pricing tiers",
    });
    const readOutcome = (await readRes.json()) as { verdict: string };
    check("Action 1: read a public webpage -> IN BOUNDS, allowed", readOutcome.verdict === "allow");

    // --- Action 2: open a document to write -> IN BOUNDS -------------------
    const draftRes = await signedFetch("POST", "/action", agentId, privateKey, {
      type: "email.draft",
      target: "internal team",
      detail: "drafting the competitor pricing summary for the team",
    });
    const draftOutcome = (await draftRes.json()) as { verdict: string };
    check("Action 2: open a document to write -> IN BOUNDS, allowed", draftOutcome.verdict === "allow");

    // --- Action 3: send email to 200 contacts -> OUT OF BOUNDS, PAUSED -----
    const sendRes = await signedFetch("POST", "/action", agentId, privateKey, {
      type: "email.send",
      target: "sales-team distribution list (200 people)",
      detail: "sending the compiled pricing summary to the full sales team",
    });
    const sendOutcome = (await sendRes.json()) as { verdict: string; flagType?: string; actionId: string };
    check(
      "Action 3: send email to 200 contacts -> OUT OF BOUNDS, PAUSED",
      sendOutcome.verdict === "pause" && sendOutcome.flagType === "needs_approval"
    );
    line("         [agent] paused - notification fires, agent waits...");

    // --- agent polls: still pending -----------------------------------------
    const pollBefore = await signedFetch("GET", `/action/${sendOutcome.actionId}/status`, agentId, privateKey);
    const pollBeforeBody = (await pollBefore.json()) as { status: string };
    check("agent polls -> status: pending", pollBeforeBody.status === "pending");

    // --- dashboard would see this in GET /pending ---------------------------
    const pendingRes = await fetch(`${BASE}/pending`);
    const pendingList = (await pendingRes.json()) as { id: string }[];
    check(
      "human opens dashboard, sees it in GET /pending with full context",
      pendingList.some((p) => p.id === sendOutcome.actionId)
    );

    // --- human clicks APPROVE ------------------------------------------------
    const approveRes = await fetch(`${BASE}/action/${sendOutcome.actionId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    check("human clicks APPROVE", approveRes.ok);

    // --- agent resumes, sends, continues -------------------------------------
    const pollAfter = await signedFetch("GET", `/action/${sendOutcome.actionId}/status`, agentId, privateKey);
    const pollAfterBody = (await pollAfter.json()) as { status: string };
    check("agent resumes -> status: approved, sends, continues", pollAfterBody.status === "approved");

    // --- audit trail shows the whole story, cryptographically chained -------
    const auditRes = await fetch(`${BASE}/audit`);
    const auditList = (await auditRes.json()) as unknown[];
    check(`audit trail shows the whole story (${auditList.length} chained entries)`, auditList.length >= 6);

    line("-".repeat(70));
    line();
    line(
      failures === 0
        ? "Demo complete: the whole story ran end to end, over real HTTP, nothing faked."
        : `${failures} step(s) failed - see above.`
    );
    line("=".repeat(70));
  } finally {
    server.kill();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
