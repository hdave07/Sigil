/**
 * Append-only, hash-chained audit log.
 *
 * Every entry commits to the previous entry's hash, so any edit to a past
 * entry breaks the chain from that point onward. This is the ONLY place
 * that constructs an AuditEntry - "every event gets logged" is a property
 * of the store, not something a caller can forget to do.
 *
 *   hash = SHA-256( canonical(id, agentId, event, detail, timestamp, previousHash) )
 *
 * matching the formula documented on AuditEntry in contract.ts. `type` and
 * `flagType` are NOT part of the hash (display/coloring metadata only, per
 * contract.ts's doc comment). The first entry's previousHash is "GENESIS".
 */

import { sha256Hex } from "../../aauth-core/src/index.js";
import type { AuditEntry, AuditEventType, FlagType } from "./contract.js";

const GENESIS = "GENESIS";

export interface AppendAuditEntryInput {
  agentId: string;
  event: string;
  type?: AuditEventType;
  detail: string;
  flagType?: FlagType;
}

type HashedFields = Pick<
  AuditEntry,
  "id" | "agentId" | "event" | "detail" | "timestamp" | "previousHash"
>;

/** Pure: recomputes what an entry's hash SHOULD be from its chained fields. */
export async function computeEntryHash(fields: HashedFields): Promise<string> {
  const canonical = JSON.stringify({
    id: fields.id,
    agentId: fields.agentId,
    event: fields.event,
    detail: fields.detail,
    timestamp: fields.timestamp,
    previousHash: fields.previousHash,
  });
  return sha256Hex(canonical);
}

export interface ChainVerification {
  valid: boolean;
  /** index of the first entry whose stored hash or link is wrong, if any */
  brokenAtIndex?: number;
}

/** Pure: walks the chain, checking both the links and each entry's own hash. */
export async function verifyChain(entries: AuditEntry[]): Promise<ChainVerification> {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrevious = i === 0 ? GENESIS : entries[i - 1].hash;
    if (entry.previousHash !== expectedPrevious) return { valid: false, brokenAtIndex: i };
    if (entry.hash !== (await computeEntryHash(entry))) return { valid: false, brokenAtIndex: i };
  }
  return { valid: true };
}

export interface AuditLog {
  append(input: AppendAuditEntryInput): Promise<AuditEntry>;
  /** Snapshot (copy) of the full chain, in append order. */
  all(): AuditEntry[];
}

/**
 * In-memory audit log factory. One instance per running middleware/demo.
 * NOTE: append() reads the last entry's hash then pushes - safe under a
 * single sequential caller (true for every script in this repo so far).
 * A real concurrent HTTP server later would need a queue/mutex around
 * append() to avoid two concurrent calls computing against the same
 * previousHash.
 */
export function createAuditLog(): AuditLog {
  const entries: AuditEntry[] = [];

  async function append(input: AppendAuditEntryInput): Promise<AuditEntry> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const previousHash = entries.length > 0 ? entries[entries.length - 1].hash : GENESIS;

    const hash = await computeEntryHash({
      id,
      agentId: input.agentId,
      event: input.event,
      detail: input.detail,
      timestamp,
      previousHash,
    });

    const entry: AuditEntry = {
      id,
      agentId: input.agentId,
      event: input.event,
      ...(input.type !== undefined ? { type: input.type } : {}),
      detail: input.detail,
      ...(input.flagType !== undefined ? { flagType: input.flagType } : {}),
      timestamp,
      hash,
      previousHash,
    };
    entries.push(entry);
    return entry;
  }

  function all(): AuditEntry[] {
    return [...entries];
  }

  return { append, all };
}
