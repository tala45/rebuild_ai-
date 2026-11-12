# REBUILD AI

REBUILD AI helps individuals, students, workshops, and engineering teams record surplus materials and choose a practical next step: sell, reuse, or dispose responsibly.

This project uses the Next.js App Router and Supabase. Analysis and assistant replies are rule-based; they do not use an external AI service or analyze images. The app does not process payments or confirm recycling automatically.

## What works

- Email sign-up, sign-in, session cookies, email verification callback, sign-out, and password-reset email flow through Supabase Auth.
- Private material records with category, description, quantity, condition, and approximate location.
- Private image upload to the `material-uploads` Supabase Storage bucket (JPEG, PNG, or WebP up to 5 MB).
- Cautious, rule-based material suggestions with uncertainty and safety limitations.
- Marketplace listings, search by name/category, seller-managed listing state/price/fulfillment, and buyer order requests.
- Order request acceptance and two-party completion confirmation. A listing is marked sold only after both people confirm completion. No payment is taken.
- Reuse project suggestions, saved plans, and planned/completed reuse or disposal actions.
- A basic assistant that uses the signed-in user’s material records and rule-based guidance.
- Dashboard counts based on saved records. Planned and completed activities are counted separately.
- Row Level Security (RLS) on user-related tables and private storage policies.

Environmental savings, structural integrity, electrical safety, and chemical composition are not calculated or inferred.

## Technology

- Next.js App Router, React, and TypeScript
- Next.js Route Handlers with Zod input validation
- Supabase Auth, PostgreSQL, and Storage
- Rule-based analysis; no paid AI, payment, or maps API

## Run in Replit

1. Add the two public Supabase values as Replit environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
2. Apply the SQL migration described below.
3. Start the `Start application` workflow, or run `npm run dev`.
4. Open the app preview. `/` is public; `/dashboard` requires a verified Supabase session.

For local development, copy `.env.example` to `.env.local` and enter the public project URL and publishable key. Never commit `.env.local`.

## Supabase setup

The application is intended to use the existing Supabase project. No service-role key or database password is needed by the application.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase client publishable key; RLS still applies | No |

No private server key is used. `.env.example` contains placeholders only.

## Project structure

- `app/` — pages, layouts, and Route Handlers
- `components/` — shared presentation and authentication components
- `lib/analysis.ts` — rule-based material analysis and assistant guidance
- `lib/supabase/` — browser and server Supabase clients
- `supabase/migrations/` — PostgreSQL schema, policies, trigger, and storage setup

## Security and privacy

- The browser uses only the publishable key. Supabase RLS is required and must remain enabled.
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

Authentication, database writes, storage uploads, and RLS behavior require the migration and Auth redirect configuration to be applied to the existing Supabase project. They should be checked with two separate Supabase accounts before public use. No production deployment has been configured.

## GitHub

The connected GitHub repository is `https://github.com/tala45/rebuild_ai-`. Keep `.env`, `.env.local`, secrets, and database contents out of commits. GitHub stores source code only; Supabase provides the database, authentication, and storage.

## Free-tier limitations

This app makes no paid AI calls, payments, map lookups, or paid hosting setup. Supabase Free quotas and email delivery limits can change; check the current project dashboard before inviting users. The Replit preview is for development and does not by itself guarantee permanent public hosting.
