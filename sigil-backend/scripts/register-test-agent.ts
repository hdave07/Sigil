/**
 * Standalone helper for manual end-to-end testing: registers one fresh agent
 * against a running server so there's something real for the dashboard's
 * mission-setup screen to pick from.
 *
 * Requires the backend server to already be running on port 8787
 * (`npm run dev`, i.e. `tsx scripts/server.ts`) - this script is just an
 * unsigned client hitting that server, not a server itself.
 */

import { generateAgentKeyPair, exportPublicKeyJwk } from "../packages/aauth-core/src/index.js";

const BASE = "http://localhost:8787";

async function main() {
  const name = process.argv[2] ?? "Test Agent";

  const { publicKey } = await generateAgentKeyPair();
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
  console.log(`Registered "${name}" as agent ${agentId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
