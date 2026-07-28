# Boekhouder Mes

Productie-webapp voor zelfstandig ondernemers (ZZP/eenmanszaak/VOF/BV) om hun eigen boekhouding
bij te houden zonder externe boekhouder. Geen officiële belastingaangifte, geen vervanging van
een boekhouder — een hulpmiddel voor overzicht, automatische BTW-indicatie en AI-inzichten op
basis van geüploade facturen/bonnen.

**Status:** Fase A afgerond — project setup, volledige Supabase Auth-flow (registratie, login,
wachtwoord-reset, e-mailbevestiging) en onboarding met automatische BTW-tariefsuggestie. Het
scannen van facturen/bonnen, dashboard en AI-tips volgen in Fase B.

## Setup

1. **Dependencies installeren**
   ```bash
   npm install
   ```

2. **Supabase-project aanmaken** op [supabase.com](https://supabase.com), en:
   - Voer de migratie uit: kopieer de inhoud van `supabase/migrations/0001_init.sql` naar de
     Supabase SQL editor en run deze. Dit maakt alle tabellen, enums, RLS-policies en de
     `documents` storage-bucket aan.
   - Ga naar **Authentication → URL Configuration** en zet de Site URL + Redirect URLs op je
     lokale/productie-URL (bijv. `http://localhost:3000/**`) zodat bevestigings- en
     reset-e-mails naar de juiste plek linken.

3. **Environment variables**: kopieer `.env.example` naar `.env.local` en vul in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Settings → API
   - `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com/)
   - `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` lokaal, je echte domein in productie

4. **Dev server starten**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Belangrijk

Deze applicatie doet geen belastingaangifte en is geen vervanging voor een boekhouder of
fiscalist. Alle AI-output rond BTW en aftrekbaarheid is een indicatie, geen garantie.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) ·
Anthropic Claude (vision-extractie, BTW-tariefsuggestie, tips) · Recharts
