/**
 * Day 6-8 checkpoint: pause / approve / resume + hash-chained audit log.
 *
 * Full reenactment, escalating on the prior two checkpoints: every action
 * is signed and verified (Day 1-2), checked against the mission (Day 3-5),
 * then tracked through pause/resume with every event chained into the
 * audit log (Day 6-8, this file). Terminal only, no server yet.
 */

import {
  generateAgentKeyPair,
  exportPublicKeyJwk,
  importPublicKeyJwk,
  signRequest,
  verifyRequest,
  type ReceivedRequest,
} from "../packages/aauth-core/src/index.js";
import { declareMission } from "../packages/middleware/src/mission.js";
import { createAuditLog, computeEntryHash, verifyChain } from "../packages/middleware/src/audit.js";
import { createActionStore } from "../packages/middleware/src/actions.js";
import type { Mission } from "../packages/middleware/src/contract.js";

const line = (s = "") => console.log(s);
const pass = (s: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${s}`);
const fail = (s: string) => console.log(`  \x1b[31mFAIL\x1b[0m  ${s}`);

const agentStore = new Map<string, JsonWebKey>();

async function main() {
  line("=".repeat(64));
  line("SIGIL — Day 6-8: pause / approve / resume + hash-chained audit log");
  line("=".repeat(64));

  const auditLog = createAuditLog();
  const actions = createActionStore(auditLog);

  // --- agent registers, same as Day 1-2 ----------------------------------
  const keyid = "agent-research-01";
  const { publicKey, privateKey } = await generateAgentKeyPair();
  agentStore.set(keyid, await exportPublicKeyJwk(publicKey));
  await auditLog.append({
    agentId: keyid,
    event: "agent.registered",
    detail: `agent "${keyid}" registered a new Ed25519 key pair`,
  });
  line();
  line(`[agent]  registered as "${keyid}"`);

  // --- mission declared, same as Day 3-5 ---------------------------------
  const mission: Mission = await declareMission({
    agentId: keyid,
    text: "research competitor pricing, draft a summary email",
    scope: {
      allow: ["web.read", "email.draft", "file.write"],
      requireApproval: ["email.send"],
      offMissionKeywords: ["switch providers", "poach"],
    },
  });
  await auditLog.append({
    agentId: keyid,
    event: "mission.declared",
    detail: `mission declared: "${mission.text}" (hash ${mission.hash.slice(0, 12)}…)`,
  });
  line(`[agent]  declared mission: "${mission.text}"`);

  // --- helper: sign + verify one action, same pattern as mission-demo.ts -
  async function signAndVerify(action: { type: string; target: string; detail: string }) {
    const request = {
      method: "POST",
      url: "https://api.sigil.dev/action",
      body: JSON.stringify(action),
    };
    const headers = await signRequest({ ...request, keyid, privateKey });
    const received: ReceivedRequest = {
      ...request,
      headers: {
        "signature-input": headers["Signature-Input"],
        signature: headers.Signature,
        "content-digest": headers["Content-Digest"],
      },
    };
    const jwk = agentStore.get(keyid)!;
    const key = await importPublicKeyJwk(jwk);
    const result = await verifyRequest(received, { publicKey: key });
    if (!result.valid) throw new Error(`signature failed to verify: ${result.reason}`);
    return action;
  }

  line();
  line("[middleware] signed, verified, mission-checked, pause/resume-tracked:");
  line("-".repeat(64));

  // 1. in-bounds action -> allowed immediately, no pause -------------------
  {
    const action = await signAndVerify({
      type: "web.read",
      target: "https://competitor.com/pricing",
      detail: "reading competitor's published pricing tiers",
    });
    const { attempt, outcome } = await actions.attempt(mission, action);
    const status = actions.status(attempt.id);
    if (outcome.verdict === "allow" && status === "approved") {
      pass(`read competitor's pricing page -> allow, status "${status}" (never paused)`);
    } else {
      fail(`expected allow/approved, got ${outcome.verdict}/${status}`);
    }
  }

  // 2. needs_approval action -> pauses, human approves, agent resumes -----
  {
    const action = await signAndVerify({
      type: "email.send",
      target: "sales-team distribution list (200 people)",
      detail: "sending the compiled pricing summary to the full sales team",
    });
    const { attempt, outcome } = await actions.attempt(mission, action);

    const beforeApproval = actions.status(attempt.id);
    if (outcome.verdict === "pause" && beforeApproval === "pending") {
      pass(`email the summary to 200 contacts -> pause/needs_approval, agent polls: "pending"`);
    } else {
      fail(`expected pause/pending, got ${outcome.verdict}/${beforeApproval}`);
    }

    // simulating a human clicking Approve in the dashboard
    const decision = await actions.decide(attempt.id, "approved");
    const afterApproval = actions.status(attempt.id);
    if (decision === "approved" && afterApproval === "approved") {
      pass(`human approves -> agent polls again: "${afterApproval}"`);
      line(`         [agent] resuming - sending the email now that it's approved.`);
    } else {
      fail(`expected approved, got decide=${decision}, status=${afterApproval}`);
    }
  }

  // 3. a second pausing action -> human denies, agent stands down ---------
  {
    const action = await signAndVerify({
      type: "crm.query",
      target: "internal CRM customer accounts",
      detail: "cross-referencing competitor pricing against our own customer accounts to flag at-risk renewals",
    });
    const { attempt, outcome } = await actions.attempt(mission, action);

    const beforeDenial = actions.status(attempt.id);
    if (outcome.verdict === "pause" && beforeDenial === "pending") {
      pass(`query internal CRM -> pause/not_permitted, agent polls: "pending"`);
    } else {
      fail(`expected pause/pending, got ${outcome.verdict}/${beforeDenial}`);
    }

    // simulating a human clicking Deny in the dashboard
    const decision = await actions.decide(attempt.id, "denied");
    const afterDenial = actions.status(attempt.id);
    if (decision === "denied" && afterDenial === "denied") {
      pass(`human denies -> agent polls again: "${afterDenial}"`);
      line(`         [agent] does not proceed - action was denied, continuing to next task.`);
    } else {
      fail(`expected denied, got decide=${decision}, status=${afterDenial}`);
    }
  }

  line("-".repeat(64));

  // --- audit chain integrity ----------------------------------------------
  const entries = auditLog.all();
  const verification = await verifyChain(entries);
  line();
  line(`[audit] ${entries.length} entries recorded, verifying the hash chain:`);
  if (verification.valid) {
    pass(`audit chain is intact (all ${entries.length} entries link correctly to "GENESIS")`);
  } else {
    fail(`chain broken at index ${verification.brokenAtIndex}`);
  }

  // --- tamper-evidence proof ------------------------------------------------
  const target = entries[entries.length - 1];
  const tampered = { ...target, detail: "TAMPERED: " + target.detail };
  const recomputed = await computeEntryHash(tampered);
  if (recomputed !== tampered.hash) {
    pass(`tampering detected - editing one entry's detail invalidates its recorded hash`);
  } else {
    fail(`tampering NOT detected — bug!`);
  }

  line("-".repeat(64));
  line();
  line("Day 6-8 checkpoint: if all seven say PASS, pause/resume + the audit chain are real.");
  line("=".repeat(64));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
