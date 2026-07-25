/**
 * Standalone helper for manual end-to-end testing: signs and attempts one
 * action as an already-registered agent (see scripts/register-test-agent.ts
 * for how its key pair got saved), against an already-running server.
 *
 * Does NOT start or manage a server - assumes one is already up on
 * http://localhost:8787 (`npm run dev`).
 *
 * Usage: tsx scripts/attempt-action.ts <agentId> <type> <target> <detail>
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importPrivateKeyJwk, signRequest } from "../packages/aauth-core/src/index.js";

const BASE = "http://localhost:8787";
const KEYS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".agent-keys");

async function main() {
  const [agentId, type, target, detail] = process.argv.slice(2);
  if (!agentId || !type || !target || !detail) {
    console.error("usage: tsx scripts/attempt-action.ts <agentId> <type> <target> <detail>");
    process.exit(1);
  }

  const keyPath = join(KEYS_DIR, `${agentId}.json`);
  let saved: { agentId: string; name: string; privateKeyJwk: JsonWebKey };
  try {
    saved = JSON.parse(await readFile(keyPath, "utf8"));
  } catch {
    console.error(`no saved key for agent ${agentId} at ${keyPath} - run register-test-agent.ts first`);
    process.exit(1);
  }

  const privateKey = await importPrivateKeyJwk(saved.privateKeyJwk);
  const body = JSON.stringify({ type, target, detail });
  const url = `${BASE}/action`;
  const headers = await signRequest({ method: "POST", url, body, keyid: agentId, privateKey });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Signature-Input": headers["Signature-Input"],
      Signature: headers.Signature,
      ...(headers["Content-Digest"] ? { "Content-Digest": headers["Content-Digest"] } : {}),
    },
    body,
  });

  const outcome = (await res.json()) as { verdict?: string; flagType?: string; reason?: string };
  if (!res.ok) {
    console.error(`request failed (${res.status}):`, outcome);
    process.exit(1);
  }

  console.log(`verdict: ${outcome.verdict}${outcome.flagType ? ` (flagType: ${outcome.flagType})` : ""}`);
  if (outcome.reason) console.log(`reason: ${outcome.reason}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
