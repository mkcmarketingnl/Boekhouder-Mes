"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";

const initialState: AuthState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <Card className="p-6">
      <h1 className="display mb-1 text-xl font-semibold">Wachtwoord vergeten</h1>
      <p className="mb-6 text-sm text-muted">
        Vul je e-mailadres in — we sturen je een link om een nieuw wachtwoord in te stellen.
      </p>
      {!state.message ? (
        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mailadres</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          {state.error && <p className="text-sm text-stamp">{state.error}</p>}
          <Button type="submit" className="w-full justify-center" loading={pending}>
            Verstuur resetlink
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ok">{state.message}</p>
      )}
      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/login" className="font-semibold text-ink underline">
          Terug naar inloggen
        </Link>
      </p>
    </Card>
  );
}
