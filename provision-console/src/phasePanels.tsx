import { useState, type Dispatch, type SetStateAction } from "react";
import type { ServiceSettings } from "./configDefaults";
import { LOCAL_DEMO_OAUTH } from "./configDefaults";
import { apiPost } from "./api";
import { FullscreenYamlJsonField } from "./FullscreenYamlJsonField";
import { ApiHelpButton } from "./ApiHelpButton";
import {
  EXAMPLE_BOUNDARIES,
  EXAMPLE_CASE_REGISTRY,
  EXAMPLE_CORE_REGISTRY,
  EXAMPLE_MDMS_DATA,
  EXAMPLE_MDMS_SCHEMA,
  EXAMPLE_WORKFLOW,
} from "./exampleYamls";

/** Matches registry `IDGEN_ORG_VALUE` + `digit create-idgen-template --default`. */
const REGISTRY_IDGEN_DEFAULT = {
  idPattern: "{ORG}-{DATE:yyyyMMdd}-{SEQ}-{RAND}",
  scope: "daily",
  start: "1",
  padLen: "4",
  padChar: "0",
  randLen: "2",
  randCharset: "A-Z0-9",
  sampleOrg: "REGISTRY",
} as const;

function Result({ text, ok }: { text: string; ok: boolean }) {
  if (!text) return null;
  return <pre className={`result ${ok ? "ok" : "err"}`}>{text}</pre>;
}

function formatTokenError(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: string; missing?: string[] };
    if (j.missing?.length) {
      return `${j.error || "Missing fields"}\n\n• ${j.missing.join("\n• ")}`;
    }
    return text;
  } catch {
    return text;
  }
}

function pickTenantEmail(t: Record<string, unknown>): string {
  const a = t.emailId;
  const b = t.email;
  if (typeof a === "string" && a.trim()) return a.trim();
  if (typeof b === "string" && b.trim()) return b.trim();
  return "";
}

export function OverviewPanel() {
  return (
    <div className="phase-panel overview-panel">
      <h2>Overview — DIGIT and this demo</h2>
      <p className="lead">
        <strong>DIGIT</strong> is a modular platform for digital public services: separate APIs for tenancy, identity, location context, structured case data, reference data, process orchestration, identifiers, files, and notifications. This console walks an operator through wiring those pieces in order—like standing up a{" "}
        <strong>complaints-style</strong> flow—from an empty realm to staff and test users moving a case through workflow states with the right roles and data.
      </p>

      <h3 style={{ fontSize: "1rem", margin: "1.25rem 0 0.5rem" }}>What each service provides</h3>
      <div className="overview-table-wrap">
        <table className="overview-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Role in public service delivery</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Account</strong>
              </td>
              <td>Registers a <strong>tenant</strong> (organisation / realm). Later calls are scoped to that tenant.</td>
            </tr>
            <tr>
              <td>
                <strong>Keycloak + OAuth / JWT</strong>
              </td>
              <td>
                <strong>Who</strong> is calling—citizens, front office, back office. JWTs identify the user; DIGIT services use tenant and client headers for authorisation and audit.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Boundaries</strong>
              </td>
              <td>
                <strong>Where</strong> things apply—wards, jurisdictions—so applications and reporting share geographic / admin codes.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Registry</strong>
              </td>
              <td>
                <strong>Transactional domain data</strong> with schemas (e.g. a case or service request). The live service record lives here.
              </td>
            </tr>
            <tr>
              <td>
                <strong>IdGen</strong>
              </td>
              <td>
                <strong>Configurable IDs</strong> (patterns, sequences, random parts) for stable, readable references.
              </td>
            </tr>
            <tr>
              <td>
                <strong>MDMS</strong>
              </td>
              <td>
                <strong>Master / reference data</strong> (types, categories) so definitions drive UI, validation, and workflow consistently.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Workflow</strong>
              </td>
              <td>
                <strong>Process engine</strong>: states, actions, roles (e.g. maker–checker). Controls who can do what next on a case.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Filestore</strong>
              </td>
              <td>
                <strong>Document categories</strong> and upload rules (formats, size) for evidence and attachments.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Notifications</strong>
              </td>
              <td>
                <strong>Templates</strong> (e.g. email / SMS) so case state can trigger citizen-facing or internal messages.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Keycloak admin</strong>
              </td>
              <td>
                <strong>Roles and users</strong> for operational access; different logins exercise the same workflow realistically.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: "1rem", margin: "1.25rem 0 0.5rem" }}>How the tabs build a service</h3>
      <ol className="overview-steps">
        <li>Onboard the programme (tenant, realm, tokens).</li>
        <li>Anchor the service in place (boundaries).</li>
        <li>Define the case model (registry schemas and IdGen).</li>
        <li>Load catalogue / policy data (MDMS).</li>
        <li>Deploy the business process (workflow).</li>
        <li>Enable evidence and comms (filestore categories, notification templates).</li>
        <li>
          Run the instance: resolve the process by business code, <strong>POST transitions</strong> with the right JWT, optionally <strong>POST registry data</strong>, and use <strong>transition history</strong> as the audit trail for how the case moved.
        </li>
      </ol>

      <p className="lead" style={{ fontSize: "0.88rem", marginTop: "1rem" }}>
        Tab <strong>R · Resume</strong> helps after a UI or container restart when Postgres still has data. Deeper checklist:{" "}
        <code>digit-client-tools/docs/SETUP-RUNBOOK-COMPLAINTS-WORKFLOW.md</code>. This UI is an <strong>operator</strong> tool: it forwards bearer tokens to your stack—run it on trusted networks (e.g. localhost) only.
      </p>
    </div>
  );
}

function useRun() {
  const [out, setOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const run = async (path: string, body: unknown, method: "POST" | "PUT" = "POST") => {
    setOut({ text: "…", ok: true });
    const r = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    setOut({ text: text || `HTTP ${r.status}`, ok: r.ok });
  };
  const fail = (msg: string) => setOut({ text: msg, ok: false });
  return { out, run, fail };
}

export function Phase0Panel() {
  return (
    <div className="phase-panel">
      <h2>Phase 0 — Prerequisites</h2>
      <p className="lead">Before using other tabs, ensure the DIGIT local stack is running and you understand this UI talks to real services via a local API proxy.</p>
      <ul>
        <li>
          <strong>Dev:</strong> run <code>npm run dev</code> from <code>provision-console</code> (starts the API on <code>:3847</code> and Vite on <code>:5177</code>). Running only <code>vite</code> breaks <code>/api/*</code> calls.
        </li>
        <li>
          Docker Compose: <code>digit3/deploy/local</code> — Phase A needs the <strong>keycloak</strong> service up (Account talks to <code>http://keycloak:8080</code> inside the stack).
        </li>
        <li>
          <strong>Connection</strong> is pre-filled for local demo OAuth (<code>auth-server</code> / <code>changeme</code> / password <code>default</code>). Phase A sets realm; Phase B fetches JWT.
        </li>
        <li>
          <strong>Re-running the demo:</strong> tab <strong>R · Resume</strong> — look up an existing tenant in Phase A, refresh JWT, then fetch boundaries / registry / MDMS / workflow / IdGen without reprovisioning.
        </li>
        <li>
          <strong>Audit trail:</strong> there is no single audit-log service in this workspace; services store <code>auditDetails</code> on rows. For workflows, Phase J can call <code>GET /workflow/v1/transition?entityId=&amp;processId=&amp;history=true</code> to list all transitions (see DIGIT tutorial).
        </li>
        <li>This console is for <strong>operators</strong> on trusted networks — it forwards bearer tokens to your cluster.</li>
      </ul>
    </div>
  );
}

export function PhaseAPanel({
  s,
  setS,
}: {
  s: ServiceSettings;
  setS: Dispatch<SetStateAction<ServiceSettings>>;
}) {
  const [out, setOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const [name, setName] = useState("Demo Municipality");
  const [email, setEmail] = useState("admin@demo.gov");
  const [code, setCode] = useState("");
  const createTenant = async () => {
    setOut({ text: "…", ok: true });
    const r = await apiPost("/api/account/tenant", {
      accountBaseUrl: s.accountBaseUrl,
      xClientId: s.accountClientId,
      name,
      email,
      code: code.trim() || undefined,
    });
    let extra = "";
    if (r.ok) {
      try {
        const j = JSON.parse(r.text) as { tenants?: Array<{ code?: string }> };
        const tenantCode = j.tenants?.[0]?.code;
        if (tenantCode) {
          setS((prev) => ({
            ...prev,
            realm: tenantCode,
            oauthUsername: email.trim() || prev.oauthUsername,
            oauthClientId: prev.oauthClientId || LOCAL_DEMO_OAUTH.clientId,
            oauthSecret: prev.oauthSecret || LOCAL_DEMO_OAUTH.clientSecret,
            oauthPassword: prev.oauthPassword || LOCAL_DEMO_OAUTH.password,
          }));
          extra = `\n\n✓ Connection → Realm "${tenantCode}", OAuth username set to tenant email (demo client ${LOCAL_DEMO_OAUTH.clientId}).`;
        }
      } catch {
        /* not JSON */
      }
    }
    setOut({ text: (r.text || `HTTP ${r.status}`) + extra, ok: r.ok });
  };
  return (
    <div className="phase-panel">
      <h2>Phase A — Account (tenant)</h2>
      <p className="lead">
        Creates tenant via Account API (no JWT). The Account container calls Keycloak as <code>http://keycloak:8080</code> — start Keycloak first (e.g.{" "}
        <code>docker compose up -d postgres keycloak</code> in <code>digit3/deploy/local</code>, then account). On success, <strong>Realm</strong> and <strong>OAuth username</strong> (tenant email) are set for Phase B. Local DIGIT compose normally provisions Keycloak with client{" "}
        <code>{LOCAL_DEMO_OAUTH.clientId}</code> / secret <code>{LOCAL_DEMO_OAUTH.clientSecret}</code> and superuser password <code>{LOCAL_DEMO_OAUTH.password}</code> for that realm.
      </p>
      <div className="field">
        <label>Tenant name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Tenant email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label>Optional tenant code (realm name)</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Leave empty for auto" />
      </div>
      <div className="btn-row">
        <ApiHelpButton
          specId="account_create"
          s={s}
          getExtras={() => ({ name, email, code: code.trim() || undefined })}
        />
        <button type="button" className="primary" onClick={createTenant}>
          Create tenant
        </button>
      </div>
      <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem" }}>Existing tenant (reuse stack)</h3>
      <p className="lead" style={{ fontSize: "0.85rem" }}>
        After a Docker restart, data often remains in Postgres. Look up by <strong>tenant code</strong> (realm) to fill Connection — then Phase B / <strong>R · Resume</strong> for JWT and read-only checks.
      </p>
      <ExistingTenantLookup s={s} setS={setS} />
      <Result {...out} />
    </div>
  );
}

function ExistingTenantLookup({
  s,
  setS,
}: {
  s: ServiceSettings;
  setS: Dispatch<SetStateAction<ServiceSettings>>;
}) {
  const [lookupCode, setLookupCode] = useState("");
  const [out, setOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const lookup = async () => {
    const code = lookupCode.trim();
    if (!code) {
      setOut({ text: "Enter tenant code to look up.", ok: false });
      return;
    }
    setOut({ text: "…", ok: true });
    const r = await apiPost("/api/account/tenant/lookup", {
      accountBaseUrl: s.accountBaseUrl,
      xClientId: s.accountClientId,
      code,
    });
    let extra = "";
    if (r.ok) {
      try {
        const j = JSON.parse(r.text) as { tenants?: Array<Record<string, unknown>> };
        const t = j.tenants?.[0];
        if (t && typeof t === "object") {
          const tc = typeof t.code === "string" ? t.code.trim() : "";
          const em = pickTenantEmail(t);
          setS((prev) => ({
            ...prev,
            realm: tc || prev.realm,
            oauthUsername: em || prev.oauthUsername,
            oauthClientId: prev.oauthClientId || LOCAL_DEMO_OAUTH.clientId,
            oauthSecret: prev.oauthSecret || LOCAL_DEMO_OAUTH.clientSecret,
            oauthPassword: prev.oauthPassword || LOCAL_DEMO_OAUTH.password,
          }));
          extra = `\n\n✓ Connection → Realm "${tc || "—"}"${em ? `, OAuth username "${em}"` : ""}. Fetch JWT in Phase B or R.`;
        }
      } catch {
        /* not JSON */
      }
    }
    setOut({ text: (r.text || `HTTP ${r.status}`) + extra, ok: r.ok });
  };
  return (
    <>
      <div className="field">
        <label>Tenant code to look up</label>
        <input value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} placeholder="e.g. DEMOMUNICIPALITY1" />
      </div>
      <div className="btn-row">
        <ApiHelpButton specId="account_lookup" s={s} getExtras={() => ({ lookupCode: lookupCode.trim() })} />
        <button type="button" className="secondary" onClick={lookup}>
          Look up tenant
        </button>
      </div>
      <Result {...out} />
    </>
  );
}

export function PhaseBPanel({ s, setS }: { s: ServiceSettings; setS: Dispatch<SetStateAction<ServiceSettings>> }) {
  const [out, setOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const fetchToken = async () => {
    setOut({ text: "…", ok: true });
    const r = await apiPost("/api/auth/token", {
      keycloakOrigin: s.keycloakOrigin.trim(),
      realm: s.realm.trim(),
      clientId: s.oauthClientId.trim(),
      clientSecret: s.oauthSecret.trim(),
      username: s.oauthUsername.trim(),
      password: s.oauthPassword,
    });
    if (r.ok) {
      try {
        const j = JSON.parse(r.text);
        if (j.access_token) setS((prev) => ({ ...prev, jwt: j.access_token }));
      } catch {
        /* ignore */
      }
      setOut({ text: r.text || "OK", ok: true });
    } else {
      setOut({ text: formatTokenError(r.text), ok: false });
    }
  };
  const realmSet = !!s.realm.trim();
  const oauthReady =
    s.keycloakOrigin.trim() &&
    realmSet &&
    s.oauthClientId.trim() &&
    s.oauthSecret.trim() &&
    s.oauthUsername.trim() &&
    s.oauthPassword.trim();
  return (
    <div className="phase-panel">
      <h2>Phase B — Keycloak & JWT</h2>
      <p className="lead">
        Local demo: Connection is pre-filled with <code>auth-server</code> / <code>changeme</code> / user <code>{s.oauthUsername.trim() || LOCAL_DEMO_OAUTH.username}</code> / <code>default</code>. Realm should match Phase A (
        <code>{s.realm.trim() || "—"}</code>). If token fails, Keycloak may not have synced this realm yet — use full provision or create the realm in Keycloak Admin.
      </p>
      <ul>
        <li>
          Realm: {realmSet ? <strong style={{ color: "var(--ok)" }}>{s.realm.trim()}</strong> : <strong style={{ color: "var(--err)" }}>empty — run Phase A first</strong>}
        </li>
        <li>OAuth username should match the tenant admin email (set automatically after Phase A).</li>
      </ul>
      <p className="lead" style={{ fontSize: "0.85rem", color: oauthReady ? "var(--ok)" : "var(--muted)" }}>
        {oauthReady ? "Ready — click Get access token." : "Complete Connection (left) if anything was cleared."}
      </p>
      <div className="btn-row">
        <ApiHelpButton specId="auth_token" s={s} />
        <button type="button" className="primary" onClick={fetchToken}>
          Get access token
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

const RESUME_DEFAULT_BOUNDARY_CODES = "WARD-001,WARD-002";
const RESUME_DEFAULT_REGISTRY_CODES = "core.facility,complaints.case";
const RESUME_DEFAULT_MDMS_CODES = "complaint.types";

export function PhaseResumePanel({ s, setS }: { s: ServiceSettings; setS: Dispatch<SetStateAction<ServiceSettings>> }) {
  const [snapOut, setSnapOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const [tokOut, setTokOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const [boundaryCodes, setBoundaryCodes] = useState(RESUME_DEFAULT_BOUNDARY_CODES);
  const [registryCodes, setRegistryCodes] = useState(RESUME_DEFAULT_REGISTRY_CODES);
  const [mdmsCodes, setMdmsCodes] = useState(RESUME_DEFAULT_MDMS_CODES);
  const [wfCode, setWfCode] = useState("PGR67");
  const [idgenTpl, setIdgenTpl] = useState("registryId");

  const refreshJwt = async () => {
    setTokOut({ text: "…", ok: true });
    const r = await apiPost("/api/auth/token", {
      keycloakOrigin: s.keycloakOrigin.trim(),
      realm: s.realm.trim(),
      clientId: s.oauthClientId.trim(),
      clientSecret: s.oauthSecret.trim(),
      username: s.oauthUsername.trim(),
      password: s.oauthPassword,
    });
    if (r.ok) {
      try {
        const j = JSON.parse(r.text) as { access_token?: string };
        if (j.access_token) setS((prev) => ({ ...prev, jwt: j.access_token }));
      } catch {
        /* ignore */
      }
      setTokOut({ text: r.text || "OK", ok: true });
    } else {
      setTokOut({ text: formatTokenError(r.text), ok: false });
    }
  };

  const splitCodes = (raw: string) =>
    raw
      .split(/[,;\s]+/)
      .map((c) => c.trim())
      .filter(Boolean);

  const runSnapshot = async () => {
    setSnapOut({ text: "…", ok: true });
    const lines: string[] = [];
    let allOk = true;
    const jwt = s.jwt.trim();
    if (!jwt) {
      lines.push("No JWT in Connection — use “Get access token” above first.");
      allOk = false;
    }
    const realm = s.realm.trim();
    lines.push(`Tenant (realm): ${realm || "(empty)"}`);
    lines.push("");

    if (jwt) {
      const bc = splitCodes(boundaryCodes);
      if (bc.length) {
        const r = await apiPost("/api/boundary/search", {
          boundaryBaseUrl: s.boundaryBaseUrl,
          jwt,
          codes: bc,
        });
        lines.push(`=== Boundaries GET (${bc.join(", ")}) HTTP ${r.status} ===`);
        lines.push(r.text || "(empty body)");
        if (!r.ok) allOk = false;
        lines.push("");
      }

      for (const code of splitCodes(registryCodes)) {
        const r = await apiPost("/api/registry/schema/get", {
          registryBaseUrl: s.registryBaseUrl,
          jwt,
          schemaCode: code,
        });
        lines.push(`=== Registry schema "${code}" HTTP ${r.status} ===`);
        lines.push(r.text || "(empty body)");
        if (!r.ok) allOk = false;
        lines.push("");
      }

      for (const code of splitCodes(mdmsCodes)) {
        const r = await apiPost("/api/mdms/schema/get", {
          mdmsBaseUrl: s.mdmsBaseUrl,
          jwt,
          schemaCode: code,
        });
        lines.push(`=== MDMS schema "${code}" HTTP ${r.status} ===`);
        lines.push(r.text || "(empty body)");
        if (!r.ok) allOk = false;
        lines.push("");
      }

      const wr = await apiPost("/api/workflow/process-by-code", {
        workflowBaseUrl: s.workflowBaseUrl,
        jwt,
        code: wfCode.trim() || "PGR67",
      });
      lines.push(`=== Workflow process code=${wfCode.trim() || "PGR67"} HTTP ${wr.status} ===`);
      lines.push(wr.text || "(empty body)");
      if (!wr.ok) allOk = false;
      lines.push("");

      const ir = await apiPost("/api/idgen/template/search", {
        idgenBaseUrl: s.idgenBaseUrl,
        jwt,
        templateCode: idgenTpl.trim() || "registryId",
      });
      lines.push(`=== IdGen template "${idgenTpl.trim() || "registryId"}" HTTP ${ir.status} ===`);
      lines.push(ir.text || "(empty body)");
      if (!ir.ok) allOk = false;
    }

    setSnapOut({ text: lines.join("\n").trim(), ok: allOk });
  };

  return (
    <div className="phase-panel">
      <h2>R — Resume / inspect existing stack</h2>
      <p className="lead">
        Use this after a UI or container restart when <strong>Postgres still has data</strong>. Phase A → <strong>Look up tenant</strong> sets realm and admin email; then refresh JWT here and pull read-only snapshots (boundaries, schemas, workflow process, IdGen).
      </p>
      <h3 style={{ fontSize: "0.95rem", margin: "1rem 0 0.5rem" }}>Access token</h3>
      <div className="btn-row">
        <ApiHelpButton specId="auth_token" s={s} />
        <button type="button" className="primary" onClick={refreshJwt}>
          Get access token
        </button>
      </div>
      <Result {...tokOut} />
      <h3 style={{ fontSize: "0.95rem", margin: "1rem 0 0.5rem" }}>What to fetch (comma-separated codes)</h3>
      <div className="field">
        <label>Boundary codes</label>
        <input value={boundaryCodes} onChange={(e) => setBoundaryCodes(e.target.value)} />
      </div>
      <div className="field">
        <label>Registry schema codes</label>
        <input value={registryCodes} onChange={(e) => setRegistryCodes(e.target.value)} />
      </div>
      <div className="field">
        <label>MDMS schema codes</label>
        <input value={mdmsCodes} onChange={(e) => setMdmsCodes(e.target.value)} />
      </div>
      <div className="field">
        <label>Workflow business code (for process UUID)</label>
        <input value={wfCode} onChange={(e) => setWfCode(e.target.value)} />
      </div>
      <div className="field">
        <label>IdGen template code</label>
        <input value={idgenTpl} onChange={(e) => setIdgenTpl(e.target.value)} />
      </div>
      <div className="btn-row">
        <ApiHelpButton
          specId="resume_snapshot"
          s={s}
          getExtras={() => ({
            boundaryCodes,
            registryCodes,
            mdmsCodes,
            wfCode: wfCode.trim() || "PGR67",
            idgenTpl: idgenTpl.trim() || "registryId",
          })}
        />
        <button type="button" className="primary" onClick={runSnapshot}>
          Fetch combined snapshot
        </button>
      </div>
      <Result {...snapOut} />
    </div>
  );
}

export function PhaseCPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  const [yaml, setYaml] = useState(EXAMPLE_BOUNDARIES);
  return (
    <div className="phase-panel">
      <h2>Phase C — Boundaries</h2>
      <p className="lead">
        POST <code>/boundary/v1</code> with YAML containing a top-level <code>boundary</code> array. Requires a JWT from Phase B for your realm. Start the stack service <code>boundary-service</code> (host <code>127.0.0.1:8093</code>) with <code>postgres</code>, <code>redis</code>, and <code>boundary-migration</code> — e.g.{" "}
        <code>docker compose up -d postgres redis boundary-migration boundary-service</code> in <code>digit3/deploy/local</code>. Realm/code limits follow boundary DB migration <code>V20260404120000</code> (≤255 after migrate). JWT <code>sub</code> is truncated to <strong>64</strong> for <code>X-Client-Id</code> (audit column).
      </p>
      <FullscreenYamlJsonField
        label="Boundary YAML"
        value={yaml}
        onChange={setYaml}
        textareaClassName="tall"
        modalTitle="Boundary YAML"
      />
      <div className="btn-row">
        <button type="button" className="secondary" onClick={() => setYaml(EXAMPLE_BOUNDARIES)}>
          Load example
        </button>
        <ApiHelpButton specId="boundary_create" s={s} />
        <button type="button" className="primary" onClick={() => run("/api/boundary/create", { boundaryBaseUrl: s.boundaryBaseUrl, jwt: s.jwt, yaml })}>
          Create boundaries
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

export function PhaseDPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  const [coreYaml, setCoreYaml] = useState(EXAMPLE_CORE_REGISTRY);
  const [tplCode, setTplCode] = useState("registryId");
  const [idPattern, setIdPattern] = useState(REGISTRY_IDGEN_DEFAULT.idPattern);
  const [scope, setScope] = useState(REGISTRY_IDGEN_DEFAULT.scope);
  const [start, setStart] = useState(REGISTRY_IDGEN_DEFAULT.start);
  const [padLen, setPadLen] = useState(REGISTRY_IDGEN_DEFAULT.padLen);
  const [padChar, setPadChar] = useState(REGISTRY_IDGEN_DEFAULT.padChar);
  const [randLen, setRandLen] = useState(REGISTRY_IDGEN_DEFAULT.randLen);
  const [randCharset, setRandCharset] = useState(REGISTRY_IDGEN_DEFAULT.randCharset);
  const [sampleOrg, setSampleOrg] = useState(REGISTRY_IDGEN_DEFAULT.sampleOrg);

  const idgenConfigPayload = () => ({
    template: idPattern.trim(),
    sequence: {
      scope: scope.trim(),
      start: Number(start) || 1,
      padding: { length: Number(padLen) || 4, char: padChar || "0" },
    },
    random: { length: Number(randLen) || 0, charset: randCharset || "A-Z0-9" },
  });

  const applyFetchedConfig = (cfg: {
    template?: string;
    sequence?: { scope?: string; start?: number; padding?: { length?: number; char?: string } };
    random?: { length?: number; charset?: string };
  }) => {
    if (typeof cfg.template === "string") setIdPattern(cfg.template);
    if (cfg.sequence) {
      if (typeof cfg.sequence.scope === "string") setScope(cfg.sequence.scope);
      if (typeof cfg.sequence.start === "number") setStart(String(cfg.sequence.start));
      if (cfg.sequence.padding) {
        if (typeof cfg.sequence.padding.length === "number") setPadLen(String(cfg.sequence.padding.length));
        if (typeof cfg.sequence.padding.char === "string") setPadChar(cfg.sequence.padding.char);
      }
    }
    if (cfg.random) {
      if (typeof cfg.random.length === "number") setRandLen(String(cfg.random.length));
      if (typeof cfg.random.charset === "string") setRandCharset(cfg.random.charset);
    }
  };

  const [fetchOut, setFetchOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });

  const resetIdFormat = () => {
    setIdPattern(REGISTRY_IDGEN_DEFAULT.idPattern);
    setScope(REGISTRY_IDGEN_DEFAULT.scope);
    setStart(REGISTRY_IDGEN_DEFAULT.start);
    setPadLen(REGISTRY_IDGEN_DEFAULT.padLen);
    setPadChar(REGISTRY_IDGEN_DEFAULT.padChar);
    setRandLen(REGISTRY_IDGEN_DEFAULT.randLen);
    setRandCharset(REGISTRY_IDGEN_DEFAULT.randCharset);
    setSampleOrg(REGISTRY_IDGEN_DEFAULT.sampleOrg);
  };

  const runFetchTemplate = async () => {
    setFetchOut({ text: "…", ok: true });
    const r = await apiPost("/api/idgen/template/search", {
      idgenBaseUrl: s.idgenBaseUrl,
      jwt: s.jwt,
      templateCode: tplCode.trim(),
    });
    if (!r.ok) {
      setFetchOut({ text: r.text || `HTTP ${r.status}`, ok: false });
      return;
    }
    try {
      const list = JSON.parse(r.text) as Array<{ config?: Parameters<typeof applyFetchedConfig>[0] }>;
      const row = Array.isArray(list) ? list[0] : null;
      if (row?.config) {
        applyFetchedConfig(row.config);
        setFetchOut({ text: `Loaded latest template version for "${tplCode.trim()}".`, ok: true });
      } else {
        setFetchOut({ text: "No template returned (empty list). Create one below.", ok: false });
      }
    } catch {
      setFetchOut({ text: r.text || "Invalid JSON", ok: false });
    }
  };

  return (
    <div className="phase-panel">
      <h2>Phase D — Core registry + IdGen</h2>
      <p className="lead">
        Platform registry schema and <strong>configurable</strong> IdGen template for <code>registryId</code>-style IDs. Registry uses template code{" "}
        <code>registryId</code> and passes <code>ORG</code> from server env (<code>IDGEN_ORG_VALUE</code>, often <code>REGISTRY</code>).
      </p>
      <FullscreenYamlJsonField
        label="Core registry schema YAML"
        value={coreYaml}
        onChange={setCoreYaml}
        textareaClassName="tall"
        modalTitle="Core registry schema YAML"
      />
      <div className="btn-row">
        <button type="button" className="secondary" onClick={() => setCoreYaml(EXAMPLE_CORE_REGISTRY)}>
          Load example
        </button>
        <ApiHelpButton specId="registry_schema" s={s} />
        <button
          type="button"
          className="primary"
          onClick={() => run("/api/registry/schema", { registryBaseUrl: s.registryBaseUrl, jwt: s.jwt, yaml: coreYaml })}
        >
          Create core registry schema
        </button>
      </div>

      <h3 style={{ marginTop: "1.25rem", fontSize: "1rem" }}>ID format (IdGen)</h3>
      <p className="lead" style={{ fontSize: "0.85rem" }}>
        Pattern uses tokens: <code>{"{ORG}"}</code> and other names → values from the caller; <code>{"{DATE:yyyyMMdd}"}</code> (and other date keywords);{" "}
        <code>{"{SEQ}"}</code> with scope below; <code>{"{RAND}"}</code> when random length &gt; 0.
      </p>
      <div className="field">
        <label>Template code</label>
        <input value={tplCode} onChange={(e) => setTplCode(e.target.value)} placeholder="registryId" />
      </div>
      <FullscreenYamlJsonField
        label="Template string (human-readable format)"
        value={idPattern}
        onChange={setIdPattern}
        textareaClassName=""
        modalTitle="IdGen template string"
        rows={2}
      />
      <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="field">
          <label>Sequence scope</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="daily">daily (resets each day)</option>
            <option value="monthly">monthly</option>
            <option value="yearly">yearly</option>
            <option value="global">global (no reset)</option>
          </select>
        </div>
        <div className="field">
          <label>Sequence start</label>
          <input value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" />
        </div>
        <div className="field">
          <label>Padding length</label>
          <input value={padLen} onChange={(e) => setPadLen(e.target.value)} inputMode="numeric" />
        </div>
        <div className="field">
          <label>Padding character</label>
          <input value={padChar} onChange={(e) => setPadChar(e.target.value)} maxLength={1} />
        </div>
        <div className="field">
          <label>Random length (0 = omit {"{RAND}"} from pattern)</label>
          <input value={randLen} onChange={(e) => setRandLen(e.target.value)} inputMode="numeric" />
        </div>
        <div className="field">
          <label>Random charset</label>
          <input value={randCharset} onChange={(e) => setRandCharset(e.target.value)} placeholder="A-Z0-9" />
        </div>
      </div>
      <div className="field">
        <label>
          Sample <code>ORG</code> for “Generate sample ID” (matches registry env in local compose)
        </label>
        <input value={sampleOrg} onChange={(e) => setSampleOrg(e.target.value)} />
      </div>
      <div className="btn-row" style={{ flexWrap: "wrap" }}>
        <button type="button" className="secondary" onClick={resetIdFormat}>
          Reset format to demo default
        </button>
        <ApiHelpButton specId="idgen_template_search" s={s} getExtras={() => ({ templateCode: tplCode.trim() || "registryId" })} />
        <button type="button" className="secondary" onClick={runFetchTemplate}>
          Fetch current format from IdGen
        </button>
        <ApiHelpButton specId="idgen_template_create" s={s} getExtras={() => ({ templateCode: tplCode.trim() || "registryId" })} />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run("/api/idgen/template", {
              idgenBaseUrl: s.idgenBaseUrl,
              jwt: s.jwt,
              templateCode: tplCode.trim(),
              config: idgenConfigPayload(),
            })
          }
        >
          Create IdGen template
        </button>
        <ApiHelpButton specId="idgen_template_update" s={s} getExtras={() => ({ templateCode: tplCode.trim() || "registryId" })} />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run(
              "/api/idgen/template",
              {
                idgenBaseUrl: s.idgenBaseUrl,
                jwt: s.jwt,
                templateCode: tplCode.trim(),
                config: idgenConfigPayload(),
              },
              "PUT"
            )
          }
        >
          Update IdGen template (new version)
        </button>
      </div>
      <p className="lead" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
        “Update” calls PUT and creates a new template version; generation always uses the latest version.
      </p>
      <div className="btn-row">
        <ApiHelpButton
          specId="idgen_generate"
          s={s}
          getExtras={() => ({
            templateCode: tplCode.trim() || "registryId",
            org: sampleOrg.trim() || "REGISTRY",
          })}
        />
        <button
          type="button"
          className="secondary"
          onClick={() =>
            run("/api/idgen/generate", {
              idgenBaseUrl: s.idgenBaseUrl,
              jwt: s.jwt,
              templateCode: tplCode.trim(),
              variables: { ORG: sampleOrg.trim() || "REGISTRY" },
            })
          }
        >
          Generate sample ID (preview)
        </button>
      </div>
      {fetchOut.text ? <pre className={`result ${fetchOut.ok ? "ok" : "err"}`}>{fetchOut.text}</pre> : null}
      <Result {...out} />
    </div>
  );
}

export function PhaseEPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  const [yaml, setYaml] = useState(EXAMPLE_CASE_REGISTRY);
  return (
    <div className="phase-panel">
      <h2>Phase E — Complaints registry schema</h2>
      <p className="lead">Defines <code>complaints.case</code> (or your schema code) on the registry service.</p>
      <FullscreenYamlJsonField
        label="Registry schema YAML"
        value={yaml}
        onChange={setYaml}
        textareaClassName="tall"
        modalTitle="Complaints registry schema YAML"
      />
      <div className="btn-row">
        <button type="button" className="secondary" onClick={() => setYaml(EXAMPLE_CASE_REGISTRY)}>
          Load example
        </button>
        <ApiHelpButton specId="registry_schema" s={s} />
        <button type="button" className="primary" onClick={() => run("/api/registry/schema", { registryBaseUrl: s.registryBaseUrl, jwt: s.jwt, yaml })}>
          Create schema
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

export function PhaseFPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  const [sch, setSch] = useState(EXAMPLE_MDMS_SCHEMA);
  const [data, setData] = useState(EXAMPLE_MDMS_DATA);
  return (
    <div className="phase-panel">
      <h2>Phase F — MDMS (masters)</h2>
      <p className="lead">Create schema then data. Schema YAML uses <code>schema.code</code>, <code>schema.description</code>, <code>schema.definition</code>.</p>
      <FullscreenYamlJsonField
        label="MDMS schema YAML"
        value={sch}
        onChange={setSch}
        textareaClassName="tall"
        modalTitle="MDMS schema YAML"
      />
      <div className="btn-row">
        <button type="button" className="secondary" onClick={() => setSch(EXAMPLE_MDMS_SCHEMA)}>
          Load schema example
        </button>
        <ApiHelpButton specId="mdms_schema" s={s} />
        <button type="button" className="primary" onClick={() => run("/api/mdms/schema", { mdmsBaseUrl: s.mdmsBaseUrl, jwt: s.jwt, yaml: sch })}>
          Create MDMS schema
        </button>
      </div>
      <FullscreenYamlJsonField
        label="MDMS data YAML"
        value={data}
        onChange={setData}
        textareaClassName="tall"
        modalTitle="MDMS data YAML"
      />
      <div className="btn-row">
        <button type="button" className="secondary" onClick={() => setData(EXAMPLE_MDMS_DATA)}>
          Load data example
        </button>
        <ApiHelpButton specId="mdms_data" s={s} />
        <button type="button" className="primary" onClick={() => run("/api/mdms/data", { mdmsBaseUrl: s.mdmsBaseUrl, jwt: s.jwt, yaml: data })}>
          Create MDMS data
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

export function PhaseGPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  const [yaml, setYaml] = useState(EXAMPLE_WORKFLOW);
  return (
    <div className="phase-panel">
      <h2>Phase G — Workflow</h2>
      <p className="lead">Deploys process, states, and actions in order (same logic as <code>digit create-workflow</code>). Use full <code>example-workflow.yaml</code> from digit-cli for the complete graph.</p>
      <FullscreenYamlJsonField
        label="Workflow YAML"
        value={yaml}
        onChange={setYaml}
        textareaClassName="tall"
        modalTitle="Workflow YAML"
      />
      <div className="btn-row">
        <button type="button" className="secondary" onClick={() => setYaml(EXAMPLE_WORKFLOW)}>
          Load shortened example
        </button>
        <ApiHelpButton specId="workflow_deploy" s={s} />
        <button type="button" className="primary" onClick={() => run("/api/workflow/deploy", { workflowBaseUrl: s.workflowBaseUrl, jwt: s.jwt, yaml })}>
          Deploy workflow
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

export function PhaseHPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  const [catType, setCatType] = useState("ComplaintEvidence");
  const [catCode, setCatCode] = useState("COMPLAINT_ATTACHMENT");
  const [formats, setFormats] = useState("pdf,jpg,jpeg,png");
  const [tid, setTid] = useState("COMPLAINT_SUBMITTED");
  const [ver, setVer] = useState("1.0");
  const [ntype, setNtype] = useState("EMAIL");
  const [subj, setSubj] = useState("Complaint received");
  const [content, setContent] = useState("Your complaint {{ .id }} has been logged.");
  return (
    <div className="phase-panel">
      <h2>Phase H — Filestore & notifications</h2>
      <p className="lead">Document category for uploads; notification template for alerts.</p>
      <h3 style={{ fontSize: "0.95rem", margin: "1rem 0 0.5rem" }}>Document category</h3>
      <div className="field">
        <label>Type</label>
        <input value={catType} onChange={(e) => setCatType(e.target.value)} />
      </div>
      <div className="field">
        <label>Code</label>
        <input value={catCode} onChange={(e) => setCatCode(e.target.value)} />
      </div>
      <div className="field">
        <label>Allowed formats (comma-separated)</label>
        <input value={formats} onChange={(e) => setFormats(e.target.value)} />
      </div>
      <div className="btn-row">
        <ApiHelpButton specId="filestore_category" s={s} />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run("/api/filestore/category", {
              filestoreBaseUrl: s.filestoreBaseUrl,
              jwt: s.jwt,
              type: catType,
              code: catCode,
              allowedFormats: formats,
              minSize: 1024,
              maxSize: 5 * 1024 * 1024,
              isSensitive: false,
              isActive: true,
              description: "Case attachments",
            })
          }
        >
          Create category
        </button>
      </div>
      <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem" }}>Notification template</h3>
      <p className="lead" style={{ fontSize: "0.82rem" }}>
        The API proxy calls notification <strong>without</strong> <code>Authorization</code> so the egovio service uses truncated <code>X-Client-ID</code> (64 chars) for audit columns. If you still see <code>VARCHAR(64)</code> errors, widen the DB columns:{" "}
        <code>digit3/deploy/local/provision/sql/extend_notification_template_audit_varchar.sql</code>.
      </p>
      <div className="field">
        <label>Template ID</label>
        <input value={tid} onChange={(e) => setTid(e.target.value)} />
      </div>
      <div className="field">
        <label>Version</label>
        <input value={ver} onChange={(e) => setVer(e.target.value)} />
      </div>
      <div className="field">
        <label>Type</label>
        <select value={ntype} onChange={(e) => setNtype(e.target.value)}>
          <option value="EMAIL">EMAIL</option>
          <option value="SMS">SMS</option>
        </select>
      </div>
      <div className="field">
        <label>Subject</label>
        <input value={subj} onChange={(e) => setSubj(e.target.value)} />
      </div>
      <FullscreenYamlJsonField
        label={
          <>
            Content (Go template — use {"{{ .fieldName }}"}, not {"{{ fieldName }}"})
          </>
        }
        value={content}
        onChange={setContent}
        textareaClassName="tall"
        modalTitle="Notification template content"
      />
      <div className="btn-row">
        <ApiHelpButton specId="notification_template" s={s} />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run("/api/notification/template", {
              notificationBaseUrl: s.notificationBaseUrl,
              jwt: s.jwt,
              templateId: tid,
              version: ver,
              type: ntype,
              subject: subj,
              content,
              isHTML: false,
            })
          }
        >
          Create template
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

export function PhaseIPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  const [roleName, setRoleName] = useState("GRO");
  const [roleDesc, setRoleDesc] = useState("");
  const [uuser, setUuser] = useState("gro1");
  const [upass, setUpass] = useState("ChangeMe!");
  const [uemail, setUemail] = useState("gro1@example.gov");
  const [assignRole, setAssignRole] = useState("GRO");
  return (
    <div className="phase-panel">
      <h2>Phase I — Roles & users</h2>
      <p className="lead">Uses Keycloak Admin REST (same paths as digit-cli). JWT must belong to a user with rights to manage the realm.</p>
      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Create role</h3>
      <div className="field">
        <label>Role name</label>
        <input value={roleName} onChange={(e) => setRoleName(e.target.value)} />
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <input value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} />
      </div>
      <div className="btn-row">
        <ApiHelpButton
          specId="keycloak_role"
          s={s}
          getExtras={() => ({ roleName, roleDescription: roleDesc || roleName })}
        />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run("/api/keycloak/role", {
              keycloakOrigin: s.keycloakOrigin,
              realm: s.realm,
              jwt: s.jwt,
              roleName,
              description: roleDesc || roleName,
            })
          }
        >
          Create role
        </button>
      </div>
      <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem" }}>Create user</h3>
      <div className="field">
        <label>Username</label>
        <input value={uuser} onChange={(e) => setUuser(e.target.value)} />
      </div>
      <div className="field">
        <label>Password</label>
        <input value={upass} onChange={(e) => setUpass(e.target.value)} type="password" />
      </div>
      <div className="field">
        <label>Email</label>
        <input value={uemail} onChange={(e) => setUemail(e.target.value)} />
      </div>
      <div className="btn-row">
        <ApiHelpButton
          specId="keycloak_user"
          s={s}
          getExtras={() => ({ username: uuser, email: uemail, password: upass })}
        />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run("/api/keycloak/user", {
              keycloakOrigin: s.keycloakOrigin,
              realm: s.realm,
              jwt: s.jwt,
              username: uuser,
              password: upass,
              email: uemail,
            })
          }
        >
          Create user
        </button>
      </div>
      <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem" }}>Assign realm role</h3>
      <div className="field">
        <label>Username</label>
        <input value={uuser} onChange={(e) => setUuser(e.target.value)} />
      </div>
      <div className="field">
        <label>Role</label>
        <input value={assignRole} onChange={(e) => setAssignRole(e.target.value)} />
      </div>
      <div className="btn-row">
        <ApiHelpButton specId="keycloak_assign_role" s={s} />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run("/api/keycloak/assign-role", {
              keycloakOrigin: s.keycloakOrigin,
              realm: s.realm,
              jwt: s.jwt,
              username: uuser,
              roleName: assignRole,
            })
          }
        >
          Assign role
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

const DEFAULT_TRANSITION = `{
  "processId": "",
  "entityId": "",
  "action": "APPLY",
  "comment": "Submit",
  "init": true,
  "attributes": {
    "roles": ["CITIZEN"]
  }
}`;

const DEFAULT_REG_DATA = `{
  "serviceRequestId": "",
  "tenantId": "",
  "serviceCode": "NOISE",
  "description": "Test",
  "boundaryCode": "WARD-001",
  "applicationStatus": "OPEN"
}`;

function buildTransitionBody(processId: string, entityId: string, init: boolean) {
  const o: Record<string, unknown> = {
    processId,
    entityId,
    action: "APPLY",
    comment: "Submit",
    attributes: { roles: ["CITIZEN"] as string[] },
  };
  if (init) o.init = true;
  return o;
}

export function PhaseJPanel({ s }: { s: ServiceSettings }) {
  const { out, run, fail } = useRun();
  const [trans, setTrans] = useState(DEFAULT_TRANSITION);
  const [schemaCode, setSchemaCode] = useState("complaints.case");
  const [dataJson, setDataJson] = useState(DEFAULT_REG_DATA);
  const [lookupOut, setLookupOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });
  const [processBizCode, setProcessBizCode] = useState("PGR67");
  const [entityId, setEntityId] = useState("");
  const [initFirst, setInitFirst] = useState(true);
  const [histEntity, setHistEntity] = useState("");
  const [histProcess, setHistProcess] = useState("");
  const [histFull, setHistFull] = useState(true);
  const [histOut, setHistOut] = useState<{ text: string; ok: boolean }>({ text: "", ok: true });

  const resolveAndFill = async () => {
    setLookupOut({ text: "…", ok: true });
    const code = processBizCode.trim() || "PGR67";
    const r = await apiPost("/api/workflow/process-by-code", {
      workflowBaseUrl: s.workflowBaseUrl,
      jwt: s.jwt,
      code,
    });
    if (!r.ok) {
      setLookupOut({ text: r.text || `HTTP ${r.status}`, ok: false });
      return;
    }
    let processId = "";
    try {
      const arr = JSON.parse(r.text) as Array<{ id?: string }>;
      if (Array.isArray(arr) && arr[0]?.id) processId = String(arr[0].id);
    } catch {
      setLookupOut({ text: "Response is not a JSON array with [0].id (process UUID). Raw:\n" + r.text, ok: false });
      return;
    }
    if (!processId) {
      setLookupOut({ text: "No process id in response (empty array?). Raw:\n" + r.text, ok: false });
      return;
    }
    const eid = entityId.trim() || `DEMO-${Date.now()}`;
    setTrans(JSON.stringify(buildTransitionBody(processId, eid, initFirst), null, 2));
    try {
      const d = JSON.parse(dataJson) as Record<string, unknown>;
      d.serviceRequestId = eid;
      const realm = s.realm.trim();
      if (realm) d.tenantId = realm;
      setDataJson(JSON.stringify(d, null, 2));
    } catch {
      /* keep registry JSON as-is if invalid */
    }
    setHistEntity(eid);
    setHistProcess(processId);
    setLookupOut({
      text: `Filled transition + registry JSON.\nprocessId (UUID): ${processId}\nentityId / serviceRequestId: ${eid}`,
      ok: true,
    });
  };

  const syncHistoryFromTransition = () => {
    try {
      const b = JSON.parse(trans) as { entityId?: string; processId?: string };
      if (typeof b.entityId === "string" && b.entityId.trim()) setHistEntity(b.entityId.trim());
      if (typeof b.processId === "string" && b.processId.trim()) setHistProcess(b.processId.trim());
      setHistOut({ text: "Pulled entityId + processId from transition JSON.", ok: true });
    } catch (e) {
      setHistOut({ text: `Invalid transition JSON: ${String(e)}`, ok: false });
    }
  };

  const fetchTransitionHistory = async () => {
    setHistOut({ text: "…", ok: true });
    const r = await apiPost("/api/workflow/transition/history", {
      workflowBaseUrl: s.workflowBaseUrl,
      jwt: s.jwt,
      entityId: histEntity.trim(),
      processId: histProcess.trim(),
      history: histFull,
    });
    setHistOut({ text: r.text || `HTTP ${r.status}`, ok: r.ok });
  };

  const lookupProcessOnly = async () => {
    setLookupOut({ text: "…", ok: true });
    const r = await apiPost("/api/workflow/process-by-code", {
      workflowBaseUrl: s.workflowBaseUrl,
      jwt: s.jwt,
      code: processBizCode.trim() || "PGR67",
    });
    setLookupOut({ text: r.text, ok: r.ok });
  };

  return (
    <div className="phase-panel">
      <h2>Phase J — Run instance (workflow + registry)</h2>
      <p className="lead">
        Resolve the workflow <strong>process UUID</strong> from the business <strong>code</strong> (same as tab R / Phase G). Set <strong>entity id</strong> (case / service request id) or leave empty for a generated <code>DEMO-…</code> id. Use a JWT for a user whose roles match the action.{" "}
        <code>init: true</code> is for the first transition only. <strong>Audit:</strong> DIGIT in this repo does not ship a single “audit log” microservice in-tree; changes show up as row <code>auditDetails</code> on entities and as{" "}
        <strong>workflow transition history</strong> below (<code>GET /workflow/v1/transition?history=true</code>).
      </p>
      <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="field">
          <label>Process business code</label>
          <input value={processBizCode} onChange={(e) => setProcessBizCode(e.target.value)} placeholder="PGR67" />
        </div>
        <div className="field">
          <label>Entity id (optional)</label>
          <input
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="Empty → auto DEMO-… timestamp"
          />
        </div>
      </div>
      <div className="field" style={{ marginTop: "0.35rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input type="checkbox" checked={initFirst} onChange={(e) => setInitFirst(e.target.checked)} />
          First transition: include <code>init: true</code>
        </label>
      </div>
      <div className="btn-row">
        <ApiHelpButton specId="workflow_process_by_code" s={s} getExtras={() => ({ wfCode: processBizCode.trim() || "PGR67" })} />
        <button type="button" className="primary" onClick={resolveAndFill}>
          Resolve process UUID &amp; fill JSON
        </button>
        <button type="button" className="secondary" onClick={lookupProcessOnly}>
          Lookup process JSON only
        </button>
      </div>
      {lookupOut.text ? <Result {...lookupOut} /> : null}
      <FullscreenYamlJsonField
        label="Transition JSON"
        value={trans}
        onChange={setTrans}
        textareaClassName="tall"
        modalTitle="Workflow transition JSON"
      />
      <div className="btn-row">
        <ApiHelpButton specId="workflow_transition" s={s} />
        <button
          type="button"
          className="primary"
          onClick={() => {
            try {
              const body = JSON.parse(trans);
              run("/api/workflow/transition", { workflowBaseUrl: s.workflowBaseUrl, jwt: s.jwt, body });
            } catch (e) {
              fail(String(e));
            }
          }}
        >
          POST transition
        </button>
      </div>
      <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem" }}>Workflow transition history (audit trail)</h3>
      <p className="lead" style={{ fontSize: "0.82rem" }}>
        After <strong>Resolve process UUID &amp; fill JSON</strong>, entity and process UUID are filled here. Or paste from the transition JSON. <code>history=true</code> returns every step for this entity + process; off returns the latest instance only.
      </p>
      <div className="field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="field">
          <label>Entity id (case / service request id)</label>
          <input value={histEntity} onChange={(e) => setHistEntity(e.target.value)} placeholder="Same as transition entityId" />
        </div>
        <div className="field">
          <label>Process UUID</label>
          <input value={histProcess} onChange={(e) => setHistProcess(e.target.value)} placeholder="From transition processId" />
        </div>
      </div>
      <div className="field" style={{ marginTop: "0.35rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input type="checkbox" checked={histFull} onChange={(e) => setHistFull(e.target.checked)} />
          Full history (<code>history=true</code>)
        </label>
      </div>
      <div className="btn-row">
        <button type="button" className="secondary" onClick={syncHistoryFromTransition}>
          Sync from transition JSON
        </button>
        <ApiHelpButton
          specId="workflow_transition_history"
          s={s}
          getExtras={() => ({
            histEntity: histEntity.trim() || "ENTITY_ID",
            histProcess: histProcess.trim() || "PROCESS_UUID",
            histFull,
          })}
        />
        <button type="button" className="primary" onClick={fetchTransitionHistory}>
          GET transition history
        </button>
      </div>
      {histOut.text ? <Result {...histOut} /> : null}
      <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem" }}>Registry row (optional)</h3>
      <div className="field">
        <label>Schema code</label>
        <input value={schemaCode} onChange={(e) => setSchemaCode(e.target.value)} />
      </div>
      <FullscreenYamlJsonField
        label="Data JSON"
        value={dataJson}
        onChange={setDataJson}
        textareaClassName="tall"
        modalTitle="Registry row JSON"
      />
      <div className="btn-row">
        <ApiHelpButton specId="registry_data" s={s} getExtras={() => ({ schemaCode: schemaCode.trim() || "complaints.case" })} />
        <button
          type="button"
          className="primary"
          onClick={() => {
            try {
              const data = JSON.parse(dataJson);
              run("/api/registry/data", { registryBaseUrl: s.registryBaseUrl, jwt: s.jwt, schemaCode, data });
            } catch (e) {
              fail(String(e));
            }
          }}
        >
          POST registry data
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}

export function PhaseKPanel({ s }: { s: ServiceSettings }) {
  const { out, run } = useRun();
  return (
    <div className="phase-panel">
      <h2>Phase K — Smoke checks</h2>
      <p className="lead">
        Filestore: GET /health. Workflow: GET /workflow/v1/process without headers (expects 400 when up). Boundary: GET with JWT (400 still counts OK). IdGen: GET <code>/idgen/health</code> (rebuild local idgen image if 404). Registry: GET base URL + optional authenticated GET <code>/registry/v1/schema/core.facility</code> (404 means up but schema not created yet).
      </p>
      <div className="btn-row">
        <ApiHelpButton specId="health_checks" s={s} />
        <button
          type="button"
          className="primary"
          onClick={() =>
            run("/api/check/health", {
              filestoreBaseUrl: s.filestoreBaseUrl,
              workflowBaseUrl: s.workflowBaseUrl,
              boundaryBaseUrl: s.boundaryBaseUrl,
              idgenBaseUrl: s.idgenBaseUrl,
              registryBaseUrl: s.registryBaseUrl,
              jwt: s.jwt,
            })
          }
        >
          Run checks
        </button>
      </div>
      <Result {...out} />
    </div>
  );
}
