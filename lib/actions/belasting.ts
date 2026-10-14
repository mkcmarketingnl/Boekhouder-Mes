"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { isTabelOntbreekt } from "@/lib/facturen";
import { schoonAntwoorden } from "@/lib/belastingDb";
import type { IbAntwoorden } from "@/lib/belasting";

export async function bewaarIbAntwoorden(jaar: number, antwoorden: IbAntwoorden): Promise<{ fout: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { fout: "Niet ingelogd." };
  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) return { fout: "Geen actief abonnement." };
  if (!Number.isInteger(jaar) || jaar < 2020 || jaar > 2100) return { fout: "Ongeldig jaar." };

  const { error } = await supabase.from("ib_antwoorden").upsert({ user_id: user.id, jaar, antwoorden: schoonAntwoorden(antwoorden) });
  if (error) return { fout: isTabelOntbreekt(error) ? "De inkomstenbelasting-modus heeft een eenmalige database-update nodig (migratie 0008_uren_belasting_geld.sql in Supabase)." : "Opslaan is mislukt." };
  revalidatePath("/belasting");
  revalidatePath("/dashboard");
  return { fout: null };
}
