import { useMemo, useState } from "react";
import type { ServiceSettings } from "./configDefaults";
import {
  type DemoRole,
  decideCase,
  fetchTimeline,
  fileAppeal,
  issueOrder,
  publishRuleset,
  recomputeDecision,
  resolveEntity,
  createLink,
} from "./govApi";

const DEFAULT_RULES_YAML = `ruleset:
  code: SBL_LICENSE
  version: "1.0.0"
inputs: {}
rules:
  - id: missingFireNoc
    predicate: eq
    args: { path: "facts.fireNocId", value: "" }
    outcome: { status: "REJECTED", code: "MISSING_FIRE_NOC" }
    reason: "Fire NOC missing"
  - id: hasFireNoc
    predicate: present
    args: { path: "facts.fireNocId" }
    outcome: { status: "APPROVED" }
    reason: "Fire NOC present"
`;

type IdsState = {
  applicantCanonicalId: string;
  caseCanonicalId: string;
  decisionId: string;
  receiptId: string;
  appealId: string;
  orderId: string;
};

const DEFAULT_IDS: IdsState = {
  applicantCanonicalId: "",
  caseCanonicalId: "",
  decisionId: "",
  receiptId: "",
  appealId: "",
  orderId: "",
};

function pretty(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function GovernanceDemoPanel({
  s,
  setS,
}: {
  s: ServiceSettings;
  setS: React.Dispatch<React.SetStateAction<ServiceSettings>>;
}) {
  const [role, setRole] = useState<DemoRole>("applicant");
  const [tenantId, setTenantId] = useState("COORDINATION");
  const [jwt, setJwt] = useState("dev-local");

  const [rulesYaml, setRulesYaml] = useState(DEFAULT_RULES_YAML);
  const [factsDraft, setFactsDraft] = useState(`{\n  \"facts\": {\n    \"fireNocId\": \"\"\n  }\n}`);
  const [factsApplied, setFactsApplied] = useState<{ facts: { fireNocId: string } }>({ facts: { fireNocId: "" } });

  const [applicantLocalId, setApplicantLocalId] = useState("A-1");
  const [caseLocalId, setCaseLocalId] = useState("SBL-REQ-1");

  const [ids, setIds] = useState<IdsState>(DEFAULT_IDS);

  const [corrId, setCorrId] = useState("corr-sbl-0001");
  const [reqId, setReqId] = useState("req-sbl-0001");

  const [out, setOut] = useState<{ ok: boolean; text: string }>({ ok: true, text: "—" });

  const authOk = useMemo(() => Boolean(jwt.trim()) && Boolean(tenantId.trim()), [jwt, tenantId]);

  const parsedFactsDraft = useMemo(() => {
    try {
      return JSON.parse(factsDraft) as unknown;
    } catch {
      return null;
    }
  }, [factsDraft]);

  const explainRole = useMemo(() => {
    switch (role) {
      case "regulator":
        return "Publishes rulesets (policy → structured rules).";
      case "registrar":
        return "Maintains authoritative facts (for demo we edit the facts snapshot).";
      case "applicant":
        return "Creates applicant/case IDs and requests a governed decision.";
      case "appeals":
        return "Files appeals, issues orders, triggers recomputation.";
      case "auditor":
        return "Fetches timeline/trace to reconstruct decisions.";
      default:
        return "";
    }
  }, [role]);

  const setOutFrom = (r: { ok: boolean; status: number; text: string; json?: unknown }) => {
    setOut({ ok: r.ok, text: r.text || `HTTP ${r.status}` });
  };

  const clickPublishRuleset = async () => {
    setOut({ ok: true, text: "…" });
    const r = await publishRuleset(s, "regulator", tenantId, jwt, rulesYaml);
    setOutFrom(r);
  };

  const clickResolveApplicant = async () => {
    setOut({ ok: true, text: "…" });
    const r = await resolveEntity(s, "applicant", tenantId, jwt, {
      entityType: "Applicant",
      sourceSystem: "SBL_PORTAL",
      localId: applicantLocalId,
    });
    setOutFrom(r);
    const j = r.json as any;
    if (r.ok && j?.canonicalId) setIds((p) => ({ ...p, applicantCanonicalId: String(j.canonicalId) }));
  };

  const clickResolveCase = async () => {
    setOut({ ok: true, text: "…" });
    const r = await resolveEntity(s, "applicant", tenantId, jwt, {
      entityType: "Case",
      sourceSystem: "SBL_DOMAIN",
      localId: caseLocalId,
    });
    setOutFrom(r);
    const j = r.json as any;
    if (r.ok && j?.canonicalId) setIds((p) => ({ ...p, caseCanonicalId: String(j.canonicalId) }));
  };

  const clickLink = async () => {
    setOut({ ok: true, text: "…" });
    const r = await createLink(s, "applicant", tenantId, jwt, {
      fromEntityType: "Applicant",
      fromCanonicalId: ids.applicantCanonicalId,
      relationType: "APPLICANT_TO_CASE",
      toEntityType: "Case",
      toCanonicalId: ids.caseCanonicalId,
      sourceSystem: "SBL_DOMAIN",
      status: "ACTIVE",
      confidence: 1.0,
    });
    setOutFrom(r);
  };

  const clickDecide = async () => {
    setOut({ ok: true, text: "…" });
    const r = await decideCase(s, "applicant", tenantId, jwt, ids.caseCanonicalId, {
      correlationId: corrId,
      requestId: reqId,
      applicantCanonicalId: ids.applicantCanonicalId || undefined,
      rulesetId: "SBL_LICENSE",
      rulesetVersion: "1.0.0",
      factsSnapshot: { rulesYaml, ...(factsApplied as any) },
    });
    setOutFrom(r);
    const j = r.json as any;
    if (r.ok && j?.decisionId && j?.receiptId) {
      setIds((p) => ({ ...p, decisionId: String(j.decisionId), receiptId: String(j.receiptId) }));
    }
  };

  const clickAppeal = async () => {
    setOut({ ok: true, text: "…" });
    const r = await fileAppeal(s, "appeals", tenantId, jwt, {
      receiptId: ids.receiptId,
      decisionId: ids.decisionId,
      filedBy: `applicant.${applicantLocalId}`,
      grounds: "Evidence submitted; request reconsideration.",
    });
    setOutFrom(r);
    const j = r.json as any;
    if (r.ok && j?.appealId) setIds((p) => ({ ...p, appealId: String(j.appealId) }));
  };

  const clickOrder = async () => {
    setOut({ ok: true, text: "…" });
    const r = await issueOrder(s, "appeals", tenantId, jwt, {
      appealId: ids.appealId,
      decisionId: ids.decisionId,
      receiptId: ids.receiptId,
      issuedBy: "appeals.judge1",
      outcome: "REMAND",
      instructions: "Grant temporary exception for 30 days pending NOC.",
    });
    setOutFrom(r);
    const j = r.json as any;
    if (r.ok && j?.orderId) setIds((p) => ({ ...p, orderId: String(j.orderId) }));
  };

  const clickRecompute = async () => {
    setOut({ ok: true, text: "…" });
    const body = {
      correlationId: corrId,
      requestId: `${reqId}-recompute`,
      parentDecisionId: ids.decisionId,
      appealId: ids.appealId || undefined,
      orderId: ids.orderId || undefined,
      caseRef: { system: "coordination", entityType: "Case", entityId: ids.caseCanonicalId, tenantId },
      applicantRef: ids.applicantCanonicalId
        ? { system: "coordination", entityType: "Applicant", entityId: ids.applicantCanonicalId, tenantId }
        : undefined,
      ruleset: { rulesetId: "SBL_LICENSE", version: "1.0.0" },
      factsSnapshot: { rulesYaml, ...(factsApplied as any) },
    };
    const r = await recomputeDecision(s, "appeals", tenantId, jwt, body);
    setOutFrom(r);
  };

  const clickTimeline = async () => {
    setOut({ ok: true, text: "…" });
    const r = await fetchTimeline(s, "auditor", tenantId, jwt, ids.caseCanonicalId);
    setOutFrom(r);
  };

  return (
    <div className="phase-panel gov-demo-panel">
      <h2>Gov · Governance demo</h2>
      <p className="lead">
        Role-based demo UI over <code>coordination-service</code> and <code>governance-service</code>. For the demo, set JWT to{" "}
        <code>dev-local</code> and tenant to <code>COORDINATION</code>.
      </p>

      <div className="gov-demo-grid">
        <section className="gov-demo-card">
          <h3>Role + auth</h3>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as DemoRole)}>
              <option value="regulator">Regulator</option>
              <option value="registrar">Registrar</option>
              <option value="applicant">Applicant</option>
              <option value="appeals">Appeals authority</option>
              <option value="auditor">Auditor</option>
            </select>
            <div className="hint">{explainRole}</div>
          </div>
          <div className="field">
            <label>Tenant</label>
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          </div>
          <div className="field">
            <label>JWT</label>
            <input value={jwt} onChange={(e) => setJwt(e.target.value)} />
            <div className="hint">{authOk ? "Ready" : "Set tenant + JWT"} </div>
          </div>

          <h3 style={{ marginTop: "1rem" }}>Sticky ids</h3>
          <div className="field">
            <label>Applicant canonicalId</label>
            <input value={ids.applicantCanonicalId} onChange={(e) => setIds((p) => ({ ...p, applicantCanonicalId: e.target.value }))} />
          </div>
          <div className="field">
            <label>Case canonicalId</label>
            <input value={ids.caseCanonicalId} onChange={(e) => setIds((p) => ({ ...p, caseCanonicalId: e.target.value }))} />
          </div>
          <div className="field">
            <label>Decision / Receipt</label>
            <input
              value={`${ids.decisionId || "—"} / ${ids.receiptId || "—"}`}
              readOnly
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            />
          </div>
          <div className="field">
            <label>Appeal / Order</label>
            <input
              value={`${ids.appealId || "—"} / ${ids.orderId || "—"}`}
              readOnly
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            />
          </div>
        </section>

        <section className="gov-demo-card">
          <h3>Regulator — ruleset</h3>
          <div className="field">
            <label>Rules YAML</label>
            <textarea value={rulesYaml} onChange={(e) => setRulesYaml(e.target.value)} rows={12} spellCheck={false} />
          </div>
          <div className="btn-row">
            <button type="button" className="secondary" onClick={() => setRulesYaml(DEFAULT_RULES_YAML)}>
              Reset YAML
            </button>
            <button type="button" className="primary" onClick={clickPublishRuleset} disabled={!authOk}>
              Publish ruleset
            </button>
          </div>

          <h3 style={{ marginTop: "1rem" }}>Registrar — facts snapshot</h3>
          <div className="field">
            <label>Facts JSON</label>
            <textarea value={factsDraft} onChange={(e) => setFactsDraft(e.target.value)} rows={8} spellCheck={false} />
            <div className="hint">{parsedFactsDraft ? "Valid JSON" : "Invalid JSON"}</div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="secondary"
              disabled={!parsedFactsDraft}
              onClick={() => {
                if (!parsedFactsDraft) return;
                const x = parsedFactsDraft as any;
                if (!x || typeof x !== "object" || !x.facts || typeof x.facts !== "object") {
                  setOut({ ok: false, text: 'Facts JSON must look like {"facts": {...}}' });
                  return;
                }
                setFactsApplied(x);
                setOut({ ok: true, text: "Applied facts snapshot for decisions." });
              }}
            >
              Apply facts
            </button>
            <button type="button" className="secondary" onClick={() => setFactsDraft(pretty(factsApplied))}>
              Load applied
            </button>
          </div>
          <details style={{ marginTop: "0.5rem" }}>
            <summary>Currently applied facts</summary>
            <pre style={{ marginTop: "0.5rem" }}>{pretty(factsApplied)}</pre>
          </details>
        </section>

        <section className="gov-demo-card">
          <h3>Applicant — case</h3>
          <div className="field">
            <label>Applicant localId</label>
            <input value={applicantLocalId} onChange={(e) => setApplicantLocalId(e.target.value)} />
          </div>
          <div className="field">
            <label>Case localId</label>
            <input value={caseLocalId} onChange={(e) => setCaseLocalId(e.target.value)} />
          </div>
          <div className="btn-row">
            <button type="button" className="secondary" onClick={clickResolveApplicant} disabled={!authOk}>
              Resolve Applicant ID
            </button>
            <button type="button" className="secondary" onClick={clickResolveCase} disabled={!authOk}>
              Resolve Case ID
            </button>
            <button type="button" className="secondary" onClick={clickLink} disabled={!authOk || !ids.applicantCanonicalId || !ids.caseCanonicalId}>
              Link Applicant → Case
            </button>
          </div>

          <h3 style={{ marginTop: "1rem" }}>Decision</h3>
          <div className="field">
            <label>Correlation / Request</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input value={corrId} onChange={(e) => setCorrId(e.target.value)} />
              <input value={reqId} onChange={(e) => setReqId(e.target.value)} />
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="primary" onClick={clickDecide} disabled={!authOk || !ids.caseCanonicalId}>
              Compute decision
            </button>
          </div>
        </section>

        <section className="gov-demo-card">
          <h3>Appeals authority</h3>
          <div className="btn-row">
            <button type="button" className="secondary" onClick={clickAppeal} disabled={!authOk || !ids.receiptId || !ids.decisionId}>
              File appeal
            </button>
            <button type="button" className="secondary" onClick={clickOrder} disabled={!authOk || !ids.appealId}>
              Issue order
            </button>
            <button type="button" className="secondary" onClick={clickRecompute} disabled={!authOk || !ids.caseCanonicalId || !ids.decisionId}>
              Recompute decision
            </button>
          </div>

          <h3 style={{ marginTop: "1rem" }}>Auditor</h3>
          <div className="btn-row">
            <button type="button" className="secondary" onClick={clickTimeline} disabled={!authOk || !ids.caseCanonicalId}>
              Fetch timeline
            </button>
            <button type="button" className="secondary" onClick={() => setIds(DEFAULT_IDS)}>
              Reset ids
            </button>
          </div>
        </section>

        <section className="gov-demo-card gov-demo-output">
          <h3>Output</h3>
          <pre className={out.ok ? "ok" : "bad"}>{out.text || "—"}</pre>
          <details style={{ marginTop: "0.5rem" }}>
            <summary>Connection settings (read-only)</summary>
            <pre>{pretty({ coordination: s.coordinationServiceBaseUrl, governance: s.governanceServiceBaseUrl })}</pre>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setS((p) => ({ ...p, jwt }));
              }}
            >
              Copy demo JWT to Connection panel
            </button>
          </details>
        </section>
      </div>
    </div>
  );
}

