import { Receipt } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 pt-[calc(3rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <div className="fade-up mb-8 flex items-center gap-2.5">
        <Receipt size={20} className="text-stamp" />
        <span className="mono text-[13px] uppercase tracking-wide text-muted">Boekhouder Mes</span>
      </div>
      <div className="fade-up w-full max-w-sm">{children}</div>
    </div>
  );
}
