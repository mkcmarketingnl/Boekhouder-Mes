"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Aangiftetijdvak, Rechtsvorm } from "@/lib/types";

export interface ProfileState {
  error?: string;
}

export async function saveProfile(_prevState: ProfileState, formData: FormData): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const voornaam = String(formData.get("voornaam") ?? "").trim();
  const bedrijfsnaam = String(formData.get("bedrijfsnaam") ?? "").trim();
  const rechtsvorm = String(formData.get("rechtsvorm") ?? "") as Rechtsvorm;
  const activiteiten = String(formData.get("activiteiten") ?? "").trim();
  const sbi_indicatie = String(formData.get("sbi_indicatie") ?? "").trim() || null;
  const kvk_nummer = String(formData.get("kvk_nummer") ?? "").trim() || null;
  const btw_nummer = String(formData.get("btw_nummer") ?? "").trim() || null;
  const standaard_btw_percentage = Number(formData.get("standaard_btw_percentage") ?? 21);
  const aangiftetijdvak = String(formData.get("aangiftetijdvak") ?? "kwartaal") as Aangiftetijdvak;

  if (!voornaam || !bedrijfsnaam || !rechtsvorm || !activiteiten) {
    return { error: "Vul minimaal je voornaam, bedrijfsnaam, rechtsvorm en bedrijfsactiviteiten in." };
  }

  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    voornaam,
    bedrijfsnaam,
    rechtsvorm,
    activiteiten,
    sbi_indicatie,
    kvk_nummer,
    btw_nummer,
    standaard_btw_percentage,
    aangiftetijdvak,
  });

  if (error) {
    return { error: "Opslaan van profiel is mislukt. Probeer het opnieuw." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
