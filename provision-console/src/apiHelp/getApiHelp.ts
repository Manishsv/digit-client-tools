import type { ServiceSettings } from "../configDefaults";
import { jwtRealmFromIss, jwtSubPreview } from "./jwtPreview";

export type ApiHelpId =
  | "account_create"
  | "account_lookup"
  | "auth_token"
  | "resume_snapshot"
  | "boundary_create"
  | "boundary_search"
  | "registry_schema"
  | "registry_schema_get"
  | "registry_data"
  | "idgen_template_search"
  | "idgen_template_create"
  | "idgen_template_update"
  | "idgen_generate"
  | "mdms_schema"
  | "mdms_schema_get"
  | "mdms_data"
  | "workflow_deploy"
  | "workflow_process_by_code"
  | "workflow_transition"
  | "workflow_transition_history"
  | "filestore_category"
  | "notification_template"
  | "keycloak_role"
  | "keycloak_user"
  | "keycloak_assign_role"
  | "health_checks";

export type ApiHelpExtras = Record<string, unknown>;

export type ApiHelpPayload = {
  title: string;
  summary: string;
  curl: string;
  go?: string;
  java?: string;
  sdkNote?: string;
};

const JAVA_SDK = "digit-java-client (Maven artifact version 1.0.0 in repo pom.xml)";
const GO_SDK = "digit-go-client — package `digit` (Go module: github.com/digitnxt/digit3/code/libraries/digit-library)";

function sh(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Authorization / tenant / client lines for curl (single-quoted -H args). */
function lineAuthBearer(jwtSet: boolean, rawJwt: string): string {
  if (jwtSet) return `  -H ${sh(`Authorization: Bearer ${rawJwt}`)} \\`;
  return `  -H 'Authorization: Bearer '"$JWT" \\`;
}

function lineTenant(realm: string): string {
  return `  -H ${sh(`X-Tenant-ID: ${realm}`)} \\`;
}

function lineClient(sub64: string): string {
  return `  -H ${sh(`X-Client-ID: ${sub64}`)} \\`;
}

function lineContentJson(): string {
  return `  -H 'Content-Type: application/json' \\`;
}

export function getApiHelp(id: ApiHelpId, s: ServiceSettings, x: ApiHelpExtras = {}): ApiHelpPayload {
  const realm = s.realm.trim() || jwtRealmFromIss(s.jwt) || "YOUR_REALM";
  const jwtSet = !!s.jwt.trim();
  const sub = jwtSet ? jwtSubPreview(s.jwt) : "YOUR_JWT_SUB";
  const sub64 = jwtSet ? jwtSubPreview(s.jwt, 64) : "YOUR_JWT_SUB";
  const bearer = jwtSet ? s.jwt.trim() : "$JWT";
  const jwtRaw = () => s.jwt.trim();

  const hJsonAuthC64 = () =>
    [lineContentJson(), lineAuthBearer(jwtSet, jwtRaw()), lineTenant(realm), lineClient(sub64)].join("\n");
  const hJsonAuthSub = () =>
    [lineContentJson(), lineAuthBearer(jwtSet, jwtRaw()), lineTenant(realm), lineClient(sub)].join("\n");
  const hGetAuthC64 = () => [lineAuthBearer(jwtSet, jwtRaw()), lineTenant(realm), lineClient(sub64)].join("\n");
  const hGetAuthSub = () => [lineAuthBearer(jwtSet, jwtRaw()), lineTenant(realm), lineClient(sub)].join("\n");
  const hWorkflowJson = () => [lineContentJson(), lineTenant(realm), lineClient(sub64)].join("\n");
  const hWorkflowPlain = () => [lineTenant(realm), lineClient(sub64)].join("\n");

  const sdkNote = `Client libraries in this repo: ${JAVA_SDK}. ${GO_SDK}. Some operations are REST-only in Go; use curl or extend the client.`;

  switch (id) {
    case "account_create": {
      const name = String(x.name ?? "Demo Municipality");
      const email = String(x.email ?? "admin@demo.gov");
      const codeK =
        x.code != null && String(x.code).trim()
          ? `,\n      "code": ${JSON.stringify(String(x.code).trim())}`
          : "";
      const curl = `# No JWT. X-Client-Id is a fixed operator client (not JWT sub).
curl -sS -X POST ${sh(`${s.accountBaseUrl.replace(/\/$/, "")}/account/v1`)} \\
  -H 'Content-Type: application/json' \\
  -H ${sh(`X-Client-Id: ${s.accountClientId}`)} \\
  -d '{
    "tenant": {
      "name": ${JSON.stringify(name)},
      "email": ${JSON.stringify(email)},
      "isActive": true,
      "additionalAttributes": {}${codeK}
    }
  }'`;
      return {
        title: "Account — create tenant",
        summary: "POST /account/v1 — creates tenant (realm). Used before Keycloak user exists.",
        curl,
        go: `import "github.com/digitnxt/digit3/code/libraries/digit-library/digit"

// CreateAccount(serverURL, clientID, name, email, active bool)
_, err := digit.CreateAccount(${sh(s.accountBaseUrl)}, ${sh(s.accountClientId)}, ${sh(name)}, ${sh(email)}, true)`,
        java: `// AccountClient.createTenant(...) — see AccountClient.java
// POST {accountServiceUrl}/account/v1 with X-Client-Id header`,
        sdkNote,
      };
    }

    case "account_lookup": {
      const code = String(x.lookupCode ?? "TENANT_CODE");
      const curl = `curl -sS -G ${sh(`${s.accountBaseUrl.replace(/\/$/, "")}/account/v1`)} \\
  --data-urlencode ${sh(`code=${code}`)} \\
  -H ${sh(`X-Client-Id: ${s.accountClientId}`)}`;
      return {
        title: "Account — search tenant by code",
        summary: "GET /account/v1?code=… — returns TenantResponse with tenants[].",
        curl,
        go: `// Not wrapped in digit-go-client account.go — use GET with X-Client-Id
// Java: accountClient.searchTenantByCode("${code}")`,
        java: `Tenant t = accountClient.searchTenantByCode("${code}");`,
        sdkNote,
      };
    }

    case "auth_token": {
      const curl = `# Keycloak (not DIGIT core) — password grant
curl -sS -X POST ${sh(`${s.keycloakOrigin.replace(/\/$/, "")}/keycloak/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`)} \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  --data-urlencode ${sh(`grant_type=password`)} \\
  --data-urlencode ${sh(`client_id=${s.oauthClientId}`)} \\
  --data-urlencode ${sh(`client_secret=${s.oauthSecret || "SECRET"}`)} \\
  --data-urlencode ${sh(`username=${s.oauthUsername}`)} \\
  --data-urlencode ${sh("password=…")}`;
      return {
        title: "Keycloak — access token",
        summary: "OAuth2 password grant to obtain Bearer JWT for DIGIT APIs.",
        curl,
        go: `digit.GetJWTToken(server, realm, clientID, clientSecret, username, password)`,
        java: `// Typically Spring Security OAuth2 client — see auth docs`,
        sdkNote: `${sdkNote} Token endpoint is Keycloak, not DIGIT.`,
      };
    }

    case "resume_snapshot": {
      const bc = String(x.boundaryCodes ?? "WARD-001,WARD-002");
      const rc = String(x.registryCodes ?? "core.facility,complaints.case");
      const mc = String(x.mdmsCodes ?? "complaint.types");
      const wf = String(x.wfCode ?? "PGR67");
      const ig = String(x.idgenTpl ?? "registryId");
      const codeQs = bc
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((c) => `  --data-urlencode ${sh(`codes=${c}`)}`)
        .join(" \\\n");
      const curl = `# Resume tab runs these DIGIT reads in sequence.
# 1) Boundaries — GET /boundary/v1?codes=… (repeat codes= for each)
curl -sS -G ${sh(`${s.boundaryBaseUrl.replace(/\/$/, "")}/boundary/v1`)} \\
${hGetAuthC64()}
${codeQs}

# 2) Registry schema — repeat for each code in "${rc}":
# curl -sS ${sh(`${s.registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema/<schemaCode>`)} \\
# ${hGetAuthSub()}

# 3) MDMS schema — GET /mdms-v2/v1/schema?code= for each in "${mc}"

# 4) Workflow process — GET /workflow/v1/process?code=${wf} (no Bearer; X-Tenant-ID + X-Client-ID only)

# 5) IdGen template — GET /idgen/v1/template?templateCode=${ig}`;
      return {
        title: "Resume tab — combined snapshot",
        summary: "Multiple GETs: boundary search, registry schema, MDMS schema, workflow process by code, IdGen template.",
        curl,
        go: `// digit.SearchRegistrySchema, SearchSchema, SearchIdGenTemplate, etc. — see digit/*.go`,
        java: `// BoundaryClient, MdmsClient, IdGenClient, WorkflowClient — see *Client.java`,
        sdkNote,
      };
    }

    case "boundary_create": {
      const curl = `# Body: JSON { "boundary": [ { code, geometry, additionalDetails }, ... ] }
# Console accepts YAML; proxy converts to JSON. Below: use a file boundary.json
curl -sS -X POST ${sh(`${s.boundaryBaseUrl.replace(/\/$/, "")}/boundary/v1`)} \\
${hJsonAuthC64()}
  -d @boundary.json`;
      return {
        title: "Boundary — create",
        summary: "POST /boundary/v1 — batch create boundaries. X-Client-ID truncated to 64 for audit columns.",
        curl,
        go: `digit.CreateBoundaries(serverURL, jwtToken, tenantID, clientID, boundaryData []map[string]interface{})`,
        java: `boundaryClient.createBoundaries(List<Boundary> boundaries)`,
        sdkNote,
      };
    }

    case "boundary_search": {
      const codes = String(x.codes ?? "WARD-001,WARD-002");
      const q = codes
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((c) => `--data-urlencode ${sh(`codes=${c}`)}`)
        .join(" \\\n  ");
      const curl = `curl -sS -G ${sh(`${s.boundaryBaseUrl.replace(/\/$/, "")}/boundary/v1`)} \\
${hGetAuthC64()}
  ${q}`;
      return {
        title: "Boundary — search by codes",
        summary: "GET /boundary/v1?codes=… (repeat param per code).",
        curl,
        java: `// BoundaryClient search by codes — see BoundaryClient.java`,
        sdkNote,
      };
    }

    case "registry_schema": {
      const curl = `# Service expects JSON: { "schemaCode", "definition" }. Console sends YAML; convert offline.
curl -sS -X POST ${sh(`${s.registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema`)} \\
${hJsonAuthSub()}
  -d @schema.json`;
      return {
        title: "Registry — create schema",
        summary: "POST /registry/v1/schema",
        curl,
        go: `digit.CreateRegistrySchema(serverURL, jwtToken, tenantID, clientID, schemaCode, definition map)`,
        java: `// Registry via Go/CLI in this repo — Java client may differ; align with registry OpenAPI`,
        sdkNote,
      };
    }

    case "registry_schema_get": {
      const sc = encodeURIComponent(String(x.schemaCode ?? "complaints.case"));
      const curl = `curl -sS ${sh(`${s.registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema/${sc}`)} \\
${hGetAuthSub()}`;
      return {
        title: "Registry — get schema",
        summary: "GET /registry/v1/schema/{schemaCode}",
        curl,
        go: `digit.SearchRegistrySchema(serverURL, jwtToken, tenantID, clientID, schemaCode, version)`,
        sdkNote,
      };
    }

    case "registry_data": {
      const sc = String(x.schemaCode ?? "complaints.case");
      const curl = `curl -sS -X POST ${sh(`${s.registryBaseUrl.replace(/\/$/, "")}/registry/v1/schema/${encodeURIComponent(sc)}/data`)} \\
${hJsonAuthSub()}
  -d '{"data":{ ... }}'`;
      return {
        title: "Registry — create data row",
        summary: `POST /registry/v1/schema/${sc}/data`,
        curl,
        go: `digit.CreateRegistryData(serverURL, jwtToken, tenantID, clientID, schemaCode, data map)`,
        sdkNote,
      };
    }

    case "idgen_template_search": {
      const tc = String(x.templateCode ?? "registryId");
      const curl = `curl -sS -G ${sh(`${s.idgenBaseUrl.replace(/\/$/, "")}/idgen/v1/template`)} \\
  --data-urlencode ${sh(`templateCode=${tc}`)} \\
${hGetAuthC64()}`;
      return {
        title: "IdGen — search template",
        summary: "GET /idgen/v1/template?templateCode=",
        curl,
        go: `digit.SearchIdGenTemplate(serverURL, jwtToken, clientID, tenantID, templateCode)`,
        java: `// IdGenClient template search if exposed`,
        sdkNote,
      };
    }

    case "idgen_template_create":
    case "idgen_template_update": {
      const method = id === "idgen_template_update" ? "PUT" : "POST";
      const tc = String(x.templateCode ?? "registryId");
      const curl = `curl -sS -X ${method} ${sh(`${s.idgenBaseUrl.replace(/\/$/, "")}/idgen/v1/template`)} \\
${hJsonAuthC64()}
  -d ${sh(
        JSON.stringify({
          templateCode: tc,
          config: {
            template: "{ORG}-{DATE:yyyyMMdd}-{SEQ}-{RAND}",
            sequence: { scope: "daily", start: 1, padding: { length: 4, char: "0" } },
            random: { length: 2, charset: "A-Z0-9" },
          },
        })
      )}`;
      return {
        title: `IdGen — ${method === "PUT" ? "update template (new version)" : "create template"}`,
        summary: `${method} /idgen/v1/template`,
        curl,
        go: `digit.CreateIdGenTemplate(...) // PUT may need raw resty in Go client`,
        java: `// IdGen template CRUD if present in Java client`,
        sdkNote,
      };
    }

    case "idgen_generate": {
      const tc = String(x.templateCode ?? "registryId");
      const org = String(x.org ?? "REGISTRY");
      const curl = `curl -sS -X POST ${sh(`${s.idgenBaseUrl.replace(/\/$/, "")}/idgen/v1/generate`)} \\
${hJsonAuthC64()}
  -d ${sh(JSON.stringify({ templateCode: tc, variables: { ORG: org } }))}`;
      return {
        title: "IdGen — generate ID",
        summary: "POST /idgen/v1/generate",
        curl,
        java: `idGenClient.generateId(${JSON.stringify(tc)}, Map.of("ORG", ${JSON.stringify(org)}));`,
        go: `// POST JSON in Go — or add wrapper; Java IdGenClient.generateId documented`,
        sdkNote,
      };
    }

    case "mdms_schema": {
      const curl = `# Body wraps SchemaDefinition — console builds from YAML. See server /api/mdms/schema
curl -sS -X POST ${sh(`${s.mdmsBaseUrl.replace(/\/$/, "")}/mdms-v2/v1/schema`)} \\
${hJsonAuthC64()}
  -d @mdms-schema.json`;
      return {
        title: "MDMS — create schema",
        summary: "POST /mdms-v2/v1/schema",
        curl,
        go: `digit.CreateSchema(...) // see mdms.go`,
        sdkNote,
      };
    }

    case "mdms_schema_get": {
      const code = String(x.schemaCode ?? "complaint.types");
      const curl = `curl -sS -G ${sh(`${s.mdmsBaseUrl.replace(/\/$/, "")}/mdms-v2/v1/schema`)} \\
  --data-urlencode ${sh(`code=${code}`)} \\
${hGetAuthC64()}`;
      return {
        title: "MDMS — get schema",
        summary: "GET /mdms-v2/v1/schema?code=",
        curl,
        go: `digit.SearchSchema(serverURL, jwtToken, tenantID, clientID, schemaCode)`,
        sdkNote,
      };
    }

    case "mdms_data": {
      const curl = `curl -sS -X POST ${sh(`${s.mdmsBaseUrl.replace(/\/$/, "")}/mdms-v2/v2`)} \\
${hJsonAuthC64()}
  -d '{"Mdms":[{...}]}'`;
      return {
        title: "MDMS — upsert data",
        summary: "POST /mdms-v2/v2 — body { Mdms: [...] }",
        curl,
        go: `digit.CreateMdmsData(serverURL, jwtToken, tenantID, clientID, mdmsData string)`,
        sdkNote,
      };
    }

    case "workflow_deploy": {
      const curl = `# Composite: POST /workflow/v1/process, then POST .../process/{id}/state per state,
# then POST .../state/{stateId}/action per action. No Authorization header (use X-Client-ID only).
# See provision-console server index.mjs /api/workflow/deploy for exact sequence.
curl -sS -X POST ${sh(`${s.workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/process`)} \\
${hWorkflowJson()}
  -d '{"name":"...","code":"PGR67","description":"...","version":"1.0","sla":86400}'`;
      return {
        title: "Workflow — deploy (composite)",
        summary: "Same as digit create-workflow: process → states → actions. Headers without Bearer.",
        curl,
        go: `digit.CreateProcess, CreateState, CreateAction — or digit-cli create-workflow`,
        java: `// Typically not one Java call — mirror Go sequence`,
        sdkNote,
      };
    }

    case "workflow_process_by_code": {
      const c = String(x.wfCode ?? "PGR67");
      const curl = `curl -sS -G ${sh(`${s.workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/process`)} \\
  --data-urlencode ${sh(`code=${c}`)} \\
${hWorkflowPlain()}`;
      return {
        title: "Workflow — get process by code",
        summary: "GET /workflow/v1/process?code= — returns array with process id (UUID).",
        curl,
        java: `// WorkflowClient — getProcessByCode style; see WorkflowClient.java`,
        sdkNote,
      };
    }

    case "workflow_transition": {
      const curl = `curl -sS -X POST ${sh(`${s.workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/transition`)} \\
${hWorkflowJson()}
  -d '{"processId":"UUID","entityId":"CASE-1","action":"APPLY","comment":"Submit","init":true,"attributes":{"roles":["CITIZEN"]}}'`;
      return {
        title: "Workflow — execute transition",
        summary: "POST /workflow/v1/transition — no Authorization in local console (audit from X-Client-ID).",
        curl,
        go: `// Use HTTP client — Java has WorkflowClient.executeTransition`,
        java: `workflowClient.executeTransition(WorkflowTransitionRequest.builder()...build());`,
        sdkNote,
      };
    }

    case "workflow_transition_history": {
      const eid = encodeURIComponent(String(x.histEntity ?? "ENTITY_ID"));
      const pid = encodeURIComponent(String(x.histProcess ?? "PROCESS_UUID"));
      const h = x.histFull !== false ? "&history=true" : "";
      const curl = `curl -sS ${sh(`${s.workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/transition?entityId=${eid}&processId=${pid}${h}`)} \\
${hWorkflowPlain()}`;
      return {
        title: "Workflow — transition history (audit)",
        summary: "GET /workflow/v1/transition?entityId=&processId=&history=true",
        curl,
        java: `// Often direct RestTemplate GET — not always wrapped`,
        sdkNote,
      };
    }

    case "filestore_category": {
      const curl = `curl -sS -X POST ${sh(`${s.filestoreBaseUrl.replace(/\/$/, "")}/filestore/v1/files/document-categories`)} \\
${hJsonAuthSub()}
  -d '{"type":"ComplaintEvidence","code":"COMPLAINT_ATTACHMENT","allowedFormats":["pdf","png"],...}'`;
      return {
        title: "Filestore — document category",
        summary: "POST /filestore/v1/files/document-categories",
        curl,
        go: `digit.CreateDocumentCategory(serverURL, jwtToken, tenantID, ...)`,
        sdkNote,
      };
    }

    case "notification_template": {
      const curl = `curl -sS -X POST ${sh(`${s.notificationBaseUrl.replace(/\/$/, "")}/notification/v1/template`)} \\
  -H 'Content-Type: application/json' \\
  -H ${sh(`X-Tenant-ID: ${realm}`)} \\
  -H ${sh(`X-Client-ID: ${sub64}`)} \\
  -d '{"templateId":"...","version":"1.0","type":"EMAIL","subject":"...","content":"...","isHTML":false}'`;
      return {
        title: "Notification — create template",
        summary:
          "POST /notification/v1/template — provision proxy omits Bearer so egovio uses truncated X-Client-ID (VARCHAR(64) audit).",
        curl,
        go: `digit.CreateTemplate(...) // Go client still sends Bearer only; add X-Client-ID (first 64 of sub) if you hit SQLSTATE 22001`,
        sdkNote,
      };
    }

    case "keycloak_role": {
      const rn = String(x.roleName ?? "GRO");
      const rd = String(x.roleDescription ?? rn);
      const curl = `curl -sS -X POST ${sh(`${s.keycloakOrigin.replace(/\/$/, "")}/keycloak/admin/realms/${encodeURIComponent(realm)}/roles`)} \\
  -H "Content-Type: application/json" \\
  -H ${sh(`Authorization: Bearer ${bearer}`)} \\
  -d ${sh(JSON.stringify({ name: rn, description: rd }))}`;
      return {
        title: "Keycloak admin — create realm role",
        summary: "POST .../admin/realms/{realm}/roles — needs admin JWT.",
        curl,
        go: `digit.CreateRole(serverURL, jwtToken, realm, roleName, description)`,
        sdkNote: `${sdkNote} Keycloak Admin API, not DIGIT.`,
      };
    }

    case "keycloak_user": {
      const un = String(x.username ?? "gro1");
      const em = String(x.email ?? "gro1@example.gov");
      const pw = String(x.password ?? "ChangeMe!");
      const curl = `curl -sS -X POST ${sh(`${s.keycloakOrigin.replace(/\/$/, "")}/keycloak/admin/realms/${encodeURIComponent(realm)}/users`)} \\
  -H "Content-Type: application/json" \\
  -H ${sh(`Authorization: Bearer ${bearer}`)} \\
  -d ${sh(
        JSON.stringify({
          username: un,
          email: em,
          enabled: true,
          credentials: [{ type: "password", value: pw, temporary: false }],
        })
      )}`;
      return {
        title: "Keycloak admin — create user",
        summary: "POST .../admin/realms/{realm}/users",
        curl,
        go: `digit.CreateUser(serverURL, jwtToken, realm, username, password, email)`,
        sdkNote,
      };
    }

    case "keycloak_assign_role": {
      const curl = `# Lookup user id + role id, then POST .../users/{id}/role-mappings/realm
# See provision-console server /api/keycloak/assign-role implementation`;
      return {
        title: "Keycloak admin — assign realm role",
        summary: "Composite: GET users, GET role, POST role-mappings/realm",
        curl,
        go: `digit.AssignRoleToUser(...) // see user.go`,
        sdkNote,
      };
    }

    case "health_checks": {
      const curl = `# Filestore
curl -sS ${sh(`${s.filestoreBaseUrl.replace(/\/$/, "")}/filestore/health`)}

# Workflow (expect 400 if up without tenant)
curl -sS ${sh(`${s.workflowBaseUrl.replace(/\/$/, "")}/workflow/v1/process`)}

# IdGen liveness (no auth; digit-local idgen image from digit3/src/services/idgen)
curl -sS ${sh(`${s.idgenBaseUrl.replace(/\/$/, "")}/idgen/health`)}

# Registry up (any HTTP response without connection error; 404 on / is OK)
curl -sS -o /dev/null -w "%{http_code}" ${sh(`${s.registryBaseUrl.replace(/\/$/, "")}/`)}

# Boundary (with JWT)
curl -sS -G ${sh(`${s.boundaryBaseUrl.replace(/\/$/, "")}/boundary/v1`)} \\
  --data-urlencode ${sh("codes=WARD-001")} \\
${hGetAuthC64()}`;
      return {
        title: "Smoke — health / liveness checks",
        summary: "Various GETs used in Phase K.",
        curl,
        sdkNote,
      };
    }

    default:
      return {
        title: "API",
        summary: "Unknown action",
        curl: "# (no snippet)",
        sdkNote,
      };
  }
}
