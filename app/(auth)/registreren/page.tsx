"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, FieldHint } from "@/components/ui/Input";

const initialState: AuthState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <Card className="p-6">
      <h1 className="display mb-1 text-xl font-semibold">Account aanmaken</h1>
      <p className="mb-6 text-sm text-muted">Start je eigen administratie in een paar minuten.</p>
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mailadres</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Wachtwoord</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <FieldHint>Minimaal 8 tekens.</FieldHint>
        </div>
        {state.error && <p className="text-sm text-stamp">{state.error}</p>}
        {state.message && <p className="text-sm text-ok">{state.message}</p>}
        <Button type="submit" className="w-full justify-center" loading={pending}>
          Registreren
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Al een account?{" "}
        <Link href="/login" className="font-semibold text-ink underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
