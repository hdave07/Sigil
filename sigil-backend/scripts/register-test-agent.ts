/**
 * Standalone helper for manual end-to-end testing: registers one fresh agent
 * against a running server so there's something real for the dashboard's
 * mission-setup screen to pick from, and saves its key pair to disk so
 * scripts/attempt-action.ts can sign requests as this agent later.
 *
 * Requires the backend server to already be running on port 8787
 * (`npm run dev`, i.e. `tsx scripts/server.ts`) - this script is just an
 * unsigned client hitting that server, not a server itself.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAgentKeyPair, exportPublicKeyJwk, exportPrivateKeyJwk } from "../packages/aauth-core/src/index.js";

const BASE = "http://localhost:8787";

// sigil-backend/.agent-keys - resolved from this file's location, not cwd, so
// it works the same whether run via `npm run` (cwd = sigil-backend) or not.
const KEYS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".agent-keys");

async function main() {
  const name = process.argv[2] ?? "Test Agent";

  const { publicKey, privateKey } = await generateAgentKeyPair();
  const publicKeyJwk = await exportPublicKeyJwk(publicKey);

  // POST /agent is deliberately unsigned - it's the call that establishes an
  // agent's identity in the first place, so there's no key on file yet to
  // verify a signature against.
  const res = await fetch(`${BASE}/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, publicKeyJwk }),
  });

  if (!res.ok) {
    console.error(`registration failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }

  const { agentId } = (await res.json()) as { agentId: string };

  // Real private key material - never sent over the wire, only ever written
  // to disk here so a later script (attempt-action.ts) can sign as this
  // agent. See .gitignore: .agent-keys/ must never be committed.
  const privateKeyJwk = await exportPrivateKeyJwk(privateKey);
  await mkdir(KEYS_DIR, { recursive: true });
  const keyPath = join(KEYS_DIR, `${agentId}.json`);
  await writeFile(keyPath, JSON.stringify({ agentId, name, privateKeyJwk }, null, 2));

  console.log(`Registered "${name}" as agent ${agentId}`);
  console.log(`Saved private key to ${keyPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
