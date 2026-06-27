import { Suspense } from "react";
import { VideoClippingForm } from "@/components/VideoClippingForm";

export default function VideoClippingPage() {
  return (
    <Suspense fallback={<p className="muted">Loading workflow...</p>}>
      <VideoClippingForm />
    </Suspense>
  );
}
