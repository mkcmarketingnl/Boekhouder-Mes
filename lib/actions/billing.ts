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

  const { data: billing } = await supabase
    .from("billing")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = getStripeClient();
  const baseParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    client_reference_id: user.id,
    success_url: `${siteUrl()}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/account`,
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      billing?.stripe_customer_id
        ? { ...baseParams, customer: billing.stripe_customer_id }
        : { ...baseParams, customer_email: user.email }
    );
  } catch (err) {
    // Een opgeslagen customer-id kan uit een ander Stripe-modus (test/live) stammen
    // en dan door Stripe geweigerd worden — probeer het opnieuw zonder die id.
    if (billing?.stripe_customer_id && err instanceof Stripe.errors.StripeError) {
      session = await stripe.checkout.sessions.create({ ...baseParams, customer_email: user.email });
    } else {
      throw err;
    }
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
