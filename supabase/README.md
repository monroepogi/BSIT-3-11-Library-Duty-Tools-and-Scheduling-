# VITS Supabase Database Setup

## 1. Establish the Database

### Option A: Hosted Supabase Project
1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Open **SQL Editor** and run [`migrations/20261126000001_initial_schema.sql`](./migrations/20261126000001_initial_schema.sql).
3. Run [`seed.sql`](./seed.sql) to populate initial library sections, profiles, shifts, tasks, duty requests, attendance logs, and visitor entries.
4. Copy your **Project URL** and **anon (publishable) key** from **Project Settings -> API**.

### Option B: Local Supabase CLI
```bash
supabase start
supabase db reset
```

## 2. Configure the Ionic App
Update `supabase.url` and `supabase.anonKey` in:
- `apps/mobile/src/environments/environment.ts` (local/dev)
- `apps/mobile/src/environments/environment.prod.ts` (production)

## 3. Production Hardening
`20261126000001_initial_schema.sql` includes `anon` demo policies so quick role sign-in works immediately during development. Once you provision real users in **Authentication -> Users**, drop the `Anon demo *` policies so only `authenticated` users can access tables.
