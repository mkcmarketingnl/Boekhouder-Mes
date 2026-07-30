import { redirect } from "next/navigation";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { SignOutButton } from "@/components/SignOutButton";
import { FooterDisclaimer } from "@/components/ui/Disclaimer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("voornaam")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) {
    redirect("/account");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <Receipt size={18} className="shrink-0 text-stamp" />
            <span className="mono truncate text-[11px] uppercase tracking-wide text-muted sm:text-[12px]">
              Boekhouder Mes
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <Link href="/account" className="min-h-11 content-center text-xs text-muted underline">
              Account
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <FooterDisclaimer />
    </div>
  );
}
