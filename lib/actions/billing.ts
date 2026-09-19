"use server";

import { redirect } from "next/navigation";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe/client";
import { siteUrl } from "@/lib/site";

export async function startCheckout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const userId = user.id;
  const userEmail = user.email;

  const { data: billing } = await supabase
    .from("billing")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const stripe = getStripeClient();
  const taxRates = process.env.STRIPE_TAX_RATE_ID ? [process.env.STRIPE_TAX_RATE_ID] : undefined;

  function buildParams(withTaxRates: boolean): Stripe.Checkout.SessionCreateParams {
    return {
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
          tax_rates: withTaxRates ? taxRates : undefined,
        },
      ],
      client_reference_id: userId,
      success_url: `${siteUrl()}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/account`,
    };
  }

  // Elke stap hieronder valt terug op een eenvoudigere variant i.p.v. de gebruiker op een kapotte
  // pagina te laten belanden: eerst zonder opgeslagen customer-id (kan uit de verkeerde Stripe-
  // modus stammen), en als laatste redmiddel zonder tax_rates (bijv. een tax rate-object dat in
  // de verkeerde modus is aangemaakt) — dan rekenen we die keer zonder BTW-regel i.p.v. dat
  // niemand kan afrekenen. Elke mislukte poging wordt gelogd zodat dit zichtbaar blijft.
  const attempts: Stripe.Checkout.SessionCreateParams[] = [];
  if (billing?.stripe_customer_id) {
    attempts.push({ ...buildParams(true), customer: billing.stripe_customer_id });
  }
  attempts.push({ ...buildParams(true), customer_email: userEmail });
  if (taxRates) {
    attempts.push({ ...buildParams(false), customer_email: userEmail });
  }

  let session: Stripe.Checkout.Session | null = null;
  let lastError: unknown = null;
  for (const params of attempts) {
    try {
      session = await stripe.checkout.sessions.create(params);
      break;
    } catch (err) {
      lastError = err;
      console.error("Stripe checkout-sessie aanmaken mislukt, probeer volgende variant:", err);
    }
  }

  if (!session) {
    console.error("Stripe checkout-sessie aanmaken definitief mislukt:", lastError);
    redirect("/account?checkout=error");
  }

  redirect(session.url!);
}

export async function openBillingPortal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: billing } = await supabase
    .from("billing")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!billing?.stripe_customer_id) {
    redirect("/account");
  }

  const stripe = getStripeClient();

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${siteUrl()}/account`,
    });
    redirect(portalSession.url);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      redirect("/account?portal=error");
    }
    throw err;
  }
}
