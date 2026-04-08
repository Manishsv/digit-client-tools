import { useMemo, useState, type ReactNode } from "react";
import { defaultSettings, LOCAL_DEMO_OAUTH, type ServiceSettings } from "./configDefaults";
import {
  OverviewPanel,
  Phase0Panel,
  PhaseAPanel,
  PhaseBPanel,
  PhaseResumePanel,
  PhaseCPanel,
  PhaseDPanel,
  PhaseEPanel,
  PhaseFPanel,
  PhaseGPanel,
  PhaseHPanel,
  PhaseIPanel,
  PhaseJPanel,
  PhaseKPanel,
} from "./phasePanels";

const TABS: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "0", label: "0 · Prerequisites" },
  { id: "A", label: "A · Account" },
  { id: "B", label: "B · Keycloak / JWT" },
  { id: "R", label: "R · Resume / inspect" },
  { id: "C", label: "C · Boundaries" },
  { id: "D", label: "D · Core registry + IdGen" },
  { id: "E", label: "E · Complaints schema" },
  { id: "F", label: "F · MDMS" },
  { id: "G", label: "G · Workflow" },
  { id: "H", label: "H · Filestore + notify" },
  { id: "I", label: "I · Roles + users" },
  { id: "J", label: "J · Run case" },
  { id: "K", label: "K · Smoke checks" },
];

function SettingsColumn({
  s,
  setS,
}: {
  s: ServiceSettings;
  setS: React.Dispatch<React.SetStateAction<ServiceSettings>>;
}) {
  const jwtPreview = useMemo(() => {
    if (!s.jwt) return "—";
    return `${s.jwt.slice(0, 24)}… (${s.jwt.length} chars)`;
  }, [s.jwt]);

  const row = (key: keyof ServiceSettings, label: string, password = false) => (
    <div className="field" key={key}>
      <label>{label}</label>
      <input
        type={password ? "password" : "text"}
        value={s[key]}
        onChange={(e) => setS((prev) => ({ ...prev, [key]: e.target.value }))}
        autoComplete="off"
      />
    </div>
  );

  return (
    <aside className="settings-panel">
      <h2>Connection</h2>
      {row("accountBaseUrl", "Account base URL")}
      {row("accountClientId", "Account X-Client-Id")}
      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.75rem 0" }} />
      {row("keycloakOrigin", "Keycloak origin")}
      {row("realm", "Realm (tenant code)")}
      {row("oauthClientId", "OAuth client id")}
      {row("oauthSecret", "OAuth client secret", true)}
      {row("oauthUsername", "OAuth username")}
      {row("oauthPassword", "OAuth password", true)}
      <div className="btn-row" style={{ marginTop: "0.35rem" }}>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setS((prev) => ({
              ...prev,
              oauthClientId: LOCAL_DEMO_OAUTH.clientId,
              oauthSecret: LOCAL_DEMO_OAUTH.clientSecret,
              oauthUsername: LOCAL_DEMO_OAUTH.username,
              oauthPassword: LOCAL_DEMO_OAUTH.password,
            }))
          }
        >
          Reset local demo OAuth
        </button>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
        Default: <code>auth-server</code> / <code>changeme</code> / <code>default</code> (see digit3 <code>run-full-provision.sh</code>).
      </p>
      <div className="field">
        <label>JWT (paste or fetch in Phase B)</label>
        <textarea value={s.jwt} onChange={(e) => setS((prev) => ({ ...prev, jwt: e.target.value }))} rows={3} spellCheck={false} />
        <div className="jwt-banner">Active: {jwtPreview}</div>
      </div>
      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.75rem 0" }} />
      {row("boundaryBaseUrl", "Boundary")}
      {row("registryBaseUrl", "Registry")}
      {row("mdmsBaseUrl", "MDMS")}
      {row("workflowBaseUrl", "Workflow")}
      {row("filestoreBaseUrl", "Filestore")}
      {row("idgenBaseUrl", "IdGen")}
      {row("notificationBaseUrl", "Notification")}
    </aside>
  );
}

export default function App() {
  const [s, setS] = useState<ServiceSettings>(() => ({ ...defaultSettings }));
  const [tab, setTab] = useState("overview");

  let panel: ReactNode = null;
  switch (tab) {
    case "overview":
      panel = <OverviewPanel />;
      break;
    case "0":
      panel = <Phase0Panel />;
      break;
    case "A":
      panel = <PhaseAPanel s={s} setS={setS} />;
      break;
    case "B":
      panel = <PhaseBPanel s={s} setS={setS} />;
      break;
    case "R":
      panel = <PhaseResumePanel s={s} setS={setS} />;
      break;
    case "C":
      panel = <PhaseCPanel s={s} />;
      break;
    case "D":
      panel = <PhaseDPanel s={s} />;
      break;
    case "E":
      panel = <PhaseEPanel s={s} />;
      break;
    case "F":
      panel = <PhaseFPanel s={s} />;
      break;
    case "G":
      panel = <PhaseGPanel s={s} />;
      break;
    case "H":
      panel = <PhaseHPanel s={s} />;
      break;
    case "I":
      panel = <PhaseIPanel s={s} />;
      break;
    case "J":
      panel = <PhaseJPanel s={s} />;
      break;
    case "K":
      panel = <PhaseKPanel s={s} />;
      break;
    default:
      panel = null;
  }

  return (
    <>
      <header className="app-header">
        <h1>DIGIT provision console</h1>
        <p>
          Tabbed operator UI aligned with <code>docs/SETUP-RUNBOOK-COMPLAINTS-WORKFLOW.md</code>. Runs a local API (<code>server/index.mjs</code>) that proxies to your stack — keep it on localhost.
        </p>
      </header>
      <div className="layout">
        <SettingsColumn s={s} setS={setS} />
        <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <nav className="tabs" aria-label="Phases">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {panel}
        </main>
      </div>
    </>
  );
}
