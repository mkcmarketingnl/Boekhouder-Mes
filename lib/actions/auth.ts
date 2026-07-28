"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signIn(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Inloggen mislukt. Controleer je e-mailadres en wachtwoord." };
  }

  redirect("/dashboard");
}

export async function signUp(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { error: "Wachtwoord moet minimaal 8 tekens bevatten." };
  }

  const supabase = await createClient();
  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/onboarding` },
  });

  if (error) {
    return {
      error:
        "Registreren mislukt. " +
        (error.message.toLowerCase().includes("already")
          ? "Dit e-mailadres is al geregistreerd."
          : "Probeer het opnieuw."),
    };
  }

  if (data.session) {
    redirect("/onboarding");
  }

  return { message: "Check je e-mail om je registratie te bevestigen." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/wachtwoord-resetten`,
  });

  // Altijd dezelfde melding tonen, ongeacht of het e-mailadres bestaat (voorkomt account-enumeratie).
  return { message: "Als dit e-mailadres bij ons bekend is, ontvang je een link om je wachtwoord te resetten." };
}

export async function updatePassword(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { error: "Wachtwoord moet minimaal 8 tekens bevatten." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Je resetlink is verlopen. Vraag een nieuwe aan." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Wachtwoord bijwerken is mislukt. Probeer het opnieuw." };
  }

  redirect("/dashboard");
}
