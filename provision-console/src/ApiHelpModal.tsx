import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ApiHelpPayload } from "./apiHelp/getApiHelp";

function CopyBtn({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="secondary api-help-copy"
      onClick={() => navigator.clipboard.writeText(text).catch(() => {})}
    >
      Copy
    </button>
  );
}

export function ApiHelpModal({ content, onClose }: { content: ApiHelpPayload; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", k);
    };
  }, [onClose]);

  return createPortal(
    <div className="api-help-overlay" role="dialog" aria-modal="true" aria-label={content.title}>
      <div className="api-help-backdrop" onClick={onClose} />
      <div className="api-help-dialog">
        <header className="api-help-head">
          <h2>{content.title}</h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close <span className="fjf-kbd">Esc</span>
          </button>
        </header>
        <p className="api-help-summary">{content.summary}</p>
        {content.sdkNote ? <p className="api-help-sdknote">{content.sdkNote}</p> : null}

        <section className="api-help-section">
          <div className="api-help-section-h">
            <h3>cURL</h3>
            <CopyBtn text={content.curl} />
          </div>
          <pre className="api-help-pre">{content.curl}</pre>
        </section>

        {content.go ? (
          <section className="api-help-section">
            <div className="api-help-section-h">
              <h3>Go (<code>digit</code> package)</h3>
              <CopyBtn text={content.go} />
            </div>
            <pre className="api-help-pre">{content.go}</pre>
          </section>
        ) : null}

        {content.java ? (
          <section className="api-help-section">
            <div className="api-help-section-h">
              <h3>Java (digit-java-client)</h3>
              <CopyBtn text={content.java} />
            </div>
            <pre className="api-help-pre">{content.java}</pre>
          </section>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
