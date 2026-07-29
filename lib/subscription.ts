import { createClient } from "@/lib/supabase/server";
import type { Billing } from "@/lib/types";

export interface AccessStatus {
  hasAccess: boolean;
  billing: Billing | null;
}

export async function getAccessStatus(userId: string): Promise<AccessStatus> {
  const supabase = await createClient();
  const { data } = await supabase.from("billing").select("*").eq("user_id", userId).maybeSingle();

  const billing = data as Billing | null;
  const hasAccess = !!billing && (billing.is_comped || billing.subscription_status === "active");

  return { hasAccess, billing };
}
