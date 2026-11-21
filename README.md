# DOJO WALK

**WALK. CARE. TRUST.**

DOJO WALK is a dog-walking service platform for customers, walkers, and administrators.

## Project structure

- `apps/mobile` — Expo / React Native app for Android and iOS.
- `apps/admin` — React web dashboard for administrators.
- `supabase` — database migrations, policies, and configuration (to be added in the next setup phase).

## Current setup

This repository contains the initial project scaffold. The mobile app, admin dashboard, authentication screens, GPS tracking, and payment workflows are not yet production-ready.

## Business rules captured for implementation

- Standard service: Monday–Saturday; Sunday extra walks are separately billed.
- Packages are attached to each dog independently.
- Initial 30-minute packages: ₹1,800/month for one walk per day, and ₹3,000/month for two walks per day.
- DOJO WALK commission: 20%; walker share: 80%.
- UPI payments are manually verified by an administrator.
- Customers see only their own dogs and walks; walkers see only assigned dogs.
- Live GPS is shared only during an active walk; route history is available to authorized customer and admin accounts.

## Local development

Install Node.js LTS, then install dependencies from the relevant app folder. Setup instructions will be expanded as each app is implemented.

## Security

Never commit Supabase service-role keys, passwords, OTPs, or other secrets. Client apps must use only publishable/anon credentials with Row Level Security enabled.
