"use client";

import { CheckCircle2 } from "lucide-react";

export interface ToastData {
  message: string;
}

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return (
    <div
      className="pop-in safe-bottom fixed bottom-5 left-1/2 z-60 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] text-paper shadow-lg"
      role="status"
    >
      <CheckCircle2 size={16} className="text-ok shrink-0" />
      {toast.message}
    </div>
  );
}
