import { useState } from "react";
import type { ServiceSettings } from "./configDefaults";
import { getApiHelp, type ApiHelpExtras, type ApiHelpId } from "./apiHelp/getApiHelp";
import { ApiHelpModal } from "./ApiHelpModal";

type Props = {
  specId: ApiHelpId;
  s: ServiceSettings;
  /** Called when opening so YAML/JSON fields reflect current editor state. */
  getExtras?: () => ApiHelpExtras;
};

export function ApiHelpButton({ specId, s, getExtras }: Props) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<ReturnType<typeof getApiHelp> | null>(null);

  return (
    <>
      <button
        type="button"
        className="secondary api-help-trigger"
        title="DIGIT API — cURL and client SDK hints"
        onClick={() => {
          setSnap(getApiHelp(specId, s, getExtras?.() ?? {}));
          setOpen(true);
        }}
      >
        API
      </button>
      {open && snap && <ApiHelpModal content={snap} onClose={() => { setOpen(false); setSnap(null); }} />}
    </>
  );
}
