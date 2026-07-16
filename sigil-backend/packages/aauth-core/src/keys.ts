/**
 * AAuth-isolated crypto: key material.
 *
 * Ed25519 via the Web Crypto API (AAuth spec RECOMMENDED curve).
 * No third-party dependency; runs identically in Node 18.4+ and browsers.
 *
 * If AAuth ever swaps its recommended algorithm, this file + signing.ts +
 * verify.ts are the only places that change.
 */

const ALG = { name: "Ed25519" } as const;

export interface AgentKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/** Generate a fresh Ed25519 key pair for an agent. */
export async function generateAgentKeyPair(): Promise<AgentKeyPair> {
  const kp = (await crypto.subtle.generateKey(ALG, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/**
 * Export the PUBLIC key as a JWK. This is what an agent hands the middleware
 * at POST /agent, and what the middleware stores keyed by `keyid`.
 * Shape: { kty: "OKP", crv: "Ed25519", x: "<base64url>" }
 */
export async function exportPublicKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

/** Re-import a stored public-key JWK so the middleware can verify with it. */
export async function importPublicKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, ALG, true, ["verify"]);
}

/**
 * Export the PRIVATE key as a JWK. The agent keeps this secret and never
 * transmits it. Useful only for persisting an agent identity between runs
 * (e.g. a long-lived test agent). Never sent over the wire.
 */
export async function exportPrivateKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

/** Re-import a stored private-key JWK so an agent can sign again. */
export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, ALG, true, ["sign"]);
}
