import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt, Check, Sparkles } from "lucide-react";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { getAccessStatus } from "@/lib/subscription";
import { startCheckout, openBillingPortal } from "@/lib/actions/billing";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SignOutButton } from "@/components/SignOutButton";
import { formatCurrency, formatDate } from "@/lib/format";

async function verifyCheckoutSession(sessionId: string, userId: string): Promise<boolean> {
  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });

    if (session.payment_status !== "paid" || session.client_reference_id !== userId) {
      return false;
    }

    const subscription = session.subscription as Stripe.Subscription | null;
    if (!subscription) return false;

    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const admin = createAdminClient();
    const { error } = await admin.from("billing").upsert({
      user_id: userId,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      price_id: subscription.items.data[0]?.price.id ?? null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Kon billing-rij niet bijwerken na checkout:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Verificatie van Stripe checkout-sessie is mislukt:", err);
    return false;
  }
}

export default async function AccountPage({
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

  let checkoutFailed = false;
  if (checkout === "success" && session_id) {
    const ok = await verifyCheckoutSession(session_id, user.id);
    if (ok) redirect("/dashboard");
    checkoutFailed = true;
  }

  const { hasAccess, billing } = await getAccessStatus(user.id);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="fade-up mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Receipt size={20} className="text-stamp" />
          <span className="mono text-[13px] uppercase tracking-wide text-muted">Boekhouder Mes</span>
        </div>
        <div className="flex items-center gap-3">
          {hasAccess && (
            <Link href="/dashboard" className="flex min-h-11 items-center gap-1 text-xs text-muted underline">
              <ArrowLeft size={14} />
              Dashboard
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>

      {checkoutFailed && (
        <p className="fade-up mb-4 rounded-md border border-warn/30 bg-warn-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
          We konden je betaling nog niet bevestigen. Is er geld afgeschreven? Ververs deze pagina
          over een minuutje — komt het dan nog niet in orde, neem dan contact op.
        </p>
      )}

      {billing?.is_comped && (
        <Card className="fade-up p-6">
          <h1 className="display mb-2 text-xl font-semibold">Je hebt gratis toegang 🎉</h1>
          <p className="text-sm leading-relaxed text-muted">
            Jij hoeft niet te betalen — geniet ervan! Veel plezier met Boekhouder Mes.
          </p>
          <p className="mt-3 text-sm text-ink">Groetjes, Mes!</p>
        </Card>
      )}

      {!billing?.is_comped && hasAccess && (
        <Card className="fade-up p-6">
          <h1 className="display mb-1 text-xl font-semibold">Mijn account</h1>
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
            <h1 className="display text-xl font-semibold">€25 per maand — en waarom</h1>
          </div>

          <p className="mb-4 text-sm leading-relaxed text-muted">
            We zijn geen boekhoudkantoor met dure overhead. Boekhouder Mes is meer een vriend die
            toevallig verstand heeft van cijfers — en die vriend moet ook AI-rekeningen en
            serverkosten betalen om dit voor je draaiende te houden. Daarom vragen we een eerlijke
            prijs. Geen addertjes, geen jaarcontract, elke maand op te zeggen.
          </p>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Dit krijg je ervoor
          </p>
          <ul className="mb-5 space-y-2 text-[13px] text-ink">
            {[
              "Onbeperkt bonnen en facturen scannen — in één keer, ook meerdere tegelijk",
              "Automatische BTW-berekening per maand, kwartaal of jaar",
              "Live inzicht in wat je opzij moet zetten voor de inkomstenbelasting",
              "Fiscale tips in simpele taal, geen jargon",
              "Alles overzichtelijk op één plek, altijd actueel",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={14} className="mt-0.5 shrink-0 text-ok" />
                {item}
              </li>
            ))}
          </ul>

          <div className="mb-5 rounded-md border border-line bg-paper-dark p-3.5">
            <p className="text-[13px] leading-relaxed text-ink">
              Een gemiddelde boekhouder kost al snel <strong>€100 of meer per maand</strong>. Met
              Boekhouder Mes hou je zelf de regie, bespaar je dat verschil, en betaal je een fractie
              van wat een boekhouder normaal kost.
            </p>
          </div>

          <form action={startCheckout}>
            <Button type="submit" className="w-full justify-center">
              Start — {formatCurrency(25)}/maand
            </Button>
          </form>
          <p className="mt-3 text-center text-xs text-muted">Geen bedrijf. Gewoon Mes.</p>
        </Card>
      )}
    </div>
  );
}
