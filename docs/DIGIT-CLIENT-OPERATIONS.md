# DIGIT client operations (extracted from code)

**Generated:** 2026-04-04  
**Purpose:** Inventory of services and operations implemented in the client tooling, with short descriptions and primary HTTP paths. This is derived from source under `digit-client-tools/` only; platform docs or services may expose additional APIs.

**Repositories / paths:**

- Java: `client-libraries/digit-java-client/src/main/java/com/digit/services/**`
- Go: `client-libraries/digit-go-client/digit/*.go`
- CLI: `digit-cli/cmd/*.go`

---

## Java client (`digit-java-client`)

Spring `*Client` classes call DIGIT service base URLs from `ApiProperties` (e.g. `getAccountServiceUrl()` + path below).

### Account — `AccountClient`

| Operation | HTTP (relative to account base) | Description |
|-----------|-----------------------------------|-------------|
| `createTenant` | `POST /account/v1` | Create a tenant. |
| `searchTenantByCode` | `GET /account/v1?code={code}` | Look up tenant by code. |
| `updateTenant` | `PUT /account/v1/{tenantId}` | Update tenant by ID. |
| `createTenantConfig` | `POST /account/v1/config` | Create tenant configuration. |
| `searchTenantConfigByCode` | `GET /account/v1/config?code={code}` | Look up tenant config by code. |
| `updateTenantConfig` | `PUT /account/v1/config/{configId}` | Update tenant config by ID. |

### Boundary — `BoundaryClient`

| Operation | HTTP | Description |
|-----------|------|-------------|
| `createBoundaries` | `POST /boundary/v1` | Create one or more boundaries. |
| `searchBoundariesByCodes` | `GET /boundary/v1?codes=...` | Search boundaries by code list. |
| `isValidBoundariesByCodes` | `GET /boundary/v1?codes=...` | Returns whether every requested code returned a row (count match). |
| `updateBoundary` | `PUT /boundary/v1/{boundaryId}` | Update a boundary. |
| `createBoundaryHierarchy` | `POST /boundary/v1/boundary-hierarchy-definition` | Create hierarchy definition. |
| `searchBoundaryHierarchy` | `GET /boundary/v1/boundary-hierarchy-definition?hierarchyType=...` | Fetch hierarchy by type. |
| `createBoundaryRelationship` | `POST /boundary/v1/boundary-relationships` | Create boundary relationship. |
| `searchBoundaryRelationships` | `GET /boundary/v1/boundary-relationships?hierarchyType=...&boundaryType=...&includeChildren=...` | List hierarchical relationships. |
| `updateBoundaryRelationship` | `PUT /boundary/v1/boundary-relationships/{relationshipId}` | Update a relationship. |

### Workflow — `WorkflowClient`

| Operation | HTTP | Description |
|-----------|------|-------------|
| `executeTransition` (overloads) | `POST /workflow/v1/transition` | Run a workflow action on an entity (full request or shorthand args). |
| `getProcessById` | `GET /workflow/v1/process/{processId}` | Load process definition by ID. |
| `getProcessByCode` | `GET /workflow/v1/process?code={code}` | Resolve process ID from code (first match). |

### MDMS — `MdmsClient`

| Operation | HTTP | Description |
|-----------|------|-------------|
| `isMdmsDataValid` | `GET /mdms-v2/v2` (query: `schemaCode`, repeated `uniqueIdentifiers`) | Returns whether MDMS rows exist for the identifiers. |
| `searchMdmsData` | Same as above | Returns MDMS records for the schema + identifiers. |

### ID generation — `IdGenClient`

| Operation | HTTP | Description |
|-----------|------|-------------|
| `generateId` (overloads) | `POST /idgen/v1/generate` | Generate an ID from a template (optional variable map). |

### File store — `FilestoreClient`

| Operation | HTTP | Description |
|-----------|------|-------------|
| `isFileAvailable` | `GET /filestore/v1/files/{fileId}?tenantId=...` | HEAD-style check via GET; returns boolean from success path. |
| `validateFileAvailability` | Same | Delegates to `isFileAvailable` (same URL). |

### Notification — `NotificationClient`

| Operation | HTTP | Description |
|-----------|------|-------------|
| `sendEmail` | `POST /notification/v1/email/send` | Send email (request object or template convenience overload). |
| `sendSMS` | `POST /notification/v1/sms/send` | Send SMS (request object or template convenience overload). |

### Individual — `IndividualClient`

| Operation | HTTP | Description |
|-----------|------|-------------|
| `createIndividual` | `POST /individual/v1` | Create an individual record. |
| `getIndividualById` | `GET /individual/v1/{individualId}` | Get by ID. |
| `searchIndividualsByName` | `GET /individual/v1?individualName=...&limit&offset` | Search by name with pagination. |
| `searchAllIndividuals` | Same with null name | List/search with pagination defaults. |
| `isIndividualExist` / `isIndividualExistsById` | `GET /individual/v1?individualId=...&limit&offset` | Treats non-zero `totalCount` as existence. |

**Not wrapped in Java (present in Go / CLI):** registry schema/data APIs, MDMS schema create, workflow process/state/action definition management, ID-gen template CRUD, document category create, Keycloak user/role admin, account-only `CreateAccount` helper in Go, etc.

---

## Go library (`digit-go-client/digit`)

Functions return raw JSON strings unless noted. Typical headers: `Authorization: Bearer`, `X-Tenant-ID`, `X-Client-ID` (exact header names vary slightly per file).

### Registry — `registry.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `CreateRegistrySchema` | `POST {base}/registry/v1/schema` | Create schema with `schemaCode` + `definition`. |
| `SearchRegistrySchema` | `GET {base}/registry/v1/schema/{schemaCode}` (+ optional `version`) | Fetch schema metadata. |
| `DeleteRegistrySchema` | `DELETE {base}/registry/v1/schema/{schemaCode}` | Delete schema. |
| `CreateRegistryData` | `POST {base}/registry/v1/schema/{schemaCode}/data` | Insert registry row under schema. |
| `SearchRegistryData` | `GET .../schema/{schemaCode}/data/_registry?registryId=...` | Fetch data by registry ID. |
| `DeleteRegistryData` | `DELETE .../schema/{schemaCode}/data/{registryId}` | Delete registry row. |

### Workflow definition — `workflow.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `CreateProcess` | `POST /workflow/v1/process` | Create workflow process (name, code, version, SLA, etc.). |
| `CreateState` | `POST /workflow/v1/process/{processID}/state` | Add state to process. |
| `CreateAction` | `POST /workflow/v1/state/{stateID}/action` | Add transition action on state. |
| `SearchProcessDefinition` | `GET /workflow/v1/process/definition?id={processID}` | Get full definition for process ID. |
| `DeleteProcess` | `DELETE /workflow/v1/process?code={code}` | Delete process by business code. |

### MDMS — `mdms.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `CreateSchema` | `POST /mdms-v2/v1/schema` | Create MDMS schema (`SchemaDefinition` wrapper in body). |
| `CreateMdmsData` | `POST /mdms-v2/v2` | Upsert MDMS data (JSON body). |
| `SearchSchema` | `GET /mdms-v2/v1/schema?code={schemaCode}` | Fetch schema by code. |
| `SearchMdmsData` | `GET /mdms-v2/v2?schemaCode=...&uniqueIdentifiers=...` | Query MDMS rows. |

### ID generation templates — `idgen.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `SearchIdGenTemplate` | `GET /idgen/v1/template?templateCode=...` | Fetch template config. |
| `CreateIdGenTemplate` | `POST /idgen/v1/template` | Create template with sequence/random config. |
| `DeleteIdGenTemplate` | `DELETE /idgen/v1/template?templateCode=...&version=...` | Delete template version. |

### File store — `filestore.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `CreateDocumentCategory` | `POST /filestore/v1/files/document-categories` | Define upload category (formats, size, sensitivity flags). |

### Boundary — `boundaries.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `CreateBoundaries` | `POST /boundary/v1` | Bulk create boundaries (`boundary` array in JSON). |

### Account — `account.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `CreateAccount` | `POST /account/v1` | Create account/tenant-style record (simpler payload than full Java models). |

### Auth — `auth.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `GetJWTToken` | `POST {server}/keycloak/realms/{realm}/protocol/openid-connect/token` | Resource-owner password grant; returns access token. |

### Keycloak admin (users / roles) — `user.go`

| Function | Typical calls | Description |
|----------|----------------|-------------|
| `CreateUser` | `POST .../keycloak/admin/realms/{realm}/users` | Create user with password. |
| `ResetPassword` | `GET` users → `PUT .../users/{id}/reset-password` | Set new password by username lookup. |
| `DeleteUser` | `GET` users → `DELETE .../users/{id}` | Delete by username. |
| `SearchUser` | `GET .../keycloak/admin/realms/{realm}/users` (query) | Search/list users. |
| `UpdateUser` | `GET` user → `PUT .../users/{id}` | Update profile fields / enabled flag. |
| `CreateRole` | `POST .../keycloak/admin/realms/{realm}/roles` | Create realm role. |
| `AssignRoleToUser` | Resolve user + role → `POST .../users/{id}/role-mappings/realm` | Assign realm role to user. |

### Notification templates — `template.go`

| Function | Method + path | Description |
|----------|---------------|-------------|
| `CreateTemplate` | `POST /notification/v1/template` | Create notification template (email/SMS metadata + body). |
| `SearchNotificationTemplate` | `GET /notification/v1/template` (query params) | Look up template. |
| `DeleteNotificationTemplate` | `DELETE /notification/v1/template` (query params) | Delete template version. |

---

## CLI (`digit-cli`)

Subcommands are Cobra commands; most mirror the Go `digit` package (same APIs). Paths below are the command names after the `digit` binary.

| Command | Description |
|---------|-------------|
| `config` | Config namespace. |
| `config set` | Persist settings (e.g. server, JWT). |
| `config show` | Show current config. |
| `config get-contexts` | List named contexts. |
| `config use-context` | Switch active context. |
| `create-account` | Calls Go `CreateAccount`. |
| `create-boundaries` | Calls Go `CreateBoundaries`. |
| `create-registry-schema` | Registry schema create. |
| `search-registry-schema` | Registry schema get. |
| `delete-registry-schema` | Registry schema delete. |
| `create-registry-data` | Registry data create. |
| `search-registry-data` | Registry data search. |
| `delete-registry-data` | Registry data delete. |
| `create-schema` | MDMS schema create. |
| `create-mdms-data` | MDMS data create. |
| `search-schema` | MDMS schema search. |
| `search-mdms-data` | MDMS data search. |
| `create-process` | Workflow process create. |
| `search-process-definition` | Workflow definition by process ID. |
| `delete-process` | Workflow process delete by code. |
| `create-workflow` | **Composite:** parses YAML (or built-in default), then `CreateProcess`, `CreateState`, `CreateAction` in sequence. |
| `create-idgen-template` | ID-gen template create. |
| `search-idgen-template` | ID-gen template get. |
| `delete-idgen-template` | ID-gen template delete. |
| `create-notification-template` | Notification template create. |
| `search-notification-template` | Notification template search. |
| `delete-notification-template` | Notification template delete. |
| `create-document-category` | Filestore document category create. |
| `create-user` | Keycloak user create. |
| `reset-password` | Keycloak password reset. |
| `delete-user` | Keycloak user delete. |
| `search-user` | Keycloak user search. |
| `update-user` | Keycloak user update. |
| `create-role` | Keycloak realm role create. |
| `assign-role` | Assign realm role to user. |

---

## Regenerating or verifying

To refresh this list, search for public methods in `*Client.java`, exported `func` in `digit/*.go`, and `Use:` in `digit-cli/cmd/*.go`, and cross-check URL strings in those same files.
