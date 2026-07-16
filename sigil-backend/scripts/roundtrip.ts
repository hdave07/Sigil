/**
 * Day 1-2 checkpoint: one agent, one middleware, terminal only.
 *
 * Agent signs a request. Middleware verifies it. Then we tamper with the
 * request four ways and confirm every tamper is rejected. If this all prints
 * as expected, the cryptographic foundation is sound and everything else
 * (missions, pause/resume, audit chain) can be built on top of it.
 */

import {
  generateAgentKeyPair,
  exportPublicKeyJwk,
  importPublicKeyJwk,
  signRequest,
  verifyRequest,
  type ReceivedRequest,
} from "../packages/aauth-core/src/index.js";

const line = (s = "") => console.log(s);
const pass = (s: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${s}`);
const fail = (s: string) => console.log(`  \x1b[31mFAIL\x1b[0m  ${s}`);

/** A minimal stand-in for the middleware's agent store (real store = Supabase). */
const agentStore = new Map<string, JsonWebKey>();

async function main() {
  line("=".repeat(64));
  line("SIGIL — Day 1-2: Ed25519 signing + RFC 9421 verification");
  line("=".repeat(64));

  // --- POST /agent : agent registers its public key -----------------------
  const keyid = "agent-research-01";
  const { publicKey, privateKey } = await generateAgentKeyPair();
  const pubJwk = await exportPublicKeyJwk(publicKey);
  agentStore.set(keyid, pubJwk);

  line();
  line(`[agent]  generated Ed25519 key pair, registered as "${keyid}"`);
  line(`[store]  public JWK: ${JSON.stringify({ kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x?.slice(0, 16) + "…" })}`);

  // --- agent signs a POST /action request ---------------------------------
  const request = {
    method: "POST",
    url: "https://api.sigil.dev/action",
    body: JSON.stringify({
      type: "email.send",
      target: "200 external contacts",
      detail: "email the competitor-pricing summary out",
    }),
  };

  const headers = await signRequest({
    method: request.method,
    url: request.url,
    body: request.body,
    keyid,
    privateKey,
  });

  line();
  line("[agent]  signed request headers:");
  line(`  Signature-Input: ${headers["Signature-Input"]}`);
  line(`  Signature:       ${headers.Signature.slice(0, 40)}…`);
  line(`  Content-Digest:  ${headers["Content-Digest"]}`);

  // helper to build what the middleware "receives"
  const received = (over: Partial<ReceivedRequest> = {}): ReceivedRequest => ({
    method: request.method,
    url: request.url,
    body: request.body,
    headers: {
      "signature-input": headers["Signature-Input"],
      signature: headers.Signature,
      "content-digest": headers["Content-Digest"],
    },
    ...over,
  });

  async function verifyAs(keyidToUse: string, req: ReceivedRequest, opts: { now?: number } = {}) {
    const jwk = agentStore.get(keyidToUse);
    if (!jwk) return { valid: false, reason: "unknown agent" };
    const key = await importPublicKeyJwk(jwk);
    return verifyRequest(req, { publicKey: key, now: opts.now });
  }

  line();
  line("[middleware] verification results:");
  line("-".repeat(64));

  // 1. honest request -> must verify
  {
    const r = await verifyAs(keyid, received());
    r.valid ? pass("honest request verifies") : fail(`honest request rejected: ${r.reason}`);
  }

  // 2. tampered body -> must reject
  {
    const tampered = received({
      body: request.body.replace("200 external contacts", "2 internal contacts"),
    });
    const r = await verifyAs(keyid, tampered);
    !r.valid ? pass(`tampered body rejected (${r.reason})`) : fail("tampered body ACCEPTED — bug!");
  }

  // 3. tampered method -> must reject
  {
    const r = await verifyAs(keyid, received({ method: "GET" }));
    !r.valid ? pass(`tampered method rejected (${r.reason})`) : fail("tampered method ACCEPTED — bug!");
  }

  // 4. wrong signer's key -> must reject
  {
    const other = await generateAgentKeyPair();
    agentStore.set("impostor", await exportPublicKeyJwk(other.publicKey));
    const r = await verifyAs("impostor", received());
    !r.valid ? pass(`wrong public key rejected (${r.reason})`) : fail("wrong key ACCEPTED — bug!");
  }

  // 5. stale timestamp -> must reject (replay window)
  {
    const farFuture = Math.floor(Date.now() / 1000) + 10_000;
    const r = await verifyAs(keyid, received(), { now: farFuture });
    !r.valid ? pass(`stale signature rejected (${r.reason})`) : fail("stale signature ACCEPTED — bug!");
  }

  line("-".repeat(64));
  line();
  line("Day 1-2 checkpoint: if all five say PASS, the foundation is real.");
  line("=".repeat(64));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
