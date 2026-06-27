import { Suspense } from "react";
import { NewsroomGenerator } from "@/components/NewsroomGenerator";

export default function NewsroomPage() {
  return (
    <Suspense fallback={<p className="muted">Loading workflow...</p>}>
      <NewsroomGenerator />
    </Suspense>
  );
}
