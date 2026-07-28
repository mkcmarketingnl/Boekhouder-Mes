"use client";

import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="min-h-11 px-2 text-sm text-muted hover:text-ink">
        Uitloggen
      </button>
    </form>
  );
}
