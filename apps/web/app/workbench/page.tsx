import { Suspense } from "react";
import { UnifiedWorkbench } from "@/components/UnifiedWorkbench";

export default function WorkbenchPage() {
  return (
    <Suspense fallback={<p className="muted">Loading workbench...</p>}>
      <UnifiedWorkbench />
    </Suspense>
  );
}
