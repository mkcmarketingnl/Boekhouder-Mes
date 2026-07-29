import { redirect } from "next/navigation";
import { Receipt, Check, Sparkles } from "lucide-react";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { getAccessStatus } from "@/lib/subscription";
import { startCheckout, openBillingPortal } from "@/lib/actions/billing";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDate } from "@/lib/format";

async function verifyCheckoutSession(sessionId: string, userId: string) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });

  if (session.payment_status !== "paid" || session.client_reference_id !== userId) {
    return false;
  }

  const subscription = session.subscription as Stripe.Subscription | null;
  if (!subscription) return false;

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const admin = createAdminClient();
  await admin.from("billing").upsert({
    user_id: userId,
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    price_id: subscription.items.data[0]?.price.id ?? null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  });

  return true;
}

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const { checkout, session_id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (checkout === "success" && session_id) {
    const ok = await verifyCheckoutSession(session_id, user.id);
    if (ok) redirect("/dashboard");
  }

  const { hasAccess, billing } = await getAccessStatus(user.id);

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="fade-up mb-6 flex items-center gap-2.5">
        <Receipt size={20} className="text-stamp" />
        <span className="mono text-[13px] uppercase tracking-wide text-muted">Boekhouder Mes</span>
      </div>

      {billing?.is_comped && (
        <Card className="fade-up p-6">
          <h1 className="display mb-2 text-xl font-semibold">Je hebt gratis toegang</h1>
          <p className="text-sm text-muted">
            Je account is gemarkeerd voor kosteloze toegang. Veel plezier met Boekhouder Mes!
          </p>
        </Card>
      )}

      {!billing?.is_comped && hasAccess && (
        <Card className="fade-up p-6">
          <h1 className="display mb-1 text-xl font-semibold">Je abonnement</h1>
          <p className="mb-4 text-sm text-muted">€25 per maand</p>
          <div className="mb-5 space-y-2 rounded-md border border-line bg-paper-dark p-3.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted">Status</span>
              <span className="font-semibold text-ok">Actief</span>
            </div>
            {billing?.current_period_end && (
              <div className="flex justify-between">
                <span className="text-muted">
                  {billing.cancel_at_period_end ? "Loopt door tot" : "Volgende afschrijving"}
                </span>
                <span className="font-semibold text-ink">{formatDate(billing.current_period_end)}</span>
              </div>
            )}
            {billing?.cancel_at_period_end && (
              <p className="pt-1 text-xs text-warn">Je abonnement is opgezegd en stopt na deze periode.</p>
            )}
          </div>
          <form action={openBillingPortal}>
            <Button type="submit" variant="secondary" className="w-full justify-center">
              Beheer abonnement
            </Button>
          </form>
          <p className="mt-3 text-center text-xs text-muted">
            Facturen inzien, betaalmethode wijzigen of opzeggen kan allemaal via deze knop.
          </p>
        </Card>
      )}

      {!hasAccess && (
        <Card className="fade-up p-6">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-stamp" />
            <h1 className="display text-xl font-semibold">Start je abonnement</h1>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Boekhouder Mes kost <strong>€25 per maand</strong>. Geen verborgen kosten, elke maand opzegbaar.
          </p>
          <ul className="mb-5 space-y-2 text-[13px] text-ink">
            {[
              "Onbeperkt bonnen en facturen scannen",
              "Automatische BTW-berekening",
              "AI-tips over je cijfers",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check size={14} className="shrink-0 text-ok" />
                {item}
              </li>
            ))}
          </ul>
          <form action={startCheckout}>
            <Button type="submit" className="w-full justify-center">
              Start abonnement — {formatCurrency(25)}/maand
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
