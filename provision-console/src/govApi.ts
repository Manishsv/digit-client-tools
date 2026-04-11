import type { ServiceSettings } from "./configDefaults";
import { apiPost } from "./api";

export type DemoRole = "regulator" | "registrar" | "applicant" | "appeals" | "auditor";

export function roleClientId(role: DemoRole): string {
  switch (role) {
    case "regulator":
      return "regulator";
    case "registrar":
      return "registrar";
    case "applicant":
      return "applicant";
    case "appeals":
      return "appeals";
    case "auditor":
      return "auditor";
    default:
      return "operator";
  }
}

export type ApiResult = { ok: boolean; status: number; text: string; json?: unknown };

async function postJson(path: string, body: unknown): Promise<ApiResult> {
  const r = await apiPost(path, body);
  if (!r.text) return { ...r, json: undefined };
  try {
    return { ...r, json: JSON.parse(r.text) };
  } catch {
    return { ...r, json: undefined };
  }
}

export async function publishRuleset(s: ServiceSettings, role: DemoRole, tenantId: string, jwt: string, yamlText: string) {
  return postJson("/api/gov/rulesets", {
    governanceServiceBaseUrl: s.governanceServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    yamlText,
    status: "ACTIVE",
    humanVersion: "G.O. SBL/2026 Rev 3",
    issuerAuthorityId: "authority.regulator.sbl",
    policyDocuments: [],
  });
}

export async function resolveEntity(
  s: ServiceSettings,
  role: DemoRole,
  tenantId: string,
  jwt: string,
  body: { entityType: string; sourceSystem: string; localId: string }
) {
  return postJson("/api/coord/entity/resolve", {
    coordinationServiceBaseUrl: s.coordinationServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    body,
  });
}

export async function createLink(
  s: ServiceSettings,
  role: DemoRole,
  tenantId: string,
  jwt: string,
  body: {
    fromEntityType: string;
    fromCanonicalId: string;
    relationType: string;
    toEntityType: string;
    toCanonicalId: string;
    sourceSystem: string;
    status?: string;
    confidence?: number;
  }
) {
  return postJson("/api/coord/link", {
    coordinationServiceBaseUrl: s.coordinationServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    body,
  });
}

export async function decideCase(
  s: ServiceSettings,
  role: DemoRole,
  tenantId: string,
  jwt: string,
  caseId: string,
  body: {
    correlationId: string;
    requestId: string;
    applicantCanonicalId?: string;
    rulesetId: string;
    rulesetVersion: string;
    factsSnapshot: unknown;
  }
) {
  return postJson("/api/coord/cases/governance-decide", {
    coordinationServiceBaseUrl: s.coordinationServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    caseId,
    body,
  });
}

export async function fileAppeal(
  s: ServiceSettings,
  role: DemoRole,
  tenantId: string,
  jwt: string,
  body: { receiptId: string; decisionId: string; filedBy: string; grounds: string }
) {
  return postJson("/api/gov/appeals", {
    governanceServiceBaseUrl: s.governanceServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    body,
  });
}

export async function issueOrder(
  s: ServiceSettings,
  role: DemoRole,
  tenantId: string,
  jwt: string,
  body: {
    appealId: string;
    decisionId: string;
    receiptId: string;
    issuedBy: string;
    outcome: "UPHOLD" | "MODIFY" | "REMAND";
    instructions?: string;
  }
) {
  return postJson("/api/gov/orders", {
    governanceServiceBaseUrl: s.governanceServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    body,
  });
}

export async function recomputeDecision(
  s: ServiceSettings,
  role: DemoRole,
  tenantId: string,
  jwt: string,
  body: unknown
) {
  return postJson("/api/gov/decisions-recompute", {
    governanceServiceBaseUrl: s.governanceServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    body,
  });
}

export async function fetchTimeline(s: ServiceSettings, role: DemoRole, tenantId: string, jwt: string, caseId: string) {
  return postJson("/api/coord/cases/timeline", {
    coordinationServiceBaseUrl: s.coordinationServiceBaseUrl,
    jwt,
    tenantId,
    clientId: roleClientId(role),
    caseId,
  });
}

