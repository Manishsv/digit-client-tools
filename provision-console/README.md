# DIGIT provision console

Operator UI with **one tab per phase** from [`../docs/SETUP-RUNBOOK-COMPLAINTS-WORKFLOW.md`](../docs/SETUP-RUNBOOK-COMPLAINTS-WORKFLOW.md). A small **Express** server (`server/index.mjs`) proxies API calls so the browser is not blocked by CORS and secrets stay off shared machines if you run this only on localhost.

## Local demo OAuth

On first load, **Connection** is pre-filled to match digit3 local provision defaults (`run-full-provision.sh`): client **`auth-server`**, secret **`changeme`**, password **`default`**, username **`admin@demo.gov`** (aligned with Phase A’s default tenant email). **Phase A** overwrites **Realm** and **OAuth username** with the created tenant. Use **Reset local demo OAuth** if you cleared the fields.

If **Get access token** still fails, Keycloak may not have created the realm/client yet (Account-only tenant creation does not always sync Keycloak). Use full stack provision or Keycloak Admin.

**Boundaries:** apply boundary Flyway migration **`V20260404120000__extend_boundary_v1_varchar.sql`** in `digit3` (rebuild/restart the boundary DB migrate job + API). The handler also **truncates `X-Client-Id` to 64** so long JWT `sub` values do not overflow legacy audit columns.

## Run (development)

Needs **Node 18+** and **npm**.

```bash
cd provision-console
npm install
npm run dev
```

`dev` runs **`free-api-port`** first so a leftover API on **3847** (e.g. from an earlier `node server/index.mjs`) does not cause `EADDRINUSE`. To free the port only: `npm run free-api-port`.

- UI: [http://127.0.0.1:5177](http://127.0.0.1:5177) (Vite proxies `/api` → `127.0.0.1:3847`)
- API: `http://127.0.0.1:3847` (override with `PROVISION_CONSOLE_API_PORT`)

## Production build

```bash
npm run build
NODE_ENV=production node server/index.mjs
```

The server serves `dist/` and API on port **3847** by default.

## Security

This app is an **admin-style** tool: it forwards **Bearer tokens** and can create tenants, schemas, and users. Do not expose the API to the internet without authentication and TLS.
