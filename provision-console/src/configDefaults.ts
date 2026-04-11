/**
 * Matches digit3 local provision defaults (`run-full-provision.sh` / realm template):
 * client `auth-server`, secret `changeme`, superuser password `default`.
 * Username must be the tenant admin email Keycloak created for that realm.
 */
export const LOCAL_DEMO_OAUTH = {
  clientId: "auth-server",
  clientSecret: "changeme",
  /** Default tenant email in Phase A — change if your superuser uses another login */
  username: "admin@demo.gov",
  password: "default",
} as const;

export type ServiceSettings = {
  accountBaseUrl: string;
  accountClientId: string;
  keycloakOrigin: string;
  realm: string;
  oauthClientId: string;
  oauthSecret: string;
  oauthUsername: string;
  oauthPassword: string;
  jwt: string;
  coordinationServiceBaseUrl: string;
  governanceServiceBaseUrl: string;
  boundaryBaseUrl: string;
  registryBaseUrl: string;
  mdmsBaseUrl: string;
  workflowBaseUrl: string;
  filestoreBaseUrl: string;
  idgenBaseUrl: string;
  notificationBaseUrl: string;
};

/** Use 127.0.0.1 so browser + Node match Docker-published ports (avoids ::1 / IPv4 mismatch on macOS). */
export const defaultSettings: ServiceSettings = {
  accountBaseUrl: "http://127.0.0.1:8094",
  accountClientId: "test-client",
  keycloakOrigin: "http://127.0.0.1:8080",
  realm: "",
  oauthClientId: LOCAL_DEMO_OAUTH.clientId,
  oauthSecret: LOCAL_DEMO_OAUTH.clientSecret,
  oauthUsername: LOCAL_DEMO_OAUTH.username,
  oauthPassword: LOCAL_DEMO_OAUTH.password,
  jwt: "",
  coordinationServiceBaseUrl: "http://127.0.0.1:8090",
  governanceServiceBaseUrl: "http://127.0.0.1:8091",
  boundaryBaseUrl: "http://127.0.0.1:8093",
  registryBaseUrl: "http://127.0.0.1:8104",
  mdmsBaseUrl: "http://127.0.0.1:8099",
  workflowBaseUrl: "http://127.0.0.1:8085",
  filestoreBaseUrl: "http://127.0.0.1:8102",
  idgenBaseUrl: "http://127.0.0.1:8100",
  notificationBaseUrl: "http://127.0.0.1:8091",
};
