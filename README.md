# REBUILD AI

REBUILD AI helps individuals, students, workshops, and engineering teams record surplus materials and choose a practical next step: sell, reuse, or dispose responsibly.

The app runs in browser-only demo mode by default, with optional Supabase integration. Analysis and assistant replies are rule-based; they do not use an external AI service or analyze images. The app does not process payments or confirm recycling automatically.

## What works

- Sample seller and buyer profiles, plus local profile creation and switching in the same browser.
- Browser-local material records with category, description, quantity, condition, approximate location, and optional photo.
- Cautious, rule-based material suggestions with uncertainty and safety limitations.
- Marketplace listings, search by name/category, seller-managed listing state/price/fulfillment, and buyer order requests.
- Order request acceptance and two-party completion confirmation. A listing is marked sold only after both people confirm completion. No payment is taken.
- Reuse project suggestions, saved plans, and planned/completed reuse or disposal actions.
- A basic assistant that uses the signed-in user’s material records and rule-based guidance.
- Dashboard counts based on saved records. Planned and completed activities are counted separately.
- Optional Supabase Auth, PostgreSQL, private storage, and RLS when explicitly enabled.

In local demo mode, records and photos stay in this browser and are not private or shared across devices. Do not enter real personal, business, or sensitive information. Local profiles do not use passwords, email verification, or password reset.

Environmental savings, structural integrity, electrical safety, and chemical composition are not calculated or inferred.

## Technology

- Next.js App Router, React, and TypeScript
- Browser `localStorage` for the demo; Supabase Auth, PostgreSQL, and Storage remain optional
- Rule-based analysis; no paid AI, payment, or maps API

## Run in Replit

1. Start the `Start application` workflow, or run `npm run dev`.
2. Open the app preview and choose **Try the demo**. Use the sample seller and buyer profiles to exercise listings and two-sided handoffs.

Supabase is not required for the browser demo. To opt in to the existing Supabase-backed mode, set `NEXT_PUBLIC_REBUILD_DATA_MODE=supabase`, add the public URL and publishable key, then follow the optional setup below.

## Supabase setup

Supabase mode is optional and must be explicitly enabled with `NEXT_PUBLIC_REBUILD_DATA_MODE=supabase`. No service-role key or database password is needed by the application.

1. In the Supabase project dashboard, open **SQL Editor**.
2. Open `supabase/migrations/20261112000000_initial.sql` in this repository, copy its contents, and run it once.
3. In **Authentication → URL Configuration**, set the Site URL to the app’s current URL and add the app’s Replit development URL plus `/auth/callback` to the redirect allow list. Add the production URL only if you later configure one.
4. In **Authentication → Providers → Email**, leave email verification enabled. Supabase’s default email sender is rate-limited; configure an SMTP provider only if you need reliable email delivery.
5. In Replit, add the URL and publishable key through **Tools → Secrets** (or the project’s environment-variable controls). Do not add a service-role key.
6. Restart the application workflow after changing environment values.

The SQL migration creates tables, indexes, RLS policies, a profile trigger, public reuse suggestions, and the private `material-uploads` storage bucket with ownership policies. The migration has not been applied automatically by this project, so database and storage behavior must not be considered live until you run it and verify a sign-up.

## Environment variables

| Name | Purpose | Sensitive? |
| --- | --- | --- |
| `NEXT_PUBLIC_REBUILD_DATA_MODE` | `local` (default) or `supabase` | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase client publishable key; RLS still applies | No |

No private server key is used. `.env.example` contains placeholders only.

## Project structure

- `app/` — pages, layouts, and Route Handlers
- `components/` — shared presentation and authentication components
- `lib/analysis.ts` — rule-based material analysis and assistant guidance
- `lib/demo-workspace.ts` — browser-local demo profiles and marketplace data
- `lib/supabase/` — browser and server Supabase clients
- `supabase/migrations/` — PostgreSQL schema, policies, trigger, and storage setup

## Security and privacy

- Local demo mode is not private or secure; anyone using the same browser profile can inspect or change its data. Do not use it for real user data.
- In Supabase mode, the browser uses only the publishable key. Supabase RLS is required and must remain enabled.
- User-owned material data and private uploaded files are constrained to the authenticated user.
- Marketplace listing rows and listed material descriptions are readable publicly; approximate locations should be used, not private addresses.
- Profile records contain only a display name and timestamps. Do not add email addresses or private contact details to public profile fields.
- Order completion requires both buyer and seller to confirm. Order requests do not automatically mark a listing sold.
- Image content is not sent to an AI service. A photo cannot establish whether a material is safe or suitable for a project.

## Testing and verification

Run:

```sh
npm run typecheck
npm run build
```

`npm run typecheck` and `npm run build` check the app code. The Supabase migration has not been applied or verified against the existing project; real authentication, database writes, storage, and RLS behavior remain unverified. No production deployment has been configured.

## GitHub

Keep `.env`, `.env.local`, secrets, and any local database contents out of commits. GitHub stores source code only; browser demo records stay in the browser.

## Free-tier limitations

This app makes no paid AI calls, payments, map lookups, or paid hosting setup. Supabase Free quotas and email delivery limits can change; check the current project dashboard before inviting users. The Replit preview is for development and does not by itself guarantee permanent public hosting.
