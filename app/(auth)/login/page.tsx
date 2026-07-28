"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";

const initialState: AuthState = {};

function LinkExpiredNotice() {
  const params = useSearchParams();
  if (params.get("error") !== "link-verlopen") return null;
  return (
    <p className="mb-4 text-sm text-stamp">
      Je link is verlopen of ongeldig. Log opnieuw in of vraag een nieuwe link aan.
    </p>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <Card className="p-6">
      <h1 className="display mb-1 text-xl font-semibold">Inloggen</h1>
      <p className="mb-6 text-sm text-muted">Welkom terug bij je administratie.</p>
      <Suspense fallback={null}>
        <LinkExpiredNotice />
      </Suspense>
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mailadres</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password" className="!mb-0">
              Wachtwoord
            </Label>
            <Link href="/wachtwoord-vergeten" className="text-xs font-medium text-muted underline">
              Vergeten?
            </Link>
          </div>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {state.error && <p className="text-sm text-stamp">{state.error}</p>}
        <Button type="submit" className="w-full justify-center" loading={pending}>
          Inloggen
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Nog geen account?{" "}
        <Link href="/registreren" className="font-semibold text-ink underline">
          Registreer
        </Link>
      </p>
    </Card>
  );
}
