import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

function getPeriodEnd(subscription: Stripe.Subscription): string | null {
  const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
  const topLevelPeriodEnd = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  const seconds = itemPeriodEnd ?? topLevelPeriodEnd;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function upsertFromSubscription(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
  subscription: Stripe.Subscription
) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const payload = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    price_id: subscription.items.data[0]?.price.id ?? null,
    current_period_end: getPeriodEnd(subscription),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    await admin.from("billing").upsert({ user_id: userId, ...payload });
  } else {
    await admin.from("billing").update(payload).eq("stripe_customer_id", customerId);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Ontbrekende signature." }, { status: 400 });
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Ongeldige signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertFromSubscription(admin, session.client_reference_id, subscription);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertFromSubscription(admin, null, subscription);
        break;
      }
      default:
        break;
    }
  } catch {
    return NextResponse.json({ error: "Verwerking mislukt." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
