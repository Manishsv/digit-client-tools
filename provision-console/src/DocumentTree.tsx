import type { ReactNode } from "react";

function formatScalar(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return `${v}n`;
  return String(v);
}

function scalarType(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (v instanceof Date) return "date";
  return typeof v;
}

function TreeNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const isComposite =
    value !== null && typeof value === "object" && !(value instanceof Date) && !(value instanceof RegExp);

  if (!isComposite) {
    return (
      <div className="tree-leaf">
        {name !== "" ? <span className="tree-key">{name}</span> : null}
        <span className={`tree-val tree-t-${scalarType(value)}`}>{formatScalar(value)}</span>
      </div>
    );
  }

  const isArr = Array.isArray(value);
  const entries: [string, unknown][] = isArr
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);

  const summary: ReactNode =
    name !== "" ? (
      <>
        <span className="tree-key">{name}</span>
        <span className="tree-kind">{isArr ? `[${value.length}]` : `{${entries.length}}`}</span>
      </>
    ) : (
      <span className="tree-root-badge">{isArr ? `List (${value.length} items)` : `Record (${entries.length} fields)`}</span>
    );

  return (
    <details className="tree-node" open={depth < 2}>
      <summary className="tree-summary">{summary}</summary>
      <div className="tree-children">
        {entries.map(([k, v]) => (
          <TreeNode key={`${depth}-${k}`} name={k} value={v} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

/** Generic collapsible tree for any JSON-serialisable / YAML-loaded value. */
export function DocumentTree({ data }: { data: unknown }) {
  return (
    <div className="tree-document" role="tree">
      <p className="tree-hint">Expand sections to walk the structure — same data as Source, no extra configuration per form.</p>
      <TreeNode name="" value={data} depth={0} />
    </div>
  );
}
