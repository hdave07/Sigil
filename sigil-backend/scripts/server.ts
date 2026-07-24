import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { createAgentStore } from "../packages/middleware/src/agents.js";
import { createMissionStore } from "../packages/middleware/src/missions.js";
import { createAuditLog } from "../packages/middleware/src/audit.js";
import { createActionStore } from "../packages/middleware/src/actions.js";
import { importPublicKeyJwk, verifyRequest, peekKeyid } from "../packages/aauth-core/src/index.js";
import type { AgentSummary, MissionScope, PendingApproval } from "../packages/middleware/src/contract.js";

// --- composition root ---------------------------------------------------
// One instance of each store, created once when the server starts, shared
// by every request for as long as this process stays running.
const agents = createAgentStore();
const missions = createMissionStore();
const auditLog = createAuditLog();
const actions = createActionStore(auditLog);

type Variables = { agentId: string };
const app = new Hono<{ Variables: Variables }>();

// Falls back to local dev if DASHBOARD_ORIGIN isn't set (e.g. running
// locally without an .env). Set this on Railway to the real deployed
// Vercel URL once the dashboard is live.
app.use("*", cors({ origin: process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000" }));

/**
 * Verifies a signed agent request before its route handler runs. To check
 * a signature you first need to know WHICH agent's public key to check it
 * against - and that agent id (keyid) is embedded inside the
 * Signature-Input header itself, so it has to be read (peekKeyid) before
 * the actual verification can happen.
 */
async function verifySignedRequest(c: Context<{ Variables: Variables }>, next: Next) {
  const signatureInput = c.req.header("signature-input");
  const signature = c.req.header("signature");
  const contentDigest = c.req.header("content-digest");

  if (!signatureInput || !signature) {
    return c.json({ error: "missing Signature or Signature-Input header" }, 401);
  }

  const keyid = peekKeyid(signatureInput);
  if (!keyid) {
    return c.json({ error: "malformed Signature-Input header" }, 401);
  }

  const jwk = agents.getPublicKeyJwk(keyid);
  if (!jwk) {
    return c.json({ error: "unknown agent" }, 401);
  }

  const bodyText = await c.req.text();
  const publicKey = await importPublicKeyJwk(jwk);
  const result = await verifyRequest(
    {
      method: c.req.method,
      url: c.req.url,
      body: bodyText.length > 0 ? bodyText : undefined,
      headers: {
        "signature-input": signatureInput,
        signature,
        ...(contentDigest ? { "content-digest": contentDigest } : {}),
      },
    },
    { publicKey }
  );

  if (!result.valid) {
    return c.json({ error: result.reason ?? "signature verification failed" }, 401);
  }

  // The verified keyid IS the agent's id - trusted from here on, never
  // re-read from a client-supplied body field.
  c.set("agentId", keyid);
  await next();
}

app.get("/", (c) => c.text("Sigil middleware is alive"));

/**
 * Shared by both ways a mission can be declared (agent self-declares, or
 * the dashboard sets one directly) - one place that calls missions.declare()
 * and writes the audit entry, so neither path can forget to log it.
 */
async function declareMissionForAgent(agentId: string, text: string, scope: MissionScope) {
  const mission = await missions.declare({ agentId, text, scope });
  await auditLog.append({
    agentId,
    event: "mission.declared",
    detail: `mission declared: "${mission.text}"`,
  });
  return mission;
}

/**
 * POST /agent - register an agent + its public key.
 * Deliberately NOT signature-verified: this is the call that establishes
 * an agent's identity in the first place, so there's no key on file yet
 * to verify a signature against.
 */
app.post("/agent", async (c) => {
  const body = await c.req.json<{ name?: string; publicKeyJwk?: JsonWebKey }>();
  if (!body.name || !body.publicKeyJwk) {
    return c.json({ error: "name and publicKeyJwk are required" }, 400);
  }

  const agent = agents.register({ name: body.name, publicKeyJwk: body.publicKeyJwk });

  await auditLog.append({
    agentId: agent.id,
    event: "agent.registered",
    detail: `agent "${agent.name}" registered a new Ed25519 key pair`,
  });

  return c.json({ agentId: agent.id });
});

/** POST /mission (signed) - agent declares its own mission. */
app.post("/mission", verifySignedRequest, async (c) => {
  const agentId = c.get("agentId");
  const body = await c.req.json<{ text?: string; scope?: MissionScope }>();
  if (!body.text || !body.scope) {
    return c.json({ error: "text and scope are required" }, 400);
  }

  const mission = await declareMissionForAgent(agentId, body.text, body.scope);
  return c.json(mission);
});

/**
 * POST /agents/:id/mission - the dashboard sets a mission for an agent
 * directly (the "business owner configures what this agent is for" path).
 * Deliberately NOT signature-verified: this is a human at the dashboard,
 * not an agent proving its own identity. No auth exists on this route yet -
 * same as every other dashboard-facing route today (approve/deny has none
 * either), a known, already-accepted limitation for this demo, not a new
 * regression introduced here.
 */
app.post("/agents/:id/mission", async (c) => {
  const agentId = c.req.param("id");
  if (!agentId) return c.json({ error: "missing agent id" }, 400);
  if (!agents.get(agentId)) return c.json({ error: "unknown agent id" }, 404);

  const body = await c.req.json<{ text?: string; scope?: MissionScope }>();
  if (!body.text || !body.scope) {
    return c.json({ error: "text and scope are required" }, 400);
  }

  const mission = await declareMissionForAgent(agentId, body.text, body.scope);
  return c.json(mission);
});

/** GET /mission (signed) - the verified agent's current mission. */
app.get("/mission", verifySignedRequest, (c) => {
  const mission = missions.getForAgent(c.get("agentId"));
  if (!mission) return c.json({ error: "no mission declared for this agent" }, 404);
  return c.json(mission);
});

/**
 * GET /agents/:id/mission - dashboard reads an agent's current mission,
 * including its full scope (allow/requireApproval/offMissionKeywords).
 * NOT signed - read counterpart of POST /agents/:id/mission, same
 * unsigned/dashboard-facing model. AgentSummary (from GET /agents) is
 * deliberately compact and doesn't carry scope - this is where the full
 * detail lives for a UI that needs it.
 */
app.get("/agents/:id/mission", (c) => {
  const agentId = c.req.param("id");
  if (!agentId) return c.json({ error: "missing agent id" }, 400);
  if (!agents.get(agentId)) return c.json({ error: "unknown agent id" }, 404);

  const mission = missions.getForAgent(agentId);
  if (!mission) return c.json({ error: "no mission declared for this agent" }, 404);
  return c.json(mission);
});

/** POST /action (signed) - attempt an action, checked against the agent's current mission. */
app.post("/action", verifySignedRequest, async (c) => {
  const agentId = c.get("agentId");
  const body = await c.req.json<{ type?: string; target?: string; detail?: string }>();
  if (!body.type || !body.target || !body.detail) {
    return c.json({ error: "type, target, and detail are required" }, 400);
  }

  const mission = missions.getForAgent(agentId);
  if (!mission) return c.json({ error: "no mission declared for this agent" }, 400);

  const { outcome } = await actions.attempt(mission, {
    type: body.type,
    target: body.target,
    detail: body.detail,
  });
  return c.json(outcome);
});

/** GET /action (signed) - the agent's current in-flight action, or null. */
app.get("/action", verifySignedRequest, (c) => {
  const attempt = actions.getCurrentForAgent(c.get("agentId"));
  return c.json(attempt ?? null);
});

/** GET /action/:id/status (signed) - agent polls: am I cleared yet? */
app.get("/action/:id/status", verifySignedRequest, (c) => {
  const actionId = c.req.param("id");
  if (!actionId) return c.json({ error: "missing action id" }, 400);

  const status = actions.status(actionId);
  if (status === undefined) return c.json({ error: "unknown action id" }, 404);
  return c.json({ status });
});

/** GET /agents - dashboard reads the agent list + status + mission text. */
app.get("/agents", (c) => {
  const summaries: AgentSummary[] = agents.all().map((agent) => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    mission: missions.getForAgent(agent.id)?.text ?? null,
  }));
  return c.json(summaries);
});

/** GET /pending - dashboard reads what's awaiting human approval. */
app.get("/pending", (c) => {
  const list: PendingApproval[] = actions.pending().map(({ attempt, outcome }) => {
    const agent = agents.get(attempt.agentId);
    const mission = missions.getById(attempt.missionId);
    return {
      id: attempt.id,
      agentId: attempt.agentId,
      agentName: agent?.name ?? "unknown agent",
      mission: mission?.text ?? "unknown mission",
      actionAttempted: `${attempt.type} on "${attempt.target}"`,
      reason: outcome.reason,
      context: attempt.detail,
      flagType: outcome.flagType!, // always present - pending() only returns paused actions
      timestamp: attempt.createdAt,
    };
  });
  return c.json(list);
});

/** GET /audit - dashboard reads the full audit timeline. */
app.get("/audit", (c) => c.json(auditLog.all()));

/** POST /action/:id/status - human decision on a pending action. NOT signed: this comes from the dashboard, not an agent. */
app.post("/action/:id/status", async (c) => {
  const actionId = c.req.param("id");
  const body = await c.req.json<{ decision?: "approve" | "deny" }>();
  if (body.decision !== "approve" && body.decision !== "deny") {
    return c.json({ error: 'decision must be "approve" or "deny"' }, 400);
  }

  const currentStatus = actions.status(actionId);
  if (currentStatus === undefined) return c.json({ error: "unknown action id" }, 404);
  if (currentStatus !== "pending") return c.json({ error: `already decided: ${currentStatus}` }, 409);

  const decision = body.decision === "approve" ? "approved" : "denied";
  const status = await actions.decide(actionId, decision);
  return c.json({ status });
});

// Railway (and most hosting platforms) assign their own port via PORT and
// expect the app to bind to it - falls back to 8787 for local dev, where
// nothing sets that variable.
const port = Number(process.env.PORT) || 8787;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Sigil middleware listening on port ${info.port}`);
});
