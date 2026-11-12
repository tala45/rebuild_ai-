# Running REBUILD AI on Replit

- Main workflow: `npm run dev` on port 5000.
- Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as Replit environment variables.
- Apply `supabase/migrations/20261112000000_initial.sql` in the existing Supabase project's SQL Editor before testing sign-up, materials, listings, reuse/disposal activity, or image storage.
- Configure the Supabase Auth Site URL and callback redirect allow list for the current Replit app URL.
- Do not add a service-role key or commit `.env.local`.
- See `README.md` for the beginner setup and feature limitations.
