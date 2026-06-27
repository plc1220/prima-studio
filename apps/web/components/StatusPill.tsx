import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { JobStatus } from "@/lib/api";

export function StatusPill({ status }: { status: JobStatus }) {
  const Icon = status === "succeeded" ? CheckCircle2 : status === "failed" ? XCircle : CircleDashed;
  return (
    <span className={`status ${status}`}>
      <Icon size={14} />
      {status}
    </span>
  );
}

