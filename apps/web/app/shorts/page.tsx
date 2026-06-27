import { Suspense } from "react";
import { ShortsForm } from "@/components/ShortsForm";

export default function ShortsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading workflow...</p>}>
      <ShortsForm />
    </Suspense>
  );
}

