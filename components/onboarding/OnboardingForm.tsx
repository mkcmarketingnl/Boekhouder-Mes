"use client";

import { useActionState, useState } from "react";
import { Receipt, ChevronRight } from "lucide-react";
import { saveProfile, type ProfileState } from "@/lib/actions/profile";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { BtwSuggestion } from "@/components/onboarding/BtwSuggestion";
import type { Profile } from "@/lib/types";

const initialState: ProfileState = {};

export function OnboardingForm({ existing }: { existing: Profile | null }) {
  const [state, formAction, pending] = useActionState(saveProfile, initialState);
  const [activiteiten, setActiviteiten] = useState(existing?.activiteiten ?? "");
  const [btw, setBtw] = useState<{ percentage: number; vrijgesteld: boolean }>({
    percentage: existing?.standaard_btw_percentage ?? 21,
    vrijgesteld: existing?.standaard_btw_percentage === 0,
  });

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <div className="fade-up mb-2 flex items-center gap-2.5">
        <Receipt size={20} className="text-stamp" />
        <span className="mono text-[13px] uppercase tracking-wide text-muted">Boekhouder Mes</span>
      </div>
      <h1 className="display fade-up mb-1.5 text-2xl font-semibold">
        {existing ? "Profiel bewerken" : "Welkom — laten we starten"}
      </h1>
      <p className="fade-up mb-7 text-sm leading-relaxed text-muted">
        Dit gebruiken we om te beoordelen of uitgaven logisch aansluiten bij je activiteiten — niet
        om aangifte te doen.
      </p>

      <Card className="fade-up p-6">
        <form action={formAction} className="space-y-0">
          <Field label="Je voornaam">
            <Input name="voornaam" placeholder="Bijv. Mes" required defaultValue={existing?.voornaam} />
          </Field>

          <Field label="Bedrijfsnaam">
            <Input name="bedrijfsnaam" placeholder="Bijv. Studio Noord" required defaultValue={existing?.bedrijfsnaam} />
          </Field>

          <Field label="Rechtsvorm">
            <Select name="rechtsvorm" required defaultValue={existing?.rechtsvorm ?? "eenmanszaak"}>
              <option value="eenmanszaak">Eenmanszaak</option>
              <option value="vof">VOF</option>
              <option value="bv">BV</option>
              <option value="anders">Anders</option>
            </Select>
          </Field>

          <Field
            label="Bedrijfsactiviteiten"
            hint="Beschrijf kort wat je doet — hoe specifieker, hoe beter de AI-risicocheck werkt."
          >
            <Textarea
              name="activiteiten"
              required
              rows={3}
              placeholder="Bijv. Grafisch ontwerp en webdesign voor kleine bedrijven"
              value={activiteiten}
              onChange={(e) => setActiviteiten(e.target.value)}
            />
          </Field>

          <BtwSuggestion activiteiten={activiteiten} value={btw} onChange={setBtw} />
          <input type="hidden" name="standaard_btw_percentage" value={btw.percentage} />

          <Field label="KVK-nummer (optioneel)">
            <Input name="kvk_nummer" inputMode="numeric" defaultValue={existing?.kvk_nummer ?? ""} />
          </Field>

          <Field label="BTW-nummer (optioneel)">
            <Input name="btw_nummer" defaultValue={existing?.btw_nummer ?? ""} />
          </Field>

          <Field label="BTW-aangiftetijdvak">
            <Select name="aangiftetijdvak" required defaultValue={existing?.aangiftetijdvak ?? "kwartaal"}>
              <option value="maand">Maand</option>
              <option value="kwartaal">Kwartaal</option>
              <option value="jaar">Jaar</option>
            </Select>
          </Field>

          {state.error && <p className="mb-4 text-sm text-stamp">{state.error}</p>}

          <Button type="submit" className="mt-2 w-full justify-center" loading={pending}>
            {existing ? "Wijzigingen opslaan" : "Aan de slag"} <ChevronRight size={16} />
          </Button>
        </form>
      </Card>
    </div>
  );
}
