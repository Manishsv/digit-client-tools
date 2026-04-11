/**
 * Local API for DIGIT provision console — proxies to platform services (CORS-safe).
 * Port 3847. Do not expose to the public internet without auth.
 */
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PROVISION_CONSOLE_API_PORT || 3847);
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "8mb" }));
app.use(express.text({ type: ["text/plain", "application/yaml", "text/yaml"], limit: "8mb" }));

function decodeJwt(token) {
  if (!token || typeof token !== "string") throw new Error("JWT required");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = parts[1];
  const pad = 4 - (payload.length % 4);
  const b64 = payload + (pad < 4 ? "=".repeat(pad) : "");
  const json = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json);
}

function tenantFromJwt(token) {
  const { iss } = decodeJwt(token);
  if (!iss || typeof iss !== "string") throw new Error("JWT missing iss");
  const segs = iss.split("/");
  return String(segs[segs.length - 1] || "").trim();
}

/** After Flyway V20260404120000: 255; client audit id still truncated to 64 for legacy safety. */
const BOUNDARY_VARCHAR = 255;
const BOUNDARY_CLIENT_ID_MAX = 64;

function clientHeaders(jwt) {
  const claims = decodeJwt(jwt);
  const sub = claims.sub;
  if (!sub) throw new Error("JWT missing sub");
  const tenant = tenantFromJwt(jwt);
  return {
    Authorization: `Bearer ${jwt}`,
    "X-Tenant-ID": tenant,
    "X-Client-ID": sub,
    "X-Client-Id": sub,
  };
}

/** Truncate JWT sub for X-Client-Id (boundary createdby column was VARCHAR(64)). */
function boundaryClientId(jwt) {
  const sub = decodeJwt(jwt).sub;
  if (!sub) throw new Error("JWT missing sub");
  return sub.length > BOUNDARY_CLIENT_ID_MAX ? sub.slice(0, BOUNDARY_CLIENT_ID_MAX) : sub;
}

function boundaryHeaders(jwt) {
  const tenant = tenantFromJwt(jwt);
  if (tenant.length > BOUNDARY_VARCHAR) {
    throw new Error(
      `Realm is ${tenant.length} characters; boundary service allows ${BOUNDARY_VARCHAR} (tenantId column). Use a shorter tenant code in Account/Keycloak.`
    );
  }
  const cid = boundaryClientId(jwt);
  return {
    Authorization: `Bearer ${jwt}`,
    "X-Tenant-ID": tenant,
    "X-Client-ID": cid,
    "X-Client-Id": cid,
  };
}

/** Stock MDMS v2 image: eg_mdms_* uses VARCHAR(64) for tenantid, createdby, lastmodifiedby. */
const MDMS_VARCHAR = 64;
/**
 * Observed behavior (mdms-v2 image used in local stack): auditDetails.createdBy may get duplicated
 * into a comma-separated string (e.g. "uuid, uuid"), which can overflow VARCHAR(64).
 * Keep our provided audit ids short enough that even a duplicated value still fits:
 * \(2*n + 2 <= 64 => n <= 31\).
 */
const MDMS_AUDIT_ID_MAX = 31;

/** Persister maps auditDetails.createdBy/lastModifiedBy into DB; if omitted, service may use full JWT sub (>64). */
function mdmsClientId(jwt) {
  const sub = decodeJwt(jwt).sub;
  if (!sub) throw new Error("JWT missing sub");
  return sub.length > MDMS_AUDIT_ID_MAX ? sub.slice(0, MDMS_AUDIT_ID_MAX) : sub;
}

function mdmsHeaders(jwt) {
  const tenant = tenantFromJwt(jwt);
  if (tenant.length > MDMS_VARCHAR) {
    throw new Error(
      `Realm is ${tenant.length} characters; MDMS stores tenantid as VARCHAR(${MDMS_VARCHAR}). Use a shorter realm in Keycloak.`
    );
  }
  const cid = mdmsClientId(jwt);
  return {
    Authorization: `Bearer ${jwt}`,
    "X-Tenant-ID": tenant,
    "X-Client-ID": cid,
    "X-Client-Id": cid,
  };
}

/** Workflow service: tenant_id and audit columns are VARCHAR(64) (digit3 workflow Flyway). */
const WORKFLOW_VARCHAR = 64;

/**
 * Headers for workflow definition CRUD (process / state / action).
 * Do not send Authorization: some gateways or images derive audit `created_by` from JWT `sub` and bypass X-Client-Id.
 * Tenant and short client id still come from the JWT payload here.
 */
function workflowHeaders(jwt) {
  const tenant = tenantFromJwt(jwt);
  if (tenant.length > WORKFLOW_VARCHAR) {
    throw new Error(
      `Realm is ${tenant.length} characters; workflow stores tenant_id as VARCHAR(${WORKFLOW_VARCHAR}). Use a shorter realm in Keycloak.`
    );
  }
  const cid = mdmsClientId(jwt);
  return {
    "X-Tenant-ID": tenant,
    "X-Client-ID": cid,
    "X-Client-Id": cid,
  };
}

/**
 * egovio/notification (Java) often maps audit createdby/lastmodifiedby from JWT sub and ignores X-Client-ID,
 * overflowing VARCHAR(64). Omit Bearer so the service uses X-Client-ID (truncated) — same pattern as workflow deploy.
 */
function notificationTemplateHeaders(jwt) {
  const tenant = tenantFromJwt(jwt);
  const cid = mdmsClientId(jwt);
  return {
    "X-Tenant-ID": tenant,
    "X-Client-ID": cid,
    "X-Client-Id": cid,
  };
}

/**
 * Node on macOS often resolves `localhost` to ::1 first; Docker Desktop binds host ports on 127.0.0.1.
 * Rewriting avoids spurious ECONNREFUSED from undici fetch.
 */
function fetchUpstream(url, init) {
  const u = String(url)
    .replace(/^http:\/\/localhost(?=:|\/|$)/i, "http://127.0.0.1")
    .replace(/^https:\/\/localhost(?=:|\/|$)/i, "https://127.0.0.1");
  return fetch(u, init);
}

async function doFetch(url, init = {}) {
  const r = await fetchUpstream(url, init);
  const text = await r.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: r.ok, status: r.status, body: json, raw: text };
}

/** Classify Node undici/fetch failures so we return 502 + hint instead of a bare 500. */
function upstreamFetchErrorPayload(err, label, url) {
  const code = err?.cause?.code || err?.code;
  const message = String(err?.message || err);
  const refused = code === "ECONNREFUSED" || message.includes("ECONNREFUSED");
  const failed = message.includes("fetch failed");
  const network = refused || failed || code === "ENOTFOUND" || code === "ETIMEDOUT" || code === "EAI_AGAIN";
  return {
    status: network ? 502 : 500,
    json: {
      error: message,
      ...(network && {
        hint: `Cannot reach ${label}: ${url || "(unknown URL)"}. If the UI is on :5177, run \`npm run dev\` (starts API on 3847) or \`node server/index.mjs\`. In digit3/deploy/local run \`docker compose up -d\` for the full stack. Boundary needs \`boundary-service\` on host port 8093 (plus postgres, redis, boundary-migration). Phase A tenant needs keycloak + account. Node rewrites localhost → 127.0.0.1 for upstream fetch.`,
      }),
    },
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

function demoHeaders({ jwt, tenantId, clientId }) {
  const t = String(tenantId || "").trim();
  const c = String(clientId || "").trim();
  const j = String(jwt || "").trim();
  if (!j) throw new Error("jwt required");
  if (!t) throw new Error("tenantId required");
  if (!c) throw new Error("clientId required");
  return {
    Authorization: `Bearer ${j}`,
    "X-Tenant-ID": t,
    "X-Client-ID": c,
    "X-Client-Id": c,
  };
}

app.post("/api/gov/rulesets", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { governanceServiceBaseUrl, jwt, tenantId, clientId, yamlText, status, humanVersion, issuerAuthorityId, policyDocuments } = req.body || {};
    upstreamUrl = `${String(governanceServiceBaseUrl).replace(/\/$/, "")}/governance/v1/rulesets`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const body = {
      yamlText,
      status: status || "ACTIVE",
      humanVersion: humanVersion || undefined,
      issuerAuthorityId,
      policyDocuments: policyDocuments || [],
    };
    const r = await fetchUpstream(upstreamUrl, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Governance service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/coord/entity/resolve", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { coordinationServiceBaseUrl, jwt, tenantId, clientId, body } = req.body || {};
    upstreamUrl = `${String(coordinationServiceBaseUrl).replace(/\/$/, "")}/coordination/entity/resolve`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const r = await fetchUpstream(upstreamUrl, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Coordination service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/coord/link", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { coordinationServiceBaseUrl, jwt, tenantId, clientId, body } = req.body || {};
    upstreamUrl = `${String(coordinationServiceBaseUrl).replace(/\/$/, "")}/coordination/link`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const r = await fetchUpstream(upstreamUrl, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Coordination service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/coord/cases/governance-decide", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { coordinationServiceBaseUrl, jwt, tenantId, clientId, caseId, body } = req.body || {};
    if (!caseId) return res.status(400).json({ error: "caseId required" });
    upstreamUrl = `${String(coordinationServiceBaseUrl).replace(/\/$/, "")}/coordination/v1/cases/${encodeURIComponent(String(caseId))}/governance:decide`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const r = await fetchUpstream(upstreamUrl, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Coordination service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/gov/appeals", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { governanceServiceBaseUrl, jwt, tenantId, clientId, body } = req.body || {};
    upstreamUrl = `${String(governanceServiceBaseUrl).replace(/\/$/, "")}/governance/v1/appeals`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const r = await fetchUpstream(upstreamUrl, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Governance service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/gov/orders", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { governanceServiceBaseUrl, jwt, tenantId, clientId, body } = req.body || {};
    upstreamUrl = `${String(governanceServiceBaseUrl).replace(/\/$/, "")}/governance/v1/orders`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const r = await fetchUpstream(upstreamUrl, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Governance service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/gov/decisions-recompute", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { governanceServiceBaseUrl, jwt, tenantId, clientId, body } = req.body || {};
    upstreamUrl = `${String(governanceServiceBaseUrl).replace(/\/$/, "")}/governance/v1/decisions:recompute`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const r = await fetchUpstream(upstreamUrl, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Governance service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/coord/cases/timeline", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { coordinationServiceBaseUrl, jwt, tenantId, clientId, caseId } = req.body || {};
    if (!caseId) return res.status(400).json({ error: "caseId required" });
    upstreamUrl = `${String(coordinationServiceBaseUrl).replace(/\/$/, "")}/coordination/entity/Case/${encodeURIComponent(String(caseId))}/timeline`;
    const h = demoHeaders({ jwt, tenantId, clientId });
    const r = await fetchUpstream(upstreamUrl, { method: "GET", headers: { ...h } });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Coordination service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/auth/token", async (req, res) => {
  try {
    const b = req.body || {};
    const keycloakOrigin = typeof b.keycloakOrigin === "string" ? b.keycloakOrigin.trim() : "";
    const realm = typeof b.realm === "string" ? b.realm.trim() : "";
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    const clientSecret = typeof b.clientSecret === "string" ? b.clientSecret.trim() : "";
    const username = typeof b.username === "string" ? b.username.trim() : "";
    const passwordRaw = typeof b.password === "string" ? b.password : "";
    const missing = [];
    if (!keycloakOrigin) missing.push("Keycloak origin");
    if (!realm) missing.push("Realm (tenant code from Phase A — e.g. DEMOMUNICIPALITY1)");
    if (!clientId) missing.push("OAuth client id");
    if (!clientSecret) missing.push("OAuth client secret");
    if (!username) missing.push("OAuth username");
    if (!passwordRaw.trim()) missing.push("OAuth password");
    if (missing.length) {
      return res.status(400).json({
        error: "Fill these in Connection (left) or below, then try again.",
        missing,
      });
    }
    const tokenUrl = `${keycloakOrigin.replace(/\/$/, "")}/keycloak/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password: passwordRaw.trim(),
    });
    const r = await fetchUpstream(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).type("application/json").send(text);
    const data = JSON.parse(text);
    return res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/account/tenant", async (req, res) => {
  const { accountBaseUrl, xClientId, name, email, code } = req.body || {};
  let upstreamUrl = "";
  try {
    if (!accountBaseUrl || !xClientId || !name || !email) {
      return res.status(400).json({ error: "accountBaseUrl, xClientId, name, email required" });
    }
    const tenant = { name, email, isActive: true, additionalAttributes: {} };
    if (code) tenant.code = code;
    upstreamUrl = `${String(accountBaseUrl).replace(/\/$/, "")}/account/v1`;
    try {
      const u = new URL(upstreamUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return res.status(400).json({ error: "accountBaseUrl must start with http:// or https://" });
      }
    } catch {
      return res.status(400).json({
        error: "Invalid accountBaseUrl",
        hint: "Use an absolute URL, e.g. http://127.0.0.1:8094 (see Connection → Account base URL).",
      });
    }
    const r = await fetchUpstream(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Id": xClientId },
      body: JSON.stringify({ tenant }),
    });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Account service", upstreamUrl);
    return res.status(status).json(json);
  }
});

/** GET /account/v1?code= — reconnect demo UI to an existing tenant (no JWT). */
app.post("/api/account/tenant/lookup", async (req, res) => {
  const { accountBaseUrl, xClientId, code } = req.body || {};
  let upstreamUrl = "";
  try {
    if (!accountBaseUrl || !xClientId || !code || !String(code).trim()) {
      return res.status(400).json({ error: "accountBaseUrl, xClientId, code required" });
    }
    const q = encodeURIComponent(String(code).trim());
    upstreamUrl = `${String(accountBaseUrl).replace(/\/$/, "")}/account/v1?code=${q}`;
    const r = await fetchUpstream(upstreamUrl, { headers: { "X-Client-Id": xClientId } });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    const { status, json } = upstreamFetchErrorPayload(e, "Account service", upstreamUrl);
    return res.status(status).json(json);
  }
});

/** GET /boundary/v1?codes=…&codes=… — requires JWT + tenant (codes required by boundary service). */
app.post("/api/boundary/search", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { boundaryBaseUrl, jwt, codes } = req.body || {};
    if (!boundaryBaseUrl || !jwt) {
      return res.status(400).json({ error: "boundaryBaseUrl, jwt required" });
    }
    const list = Array.isArray(codes)
      ? codes.map((c) => String(c).trim()).filter(Boolean)
      : String(codes || "")
          .split(/[,;\s]+/)
          .map((c) => c.trim())
          .filter(Boolean);
    if (!list.length) {
      return res.status(400).json({ error: "codes required (comma-separated string or array)" });
    }
    const h = boundaryHeaders(jwt);
    const q = new URLSearchParams();
    for (const c of list) q.append("codes", c);
    upstreamUrl = `${String(boundaryBaseUrl).replace(/\/$/, "")}/boundary/v1?${q}`;
    const r = await fetchUpstream(upstreamUrl, { headers: { ...h } });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    const msg = String(e.message || e);
    const isVal =
      msg.includes("Realm is") ||
      msg.includes("boundary service") ||
      msg.includes("JWT missing") ||
      msg.includes("Invalid JWT");
    if (isVal) return res.status(400).json({ error: msg });
    const { status, json } = upstreamFetchErrorPayload(e, "Boundary service", upstreamUrl);
    return res.status(status).json(json);
  }
});

app.post("/api/boundary/create", async (req, res) => {
  let upstreamUrl = "";
  try {
    const { boundaryBaseUrl, jwt, yaml: yamlText } = req.body || {};
    if (!boundaryBaseUrl || !jwt || !yamlText) {
      return res.status(400).json({ error: "boundaryBaseUrl, jwt, yaml required" });
    }
    const doc = yaml.load(yamlText);
    if (!doc || !doc.boundary) return res.status(400).json({ error: "YAML must contain top-level 'boundary' array" });
    for (let i = 0; i < doc.boundary.length; i++) {
      const b = doc.boundary[i];
      const code = b && typeof b.code === "string" ? b.code : "";
      if (!code.trim()) {
        return res.status(400).json({ error: `boundary[${i}]: code is required` });
      }
      if (code.length > BOUNDARY_VARCHAR) {
        return res.status(400).json({
          error: `boundary[${i}]: code is ${code.length} characters; max ${BOUNDARY_VARCHAR} (boundary DB column). Shorten the code.`,
          code: code.slice(0, 80) + (code.length > 80 ? "…" : ""),
        });
      }
    }
    upstreamUrl = `${String(boundaryBaseUrl).replace(/\/$/, "")}/boundary/v1`;
    const h = boundaryHeaders(jwt);
    const r = await fetchUpstream(upstreamUrl, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ boundary: doc.boundary }),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    const msg = String(e.message || e);
    const isVal =
      msg.includes("Realm is") ||
      msg.includes("boundary service") ||
      msg.includes("JWT missing") ||
      msg.includes("Invalid JWT");
    if (isVal) return res.status(400).json({ error: msg });
    const { status, json } = upstreamFetchErrorPayload(e, "Boundary service", upstreamUrl);
    return res.status(status).json(json);
  }
});

/** GET /registry/v1/schema/{schemaCode} */
app.post("/api/registry/schema/get", async (req, res) => {
  try {
    const { registryBaseUrl, jwt, schemaCode, version } = req.body || {};
    if (!registryBaseUrl || !jwt || !schemaCode) {
      return res.status(400).json({ error: "registryBaseUrl, jwt, schemaCode required" });
    }
    const h = clientHeaders(jwt);
    const enc = encodeURIComponent(String(schemaCode).trim());
    let url = `${registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema/${enc}`;
    if (version) url += `?version=${encodeURIComponent(String(version))}`;
    const r = await fetchUpstream(url, { headers: { ...h } });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/registry/schema", async (req, res) => {
  try {
    const { registryBaseUrl, jwt, yaml: yamlText } = req.body || {};
    if (!registryBaseUrl || !jwt || !yamlText) {
      return res.status(400).json({ error: "registryBaseUrl, jwt, yaml required" });
    }
    const doc = yaml.load(yamlText);
    if (!doc?.schemaCode || !doc?.definition) {
      return res.status(400).json({ error: "YAML must have schemaCode and definition" });
    }
    const url = `${registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema`;
    const h = clientHeaders(jwt);
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ schemaCode: doc.schemaCode, definition: doc.definition }),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/** Default IdGen pattern aligned with `digit create-idgen-template --default` and registry `IDGEN_ORG_VALUE=REGISTRY`. */
function defaultIdgenConfig() {
  return {
    template: "{ORG}-{DATE:yyyyMMdd}-{SEQ}-{RAND}",
    sequence: { scope: "daily", start: 1, padding: { length: 4, char: "0" } },
    random: { length: 2, charset: "A-Z0-9" },
  };
}

function normalizeIdgenConfig(raw) {
  const d = defaultIdgenConfig();
  if (!raw || typeof raw !== "object") return d;
  const startNum = Number(raw.sequence?.start);
  const padLen = Number(raw.sequence?.padding?.length);
  const randLen = Number(raw.random?.length);
  return {
    template: typeof raw.template === "string" && raw.template.trim() ? raw.template.trim() : d.template,
    sequence: {
      scope: typeof raw.sequence?.scope === "string" && raw.sequence.scope.trim() ? raw.sequence.scope.trim() : d.sequence.scope,
      start: Number.isFinite(startNum) ? startNum : d.sequence.start,
      padding: {
        length: Number.isFinite(padLen) ? padLen : d.sequence.padding.length,
        char:
          typeof raw.sequence?.padding?.char === "string" && raw.sequence.padding.char !== ""
            ? raw.sequence.padding.char
            : d.sequence.padding.char,
      },
    },
    random: {
      length: Number.isFinite(randLen) ? randLen : d.random.length,
      charset:
        typeof raw.random?.charset === "string" && raw.random.charset !== "" ? raw.random.charset : d.random.charset,
    },
  };
}

app.post("/api/idgen/template/search", async (req, res) => {
  try {
    const { idgenBaseUrl, jwt, templateCode } = req.body || {};
    if (!idgenBaseUrl || !jwt || !templateCode) {
      return res.status(400).json({ error: "idgenBaseUrl, jwt, templateCode required" });
    }
    const h = clientHeaders(jwt);
    const q = new URLSearchParams({ templateCode: String(templateCode).trim() });
    const url = `${idgenBaseUrl.replace(/\/$/, "")}/idgen/v1/template?${q}`;
    const r = await fetchUpstream(url, { method: "GET", headers: { ...h } });
    const text = await r.text();
    return res.status(r.status).type("application/json").send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/idgen/template", async (req, res) => {
  try {
    const { idgenBaseUrl, jwt, templateCode, config: cfgIn } = req.body || {};
    if (!idgenBaseUrl || !jwt || !templateCode) {
      return res.status(400).json({ error: "idgenBaseUrl, jwt, templateCode required" });
    }
    const h = clientHeaders(jwt);
    const config = normalizeIdgenConfig(cfgIn);
    const body = { templateCode: String(templateCode).trim(), config };
    const url = `${idgenBaseUrl.replace(/\/$/, "")}/idgen/v1/template`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/idgen/template", async (req, res) => {
  try {
    const { idgenBaseUrl, jwt, templateCode, config: cfgIn } = req.body || {};
    if (!idgenBaseUrl || !jwt || !templateCode) {
      return res.status(400).json({ error: "idgenBaseUrl, jwt, templateCode required" });
    }
    const h = clientHeaders(jwt);
    const config = normalizeIdgenConfig(cfgIn);
    const body = { templateCode: String(templateCode).trim(), config };
    const url = `${idgenBaseUrl.replace(/\/$/, "")}/idgen/v1/template`;
    const r = await fetchUpstream(url, {
      method: "PUT",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/idgen/generate", async (req, res) => {
  try {
    const { idgenBaseUrl, jwt, templateCode, variables } = req.body || {};
    if (!idgenBaseUrl || !jwt || !templateCode) {
      return res.status(400).json({ error: "idgenBaseUrl, jwt, templateCode required" });
    }
    const h = clientHeaders(jwt);
    const vars =
      variables && typeof variables === "object" && !Array.isArray(variables)
        ? variables
        : { ORG: "REGISTRY" };
    const body = { templateCode: String(templateCode).trim(), variables: vars };
    const url = `${idgenBaseUrl.replace(/\/$/, "")}/idgen/v1/generate`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/mdms/schema", async (req, res) => {
  try {
    const { mdmsBaseUrl, jwt, yaml: yamlText } = req.body || {};
    if (!mdmsBaseUrl || !jwt || !yamlText) {
      return res.status(400).json({ error: "mdmsBaseUrl, jwt, yaml required" });
    }
    const doc = yaml.load(yamlText);
    const sch = doc?.schema;
    if (!sch?.code || !sch?.description || sch.definition === undefined) {
      return res.status(400).json({ error: "YAML must have schema.code, schema.description, schema.definition" });
    }
    /** MDMS expects `definition` as a JSON object, not an escaped string (Java JSONObject parse). */
    let definitionObj;
    if (typeof sch.definition === "string") {
      const t = sch.definition.trim();
      if (!t) return res.status(400).json({ error: "schema.definition is empty" });
      try {
        definitionObj = JSON.parse(t);
      } catch {
        return res.status(400).json({
          error: "schema.definition must be a JSON object (YAML mapping) or a JSON object as a string",
        });
      }
    } else if (sch.definition !== null && typeof sch.definition === "object") {
      definitionObj = sch.definition;
    } else {
      return res.status(400).json({ error: "schema.definition must be an object or JSON string" });
    }
    if (definitionObj === null || typeof definitionObj !== "object" || Array.isArray(definitionObj)) {
      return res.status(400).json({ error: "schema.definition must be a single JSON object (not an array)" });
    }
    const reqList = definitionObj.required;
    if (!Array.isArray(reqList) || reqList.length === 0) {
      return res.status(400).json({
        error:
          "MDMS requires a non-empty definition.required array (JSON Schema). Add at least one property name, e.g. required: [code, label].",
      });
    }
    const xUnique = definitionObj["x-unique"];
    if (!Array.isArray(xUnique) || xUnique.length === 0) {
      return res.status(400).json({
        error:
          "MDMS requires a non-empty definition['x-unique'] array (which fields form unique keys per tenant), e.g. x-unique: [code].",
      });
    }
    const codeStr = String(sch.code).trim();
    if (codeStr.length > MDMS_VARCHAR) {
      return res.status(400).json({
        error: `schema.code length ${codeStr.length} exceeds MDMS VARCHAR(${MDMS_VARCHAR}); shorten the code.`,
      });
    }
    const tenant = tenantFromJwt(jwt);
    const cid = mdmsClientId(jwt);
    const h = mdmsHeaders(jwt);
    const url = `${mdmsBaseUrl.replace(/\/$/, "")}/mdms-v2/v1/schema`;
    const now = Date.now();
    const payload = {
      SchemaDefinition: {
        id: randomUUID(),
        tenantId: tenant,
        code: codeStr,
        description: sch.description,
        definition: definitionObj,
        isActive: sch.isActive !== false,
        auditDetails: {
          createdBy: cid,
          lastModifiedBy: cid,
          createdTime: now,
          lastModifiedTime: now,
        },
      },
    };
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/** GET /mdms-v2/v1/schema?code= */
app.post("/api/mdms/schema/get", async (req, res) => {
  try {
    const { mdmsBaseUrl, jwt, schemaCode } = req.body || {};
    if (!mdmsBaseUrl || !jwt || !schemaCode) {
      return res.status(400).json({ error: "mdmsBaseUrl, jwt, schemaCode required" });
    }
    const h = mdmsHeaders(jwt);
    const q = encodeURIComponent(String(schemaCode).trim());
    const url = `${mdmsBaseUrl.replace(/\/$/, "")}/mdms-v2/v1/schema?code=${q}`;
    const r = await fetchUpstream(url, { headers: { ...h } });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    const msg = String(e.message || e);
    const isVal = msg.includes("Realm is");
    return res.status(isVal ? 400 : 500).json({ error: msg });
  }
});

app.post("/api/mdms/data", async (req, res) => {
  try {
    const { mdmsBaseUrl, jwt, yaml: yamlText } = req.body || {};
    if (!mdmsBaseUrl || !jwt || !yamlText) {
      return res.status(400).json({ error: "mdmsBaseUrl, jwt, yaml required" });
    }
    const doc = yaml.load(yamlText);
    if (!doc?.mdms?.length) return res.status(400).json({ error: "YAML must contain mdms: array" });
    const tenant = tenantFromJwt(jwt);
    const cid = mdmsClientId(jwt);
    const now = Date.now();
    const rows = doc.mdms.map((row) => {
      if (!row || typeof row !== "object") return row;
      const o = { ...row };
      if (!o.tenantId) o.tenantId = tenant;
      o.auditDetails = {
        createdBy: cid,
        lastModifiedBy: cid,
        createdTime: now,
        lastModifiedTime: now,
      };
      return o;
    });
    const h = mdmsHeaders(jwt);
    const url = `${mdmsBaseUrl.replace(/\/$/, "")}/mdms-v2/v2`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ Mdms: rows }),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/workflow/deploy", async (req, res) => {
  try {
    const { workflowBaseUrl, jwt, yaml: yamlText } = req.body || {};
    if (!workflowBaseUrl || !jwt || !yamlText) {
      return res.status(400).json({ error: "workflowBaseUrl, jwt, yaml required" });
    }
    const doc = yaml.load(yamlText);
    const w = doc?.workflow;
    if (!w?.process || !w?.states?.length || !w?.actions?.length) {
      return res.status(400).json({ error: "YAML must have workflow.process, workflow.states, workflow.actions" });
    }
    const p = w.process;
    const base = workflowBaseUrl.replace(/\/$/, "");
    const h = { ...workflowHeaders(jwt), "Content-Type": "application/json" };

    const processBody = JSON.stringify({
      name: p.name,
      code: p.code,
      description: p.description || "",
      version: p.version || "1.0",
      sla: p.sla ?? 86400,
    });
    let r = await fetchUpstream(`${base}/workflow/v1/process`, { method: "POST", headers: h, body: processBody });
    let text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);
    const processJson = JSON.parse(text);
    const processID = processJson.id;
    if (!processID) return res.status(500).send(text);

    const stateCodeToId = {};
    for (const st of w.states) {
      const sb = JSON.stringify({
        code: st.code,
        name: st.name,
        isInitial: !!st.isInitial,
        isParallel: !!st.isParallel,
        isJoin: !!st.isJoin,
        sla: st.sla ?? 0,
      });
      r = await fetchUpstream(`${base}/workflow/v1/process/${processID}/state`, { method: "POST", headers: h, body: sb });
      text = await r.text();
      if (!r.ok) return res.status(r.status).send(`state ${st.code}: ${text}`);
      const sj = JSON.parse(text);
      stateCodeToId[st.code] = sj.id;
    }

    for (const act of w.actions) {
      const cur = stateCodeToId[act.currentState];
      const nxt = stateCodeToId[act.nextState];
      if (!cur || !nxt) {
        return res.status(400).json({ error: `Unknown state in action ${act.name}: ${act.currentState} -> ${act.nextState}` });
      }
      const roles = act.attributeValidation?.attributes?.roles || [];
      const assigneeCheck = !!act.attributeValidation?.assigneeCheck;
      const ab = JSON.stringify({
        name: act.name,
        nextState: nxt,
        attributeValidation: {
          attributes: { roles },
          assigneeCheck,
        },
      });
      r = await fetchUpstream(`${base}/workflow/v1/state/${cur}/action`, { method: "POST", headers: h, body: ab });
      text = await r.text();
      if (!r.ok) return res.status(r.status).send(`action ${act.name}: ${text}`);
    }

    return res.json({ ok: true, processId: processID, states: Object.keys(stateCodeToId).length, actions: w.actions.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/filestore/category", async (req, res) => {
  try {
    const {
      filestoreBaseUrl,
      jwt,
      type: categoryType,
      code,
      allowedFormats,
      minSize,
      maxSize,
      isSensitive,
      isActive,
      description,
    } = req.body || {};
    if (!filestoreBaseUrl || !jwt || !categoryType || !code || !allowedFormats) {
      return res.status(400).json({ error: "filestoreBaseUrl, jwt, type, code, allowedFormats required" });
    }
    const formats = String(allowedFormats)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const h = clientHeaders(jwt);
    const url = `${filestoreBaseUrl.replace(/\/$/, "")}/filestore/v1/files/document-categories`;
    const body = {
      type: categoryType,
      code,
      allowedFormats: formats,
      minSize: String(minSize ?? 1024),
      maxSize: String(maxSize ?? 1024000),
      isSensitive: !!isSensitive,
      isActive: isActive !== false,
      description: description || "",
    };
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/notification/template", async (req, res) => {
  try {
    const { notificationBaseUrl, jwt, templateId, version, type, subject, content, isHTML } = req.body || {};
    if (!notificationBaseUrl || !jwt || !templateId || !version || !type || !subject || !content) {
      return res.status(400).json({ error: "notificationBaseUrl, jwt, templateId, version, type, subject, content required" });
    }
    const h = notificationTemplateHeaders(jwt);
    const url = `${notificationBaseUrl.replace(/\/$/, "")}/notification/v1/template`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        version,
        type,
        subject,
        content,
        isHTML: !!isHTML,
      }),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/keycloak/role", async (req, res) => {
  try {
    const { keycloakOrigin, realm, jwt, roleName, description } = req.body || {};
    if (!keycloakOrigin || !realm || !jwt || !roleName) {
      return res.status(400).json({ error: "keycloakOrigin, realm, jwt, roleName required" });
    }
    const base = keycloakOrigin.replace(/\/$/, "");
    const url = `${base}/keycloak/admin/realms/${encodeURIComponent(realm)}/roles`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: roleName, description: description || roleName }),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/keycloak/user", async (req, res) => {
  try {
    const { keycloakOrigin, realm, jwt, username, password, email } = req.body || {};
    if (!keycloakOrigin || !realm || !jwt || !username || !password || !email) {
      return res.status(400).json({ error: "keycloakOrigin, realm, jwt, username, password, email required" });
    }
    const base = keycloakOrigin.replace(/\/$/, "");
    const url = `${base}/keycloak/admin/realms/${encodeURIComponent(realm)}/users`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: "password", value: password, temporary: false }],
        attributes: {},
      }),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/keycloak/assign-role", async (req, res) => {
  try {
    const { keycloakOrigin, realm, jwt, username, roleName } = req.body || {};
    if (!keycloakOrigin || !realm || !jwt || !username || !roleName) {
      return res.status(400).json({ error: "keycloakOrigin, realm, jwt, username, roleName required" });
    }
    const base = keycloakOrigin.replace(/\/$/, "");
    const auth = { Authorization: `Bearer ${jwt}` };
    let r = await fetchUpstream(`${base}/keycloak/admin/realms/${encodeURIComponent(realm)}/users?username=${encodeURIComponent(username)}`, {
      headers: auth,
    });
    let users = await r.json();
    if (!r.ok || !Array.isArray(users) || !users[0]?.id) {
      return res.status(400).json({ error: "User not found", detail: users });
    }
    const uid = users[0].id;
    r = await fetchUpstream(`${base}/keycloak/admin/realms/${encodeURIComponent(realm)}/roles/${encodeURIComponent(roleName)}`, { headers: auth });
    const role = await r.json();
    if (!r.ok || !role.id) {
      return res.status(r.status).json({ error: "Role not found", detail: role });
    }
    r = await fetchUpstream(`${base}/keycloak/admin/realms/${encodeURIComponent(realm)}/users/${uid}/role-mappings/realm`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify([{ id: role.id, name: role.name }]),
    });
    const text = await r.text();
    return res.status(r.status).send(text || JSON.stringify({ ok: true }));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/workflow/transition", async (req, res) => {
  try {
    const { workflowBaseUrl, jwt, body: transitionBody } = req.body || {};
    if (!workflowBaseUrl || !jwt || !transitionBody) {
      return res.status(400).json({ error: "workflowBaseUrl, jwt, body (object) required" });
    }
    const h = workflowHeaders(jwt);
    const url = `${workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/transition`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify(transitionBody),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * GET /workflow/v1/transition?entityId=&processId=&history=true|false
 * Returns processInstances (per transition); history=true returns full chain for the entity+process.
 */
app.post("/api/workflow/transition/history", async (req, res) => {
  try {
    const { workflowBaseUrl, jwt, entityId, processId, history } = req.body || {};
    if (!workflowBaseUrl || !jwt || !entityId || !processId) {
      return res.status(400).json({ error: "workflowBaseUrl, jwt, entityId, processId required" });
    }
    const h = workflowHeaders(jwt);
    const q = new URLSearchParams();
    q.set("entityId", String(entityId).trim());
    q.set("processId", String(processId).trim());
    const hist = history === true || history === "true";
    if (hist) q.set("history", "true");
    const url = `${workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/transition?${q}`;
    const r = await fetchUpstream(url, { method: "GET", headers: { ...h } });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/registry/data", async (req, res) => {
  try {
    const { registryBaseUrl, jwt, schemaCode, data } = req.body || {};
    if (!registryBaseUrl || !jwt || !schemaCode || !data) {
      return res.status(400).json({ error: "registryBaseUrl, jwt, schemaCode, data required" });
    }
    const h = clientHeaders(jwt);
    const enc = encodeURIComponent(schemaCode);
    const url = `${registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema/${enc}/data`;
    const r = await fetchUpstream(url, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/workflow/process-by-code", async (req, res) => {
  try {
    const { workflowBaseUrl, jwt, code } = req.body || {};
    if (!workflowBaseUrl || !jwt || !code) {
      return res.status(400).json({ error: "workflowBaseUrl, jwt, code required" });
    }
    const h = workflowHeaders(jwt);
    const url = `${workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/process?code=${encodeURIComponent(code)}`;
    const r = await fetchUpstream(url, { headers: authHeadersForGet(h) });
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

function authHeadersForGet(h) {
  const out = {
    "X-Tenant-ID": h["X-Tenant-ID"],
    "X-Client-Id": h["X-Client-Id"] || h["X-Client-ID"],
    "X-Client-ID": h["X-Client-ID"] || h["X-Client-Id"],
  };
  if (h.Authorization) out.Authorization = h.Authorization;
  return out;
}

app.post("/api/check/health", async (req, res) => {
  try {
    const { filestoreBaseUrl, workflowBaseUrl, boundaryBaseUrl, idgenBaseUrl, registryBaseUrl, jwt } = req.body || {};
    const out = { checks: [] };
    if (filestoreBaseUrl) {
      const u = `${filestoreBaseUrl.replace(/\/$/, "")}/filestore/health`;
      const r = await fetchUpstream(u);
      out.checks.push({ name: "filestore", url: u, status: r.status, ok: r.ok });
    }
    if (workflowBaseUrl) {
      const u = `${workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/process`;
      // Unauthenticated GET: service returns 400 "X-Tenant-ID required" when up. Listing with tenant hits DB and can 500 if DB/schema misconfigured.
      const r = await fetchUpstream(u);
      out.checks.push({
        name: "workflow",
        url: u,
        status: r.status,
        ok: r.ok || r.status === 400,
      });
    }
    if (boundaryBaseUrl && jwt) {
      const h = authHeadersForGet(boundaryHeaders(jwt));
      const u = `${boundaryBaseUrl.replace(/\/$/, "")}/boundary/v1`;
      const r = await fetchUpstream(u, { headers: h });
      out.checks.push({ name: "boundary", status: r.status, ok: r.ok || r.status === 400 });
    }
    if (idgenBaseUrl) {
      const u = `${idgenBaseUrl.replace(/\/$/, "")}/idgen/health`;
      try {
        const r = await fetchUpstream(u);
        out.checks.push({
          name: "idgen",
          url: u,
          status: r.status,
          ok: r.ok,
          note: r.status === 404 ? "Rebuild digit-local/idgen:local (needs GET /idgen/health)" : undefined,
        });
      } catch (e) {
        out.checks.push({ name: "idgen", url: u, status: 0, ok: false, error: String(e.message || e) });
      }
    }
    if (registryBaseUrl) {
      const base = registryBaseUrl.replace(/\/$/, "");
      const u = `${base}/`;
      try {
        const r = await fetchUpstream(u);
        const up = r.status > 0 && r.status < 500;
        out.checks.push({
          name: "registry",
          url: u,
          status: r.status,
          ok: up,
          note: up ? undefined : "Registry returned 5xx — check docker logs for registry",
        });
      } catch (e) {
        out.checks.push({ name: "registry", url: u, status: 0, ok: false, error: String(e.message || e) });
      }
    }
    if (registryBaseUrl && jwt) {
      const h = clientHeaders(jwt);
      const u = `${registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema/core.facility`;
      try {
        const r = await fetchUpstream(u, { headers: { ...h } });
        out.checks.push({
          name: "registry_schema_core.facility",
          status: r.status,
          ok: r.ok || r.status === 404,
          note: r.status === 404 ? "Schema not created yet (expected before Phase D) — service is reachable" : undefined,
        });
      } catch (e) {
        out.checks.push({
          name: "registry_schema_core.facility",
          status: 0,
          ok: false,
          error: String(e.message || e),
        });
      }
    }
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

const dist = path.join(__dirname, "..", "dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Provision console API http://127.0.0.1:${PORT}`);
});
