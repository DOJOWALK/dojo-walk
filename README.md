# DOJO WALK

**WALK. CARE. TRUST.**

DOJO WALK is a dog-walking service platform for customers, walkers, and administrators.

## Project structure

- `apps/mobile` — Expo / React Native app for Android and iOS.
- `apps/admin` — React web dashboard for administrators.
- `supabase` — database setup notes and migration files.

## Current development status

- [x] Project scaffold for mobile and admin web apps.
- [x] Supabase client configuration templates.
- [x] Admin email/password sign-in with a database role check.
- [x] Admin overview connected to read-only database counts, recent walks, and pending UPI payment entries.
- [x] Mobile phone OTP sign-in screens for customer and walker accounts.
- [x] Customer dog profile creation and package overview (read-only).
- [ ] Customer subscription request, UPI payment submission, and booking screens.
- [x] Walker assigned-walk list with assigned dog details (read-only).
- [x] Walker Start/Stop controls backed by restricted authenticated RPC functions.
- [x] Foreground GPS point capture and background-location task configuration with foreground fallback.
- [x] Customer walk tracking/history screen with latest GPS map link and route point summary.
- [x] Admin live walk/route-history panel with realtime refresh and latest GPS map links.
- [ ] Draw full GPS polylines on embedded maps and test realtime on physical devices.
- [ ] Admin payment verification, walker assignment, pricing, and payout management.
- [ ] End-to-end testing and Android/iOS release builds.

The current screens are development scaffolding, not a production-ready or published app. Customer dog profiles can be added and active packages can be viewed. Subscription activation and payment submission/approval are not yet enabled from the UI. Walker start/stop and GPS capture are coded but have not yet been built or tested on physical Android/iPhone devices. Background GPS requires a native development build and OS permission; Expo Go is not sufficient.

## Business rules captured for implementation

- Standard service: Monday–Saturday; Sunday extra walks are separately billed.
- Packages are attached to each dog independently.
- Initial 30-minute packages: ₹1,800/month for one walk per day, and ₹3,000/month for two walks per day.
- DOJO WALK commission: 20%; walker share: 80%.
- UPI payments are manually verified by an administrator.
- Customers see only their own dogs and walks; walkers see only assigned dogs.
- Live GPS is shared only during an active walk; route history is available to authorized customer and admin accounts.
- A walker can have only one in-progress walk at a time.

## Local development

1. Install a current Node.js LTS release.
2. From the repository root, run `npm install`.
3. Copy `apps/admin/.env.example` to `apps/admin/.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Run `npm run dev:admin` for the admin web app or `npm run dev:mobile` for Expo.

Use the Supabase **publishable key** in client apps. Never use a service-role or secret key in a mobile app, browser app, or committed file.

## Phone OTP setup

The mobile login uses Supabase phone OTP. Before SMS login can work, enable Phone authentication in Supabase Auth and configure a supported SMS provider. Customer sign-in can create a customer account; walker accounts should be created and assigned the walker role by an administrator. A successful OTP alone does not grant walker access—the app checks the profile role.

## Security

Never commit Supabase service-role keys, passwords, OTPs, or other secrets. Client apps use publishable credentials and depend on Row Level Security for data access. Test all RLS policies with separate customer, walker, and admin accounts before launch.
