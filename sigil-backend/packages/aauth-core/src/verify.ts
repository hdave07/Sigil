/**
 * AAuth-isolated crypto: request verification (RFC 9421), middleware side.
 *
 * Given a received request + its AAuth headers + the agent's stored public key,
 * decide whether the signature is valid. Also enforces:
 *   - body integrity: the signed content-digest must match the actual body
 *   - freshness: `created` must be within a skew window (replay defense)
 */

import { buildSignatureBase, contentDigest, utf8 } from "./signing.js";

const DEFAULT_MAX_SKEW_SECONDS = 300;

export interface ReceivedRequest {
  method: string;
  url: string; // full target URI as the middleware sees it
  body?: string;
  headers: {
    "signature-input"?: string;
    signature?: string;
    "content-digest"?: string;
  };
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  keyid?: string;
  created?: number;
}

// ---- header parsing (for the format signing.ts emits) --------------------

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface ParsedInput {
  label: string;
  inner: string; // exact substring after "<label>=", reused byte-for-byte
  components: string[]; // e.g. ['"@method"', '"@target-uri"', '"content-digest"']
  keyid: string;
  created: number;
}

function parseSignatureInput(header: string): ParsedInput | null {
  const eq = header.indexOf("=");
  if (eq < 0) return null;
  const label = header.slice(0, eq).trim();
  const inner = header.slice(eq + 1).trim();

  const listMatch = inner.match(/^\(([^)]*)\)/);
  if (!listMatch) return null;
  const components = listMatch[1].length ? listMatch[1].split(" ") : [];

  const keyidMatch = inner.match(/keyid="([^"]+)"/);
  const createdMatch = inner.match(/created=(\d+)/);
  if (!keyidMatch || !createdMatch) return null;

  return {
    label,
    inner,
    components,
    keyid: keyidMatch[1],
    created: parseInt(createdMatch[1], 10),
  };
}

function parseSignature(header: string, label: string): Uint8Array<ArrayBuffer> | null {
  // format: <label>=:<base64>:
  const prefix = `${label}=:`;
  if (!header.startsWith(prefix) || !header.endsWith(":")) return null;
  const b64 = header.slice(prefix.length, -1);
  try {
    return fromBase64(b64);
  } catch {
    return null;
  }
}

// ---- top-level verify -----------------------------------------------------

export interface VerifyOptions {
  /** Import the agent's stored public-key JWK into a CryptoKey. */
  publicKey: CryptoKey;
  maxSkewSeconds?: number;
  now?: number; // override for testing
}

export async function verifyRequest(
  req: ReceivedRequest,
  opts: VerifyOptions
): Promise<VerifyResult> {
  const sigInputHeader = req.headers["signature-input"];
  const sigHeader = req.headers.signature;
  if (!sigInputHeader || !sigHeader) {
    return { valid: false, reason: "missing Signature or Signature-Input header" };
  }

  const parsed = parseSignatureInput(sigInputHeader);
  if (!parsed) return { valid: false, reason: "malformed Signature-Input" };

  const sigBytes = parseSignature(sigHeader, parsed.label);
  if (!sigBytes) return { valid: false, reason: "malformed Signature" };

  // Freshness / replay window.
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const skew = Math.abs(now - parsed.created);
  const maxSkew = opts.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS;
  if (skew > maxSkew) {
    return {
      valid: false,
      reason: `stale signature (created ${skew}s from now, max ${maxSkew}s)`,
      keyid: parsed.keyid,
      created: parsed.created,
    };
  }

  const coversDigest = parsed.components.includes('"content-digest"');

  // Body integrity: the signed content-digest must match the actual body.
  let cd: string | undefined;
  if (coversDigest) {
    if (req.body === undefined) {
      return { valid: false, reason: "content-digest covered but no body present", keyid: parsed.keyid };
    }
    const actual = await contentDigest(req.body);
    const received = req.headers["content-digest"];
    if (received !== undefined && received !== actual) {
      return { valid: false, reason: "Content-Digest header does not match body", keyid: parsed.keyid };
    }
    cd = actual;
  }

  // Rebuild the exact signature base using the RECEIVED inner string.
  const base = buildSignatureBase(
    { method: req.method, targetUri: req.url, contentDigest: cd },
    parsed.inner
  );

  const ok = await crypto.subtle.verify(
    { name: "Ed25519" },
    opts.publicKey,
    sigBytes,
    utf8(base)
  );

  return ok
    ? { valid: true, keyid: parsed.keyid, created: parsed.created }
    : { valid: false, reason: "signature does not verify", keyid: parsed.keyid, created: parsed.created };
}
