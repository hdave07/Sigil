/**
 * AAuth-isolated crypto: request signing (RFC 9421 HTTP Message Signatures).
 *
 * v0 covered-component set is FIXED and small on purpose:
 *   "@method", "@target-uri", and "content-digest" (only when there is a body).
 * Fixing the set keeps the signature base deterministic and easy to reason
 * about. Broadening it later is a localized change here + verify.ts.
 *
 * The signature label is always `sig1`. Algorithm is always `ed25519`.
 */

const SIG_LABEL = "sig1";

// ---- small encoders -------------------------------------------------------

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Encode a string to ArrayBuffer-backed bytes. The explicit ArrayBuffer keeps
 * TypeScript's strict `BufferSource` checks happy across Node/lib versions.
 */
export function utf8(s: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(enc.length);
  const out = new Uint8Array(buf);
  out.set(enc);
  return out;
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", utf8(input));
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generic SHA-256 hex digest — for mission/audit hashing, NOT request
 * signing. Distinct from contentDigest below, which is base64 and specific
 * to the RFC 9530 Content-Digest header.
 */
export async function sha256Hex(input: string): Promise<string> {
  return toHex(await sha256(input));
}

// ---- content-digest (RFC 9530) -------------------------------------------

/** Build the `Content-Digest` header value for a body: `sha-256=:<base64>:` */
export async function contentDigest(body: string): Promise<string> {
  const digest = await sha256(body);
  return `sha-256=:${toBase64(digest)}:`;
}

// ---- signature base -------------------------------------------------------

export interface CoveredComponents {
  method: string;
  targetUri: string;
  contentDigest?: string; // present iff there is a body
}

export interface SignatureParams {
  keyid: string;
  created: number; // unix seconds
}

/** The ordered list of component identifiers we cover, given whether a body exists. */
function componentIds(hasBody: boolean): string[] {
  const ids = ['"@method"', '"@target-uri"'];
  if (hasBody) ids.push('"content-digest"');
  return ids;
}

/** The inner value of the Signature-Input header (everything after `sig1=`). */
export function signatureInputInner(hasBody: boolean, params: SignatureParams): string {
  const list = componentIds(hasBody).join(" ");
  return `(${list});created=${params.created};keyid="${params.keyid}";alg="ed25519"`;
}

/**
 * Assemble the exact bytes that get signed. Each covered component is one line
 * `"<id>": <value>`, followed by the `@signature-params` line. Lines are joined
 * by a single "\n" with NO trailing newline.
 */
export function buildSignatureBase(
  components: CoveredComponents,
  inner: string
): string {
  const lines: string[] = [];
  lines.push(`"@method": ${components.method.toUpperCase()}`);
  lines.push(`"@target-uri": ${components.targetUri}`);
  if (components.contentDigest !== undefined) {
    lines.push(`"content-digest": ${components.contentDigest}`);
  }
  lines.push(`"@signature-params": ${inner}`);
  return lines.join("\n");
}

// ---- top-level: sign a request -------------------------------------------

export interface SignRequestInput {
  method: string;
  url: string; // full target URI, e.g. https://api.sigil.dev/action
  body?: string; // raw request body, if any
  keyid: string; // must match what the middleware stored at POST /agent
  privateKey: CryptoKey;
  created?: number; // override for testing; defaults to now
}

export interface SignedRequestHeaders {
  "Signature-Input": string;
  Signature: string;
  "Content-Digest"?: string;
}

/**
 * Produce the AAuth signature headers for an outgoing request.
 * The agent SDK attaches these to every request it makes.
 */
export async function signRequest(
  input: SignRequestInput
): Promise<SignedRequestHeaders> {
  const created = input.created ?? Math.floor(Date.now() / 1000);
  const hasBody = input.body !== undefined && input.body.length > 0;

  const cd = hasBody ? await contentDigest(input.body as string) : undefined;
  const inner = signatureInputInner(hasBody, { keyid: input.keyid, created });

  const base = buildSignatureBase(
    { method: input.method, targetUri: input.url, contentDigest: cd },
    inner
  );

  const sigBytes = await crypto.subtle.sign(
    { name: "Ed25519" },
    input.privateKey,
    utf8(base)
  );

  const headers: SignedRequestHeaders = {
    "Signature-Input": `${SIG_LABEL}=${inner}`,
    Signature: `${SIG_LABEL}=:${toBase64(sigBytes)}:`,
  };
  if (cd) headers["Content-Digest"] = cd;
  return headers;
}
