import yaml from "js-yaml";

export type ParseResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Parse as JSON first, then YAML — works for any document shape (no schema-specific logic). */
export function parseJsonOrYaml(text: string): ParseResult {
  const t = text.trim();
  if (!t) return { ok: false, error: "Empty — paste YAML or JSON to use tree view." };
  try {
    return { ok: true, data: JSON.parse(t) as unknown };
  } catch {
    try {
      const data = yaml.load(t) as unknown;
      if (data === undefined) return { ok: false, error: "YAML parsed to an empty document." };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: `Not valid JSON or YAML: ${String(e)}` };
    }
  }
}
