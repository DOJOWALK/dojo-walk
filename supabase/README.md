# Supabase project

The DOJO WALK Supabase project already exists and contains the initial schema, dog subscriptions, UPI payment verification records, walker commission and payout tables.

Project reference: `wtmuvexdtjhgoljyozdx`

## Client configuration

Copy the matching `.env.example` to `.env` in each app and add the project's **publishable key**:
- Mobile: `apps/mobile/.env`
- Admin: `apps/admin/.env`

The publishable key is intended for client-side use with Row Level Security. Never put a Supabase secret key or legacy service-role key in either app, GitHub, or a chat.

Do not re-run earlier database setup SQL or recreate existing tables. Inspect live schema and policies before further database changes.

The initial administrator Auth user exists and its profile role is set to `admin`. The dashboard still needs sign-in, role-gated screens, and live-data workflows to be completed and tested.
