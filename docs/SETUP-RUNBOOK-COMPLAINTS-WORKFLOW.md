# Runbook: tenant, boundaries, complaints registry, workflow, MDMS, notifications, and multi-user testing

This is an **ordered checklist** for standing up a **complaints-style service** on local DIGIT core: **account + administrative boundaries**, **registry** (`complaints.case`), **master data** (complaint types in MDMS), **maker–checker style workflow** (staff tiers), **notifications**, **Keycloak roles/users**, then **exercising the flow with different logins**.

It aligns with **`digit3/deploy/local/provision/`** scripts and **`digit-cli`**; operation names and gaps are summarized in [DIGIT-CLIENT-OPERATIONS.md](./DIGIT-CLIENT-OPERATIONS.md). Deeper YAML/HTTP reference: **`digit3/docs/tutorials/Building-a-Public-Service-on-DIGIT.md`**.

---

## 0. Prerequisites

- **Optional UI:** tabbed operator app at **`digit-client-tools/provision-console`** (`npm install && npm run dev`) — same phase flow with forms and a local API proxy; see its `README.md`.
- **`digit3`** repo: `deploy/local` stack running (`docker compose up -d`).
- **`digit-client-tools`**: `digit` CLI on `PATH` (or use `provision_run_digit` / `go run` as in `_common.sh`).
- Tools: **`jq`**, **`curl`**, **`python3`** (JWT `sub` extraction for registry headers).
- Copy **`digit3/deploy/local/provision/env.example`** → **`env.provision`** and fill variables as you go.

---

## Phase A — Account (tenant record)

1. Set **`ACCOUNT_BASE_URL`**, **`ACCOUNT_X_CLIENT_ID`** (e.g. `test-client`), **`TENANT_NAME`**, **`TENANT_EMAIL`**, optional **`TENANT_CODE`**.
2. Run **`./account-setup.sh`** (tenant only if Keycloak is not ready).

   - Account API: **`POST /account/v1`** with **`X-Client-Id`** — **no JWT**.

3. From the response, set **`KEYCLOAK_REALM`** to the tenant **code** (realm name) in **`env.provision`**.

---

## Phase B — Keycloak (identity for all later steps)

Without a realm client and users, you cannot obtain **`OAUTH_*`** JWTs used by boundaries, registry, MDMS, workflow, etc.

1. In Keycloak admin, for realm **`KEYCLOAK_REALM`**:
   - Create (or reuse) a **confidential** OAuth client; note **`OAUTH_CLIENT_ID`** / **`OAUTH_CLIENT_SECRET`**.
   - Enable **direct access grants** if you use password grant from scripts.
   - Create a **bootstrap admin** user (or service account) that can call Keycloak Admin API via the **`digit`** CLI (`create-role`, `create-user`, …).

2. Set in **`env.provision`**:

   - **`KEYCLOAK_ORIGIN`** (e.g. `http://localhost:8080`)
   - **`OAUTH_CLIENT_ID`**, **`OAUTH_CLIENT_SECRET`**, **`OAUTH_USERNAME`**, **`OAUTH_PASSWORD`**

3. Run **`./account-setup.sh --platform-only`** to load **boundaries**, **core registry schema**, and **`registryId`** idgen template (requires valid **`OAUTH_*`** + realm).

---

## Phase C — Administrative hierarchy (Boundary)

**Goal:** Jurisdictions your app and registry rows can reference (e.g. `boundaryCode`).

1. **Default path:** `digit-cli` **`example-boundaries.yaml`**, applied by **`account-setup.sh --platform-only`** via **`create-boundaries`**.

2. **Customize:** set **`CORE_BOUNDARIES_FILE`** (or **`BOUNDARIES_FILE`**) to your YAML, then re-run **`./account-setup.sh --platform-only`** (or run **`digit create-boundaries --file …`** manually with **`BOUNDARY_BASE_URL`** + JWT).

3. **Verify:** search boundaries with a client that sets **`X-Tenant-ID`** = realm code and **`Authorization: Bearer`**. **`service-test.sh`** includes a shallow boundary check.

---

## Phase D — Platform registry + IDs

Already part of **`--platform-only`**:

- **Core registry schema** — default **`provision/examples/core-registry-schema.yaml`** (override with **`CORE_REGISTRY_SCHEMA_FILE`**).
- **IdGen** — **`create-idgen-template --default --template-code registryId`** so registry rows can get business IDs.

---

## Phase E — Complaints registry schema

**Goal:** JSON Schema **`complaints.case`** for case payloads.

1. Default file: **`digit3/deploy/local/provision/examples/case-registry-schema.yaml`** (`schemaCode: complaints.case`).

2. **`./service-setup.sh`** runs **`digit create-registry-schema`** against **`REGISTRY_BASE_URL`** when that file exists (override with **`CASE_REGISTRY_SCHEMA_FILE`**).

3. Extend **`definition.properties`** if your app needs more fields (workflow codes, SLA, nested objects)—keep **`required`** consistent with your app and **`create-registry-data`** payloads.

---

## Phase F — Master data (MDMS): complaint types and related masters

**Goal:** Dropdowns / validation lists (e.g. complaint type codes) served from MDMS.

1. **Schema:** author **`MDMS_SCHEMA_FILE`** (YAML for **`digit create-schema`**) — e.g. start from **`digit-cli/example-schema.yaml`** and add a schema for **`complaint.types`** (or your naming convention).

2. **Data:** author **`MDMS_DATA_FILE`** with rows referencing that **`schemaCode`** and **`uniqueIdentifier`** values your UI and registry will use (pattern matches **`digit-cli/example-mdms-data.yaml`**).

3. Run **`./service-setup.sh`** (or **`digit create-schema` / `create-mdms-data`** manually with **`MDMS_BASE_URL`** + JWT).

4. **Runtime check:** Java **`MdmsClient.searchMdmsData`** / **`isMdmsDataValid`** (or REST) with **`schemaCode`** + identifiers.

---

## Phase G — Workflow (simple maker–checker style)

**Concept:** Citizen (or front desk) **submits**; **first staff role** **assigns / triages**; **second staff role** **resolves**—matching a light **maker / checker** split. The stock **`digit-cli/example-workflow.yaml`** implements this pattern with process code **`PGR67`**:

| Step | Action | Role(s) in example |
|------|--------|--------------------|
| Submit | `APPLY` | `CITIZEN`, `CSR` |
| Assign to line staff | `ASSIGN` | `GRO` |
| Complete work | `RESOLVE` | `LME` |
| Closure / feedback | `RATE` / `REOPEN` | `CITIZEN`, `CSR` |

1. **Align Keycloak realm roles** with **`attributeValidation.attributes.roles`** on every action you will use. Mismatched role names → transition API rejects the call.

2. **Optional:** copy **`example-workflow.yaml`** to a new file, rename **`process.code`** (e.g. `COMPLAINTS_V1`), simplify **states/actions** to only the path you need (e.g. INIT → PENDING → RESOLVED → CLOSED), then set **`WORKFLOW_FILE`** and run **`./service-setup.sh`** or **`digit create-workflow --file …`**.

3. **Resolve process ID:** at runtime, **`WorkflowClient.getProcessByCode("PGR67")`** (Java) or **`GET /workflow/v1/process?code=…`**.

---

## Phase H — Filestore and notifications

**Filestore (attachments):**

- **`service-setup.sh`** creates a **document category** (e.g. **`COMPLAINT_ATTACHMENT`**) via **`digit create-document-category`**.

**Notifications:**

- Define templates your service will reference (email/SMS). Use **`digit create-notification-template`** against **`NOTIFICATION_BASE_URL`** (see **`env.example`**). Store **template id + version** in your app config or MDMS row.
- Sending at runtime uses the **notification service** APIs (Java **`NotificationClient`**) with those template identifiers.

---

## Phase I — Onboard users and roles

1. Set **`ONBOARDING_ROLES`** to the **exact** role strings used in workflow YAML (default script value: **`CITIZEN CSR GRO LME`**).

2. Run **`./onboarding.sh`** — creates roles via **`digit create-role`**.

3. Copy **`onboarding-users.example.csv`** → **`onboarding-users.csv`** (or set **`ONBOARDING_USERS_CSV`**). Columns: **`username,password,email,roles`** with roles **pipe-separated** (`GRO|CSR`).

   Example personas:

   - **`citizen1`** — `CITIZEN`
   - **`csr1`** — `CSR`
   - **`gro1`** — `GRO`
   - **`lme1`** — `LME`

4. Re-run **`./onboarding.sh`** to **`create-user`** and **`assign-role`** for each row.

---

## Phase J — Initiate a case and complete it (multi-user)

Use **separate tokens** per user (`password` grant with same **`OAUTH_CLIENT_ID`** / secret). Every platform call should carry:

- **`Authorization: Bearer <access_token>`**
- **`X-Tenant-ID: <KEYCLOAK_REALM>`**
- **`X-Client-ID`**: registry expects Keycloak **`sub`** from the JWT (see **`service-test.sh`**); other services may accept a stable client id depending on environment—follow your stack’s gateway rules.

**Suggested sequence (aligned with `PGR67`):**

1. **Citizen (or CSR)**  
   - Obtain JWT for **`citizen1`** or **`csr1`**.  
   - Choose **`entityId`** (business case id) and optional **`boundaryCode`** from Phase C / MDMS.  
   - **`POST /workflow/v1/transition`**: action **`APPLY`**, **`init: true`** where required, **`attributes.roles`** including **`CITIZEN`** or **`CSR`** as in the workflow definition.  
   - **`POST`** registry **`…/registry/v1/schema/complaints.case/data`** with **`{"data":{…}}`** (include **`serviceRequestId`**, **`tenantId`**, **`serviceCode`**, **`boundaryCode`**, status fields—match your schema).

2. **GRO (maker / triage)**  
   - JWT for **`gro1`**.  
   - Transition **`ASSIGN`**: **`PENDINGFORASSIGNMENT` → `PENDINGATLME`** with **`attributes.roles`: `["GRO"]`**.

3. **LME (checker / resolver)**  
   - JWT for **`lme1`**.  
   - Transition **`RESOLVE`**: **`PENDINGATLME` → `RESOLVED`** with **`attributes.roles`: `["LME"]`**.

4. **Citizen / CSR (closure)**  
   - Transition **`RATE`** to terminal state if you use the example’s closure actions.

5. **Optional:** update the **registry** row’s **`applicationStatus`** / **`workflowInstanceId`** after each step so your app’s source of truth stays aligned with workflow.

**Automation reference:** `digit3/deploy/local/provision/service-test.sh` (smoke), and any **`create-complaint.sh`** / tutorial §5 examples for combined registry + workflow JSON.

---

## Phase K — Verification checklist

| Check | How |
|--------|-----|
| Tenant | Account API GET by code or UI |
| Boundaries | Boundary search by codes used in tests |
| Registry schema | `search-registry-schema` or GET per [operations doc](./DIGIT-CLIENT-OPERATIONS.md) |
| MDMS | `search-mdms-data` / `MdmsClient` |
| Workflow | `GET /workflow/v1/process?code=PGR67` (or your code) |
| Roles | Keycloak realm → Users → Role mappings |
| End-to-end | Same **`entityId`** progresses through states with **role-appropriate** JWTs only |

---

## Quick command order (scripts)

```bash
cd digit3/deploy/local/provision
cp env.example env.provision
# edit env.provision through Phases A–B

set -a && source env.provision && set +a
./account-setup.sh
# configure Keycloak; set KEYCLOAK_REALM, OAUTH_*

set -a && source env.provision && set +a
./account-setup.sh --platform-only
./service-setup.sh
./onboarding.sh
./service-test.sh
```

Then execute **Phase J** with your HTTP client or app using **per-user tokens**.
