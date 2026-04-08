import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DocumentTree } from "./DocumentTree";
import { parseJsonOrYaml } from "./parseJsonOrYaml";

type Props = {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  /** Passed to the inline textarea (e.g. <code>tall</code>). */
  textareaClassName?: string;
  /** Shown in the fullscreen header. */
  modalTitle: string;
  rows?: number;
};

export function FullscreenYamlJsonField({
  label,
  value,
  onChange,
  textareaClassName = "",
  modalTitle,
  rows,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"source" | "tree">("source");

  const parsed = useMemo(() => parseJsonOrYaml(value), [value]);

  const close = useCallback(() => {
    setOpen(false);
    setMode("source");
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const overlay =
    open &&
    createPortal(
      <div className="fjf-overlay" role="dialog" aria-modal="true" aria-label={modalTitle}>
        <div className="fjf-backdrop" onClick={close} aria-hidden />
        <div className="fjf-modal">
          <header className="fjf-header">
            <h2 className="fjf-title">{modalTitle}</h2>
            <div className="fjf-mode-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "source"}
                className={mode === "source" ? "active" : ""}
                onClick={() => setMode("source")}
              >
                Source
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "tree"}
                className={mode === "tree" ? "active" : ""}
                disabled={!parsed.ok}
                title={!parsed.ok ? String(parsed.error) : "Structured view"}
                onClick={() => parsed.ok && setMode("tree")}
              >
                Tree view
              </button>
            </div>
            <button type="button" className="fjf-close secondary" onClick={close}>
              Close <span className="fjf-kbd">Esc</span>
            </button>
          </header>
          <div className="fjf-body">
            {mode === "source" ? (
              <textarea
                className="fjf-full-textarea"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={false}
                autoFocus
              />
            ) : parsed.ok ? (
              <div className="fjf-tree-scroll">
                <DocumentTree data={parsed.data} />
              </div>
            ) : (
              <p className="fjf-parse-err">{parsed.error}</p>
            )}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div className="field fjf-field">
      <div className="fjf-label-row">
        <label>{label}</label>
        <button type="button" className="secondary fjf-expand" onClick={() => setOpen(true)}>
          Fullscreen
        </button>
      </div>
      <textarea
        className={textareaClassName || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={rows}
      />
      {overlay}
    </div>
  );
}
