"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, FieldHint } from "@/components/ui/Input";

const initialState: AuthState = {};

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <Card className="p-6">
      <h1 className="display mb-1 text-xl font-semibold">Nieuw wachtwoord instellen</h1>
      <p className="mb-6 text-sm text-muted">Kies een nieuw wachtwoord voor je account.</p>
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="password">Nieuw wachtwoord</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <FieldHint>Minimaal 8 tekens.</FieldHint>
        </div>
        {state.error && <p className="text-sm text-stamp">{state.error}</p>}
        <Button type="submit" className="w-full justify-center" loading={pending}>
          Wachtwoord bijwerken
        </Button>
      </form>
    </Card>
  );
}
