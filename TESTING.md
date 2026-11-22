# DOJO WALK local build and device test checklist

The repository contains source code; builds and physical-device validation have not yet been run for this integration.

## 1. Install dependencies

From the repository root:

```bash
npm install
```

## 2. Configure Supabase client keys

Use the example environment files for Admin and Mobile. Keep local environment files out of Git. Use only the Supabase publishable client key in app clients; never put a service-role or secret key in either app.

## 3. Build Admin

```bash
npm run build:admin
```

## 4. Check Expo mobile dependencies

```bash
cd apps/mobile
npx expo install --check
npx expo-doctor
```

Use Expo-recommended package versions if a compatibility mismatch is reported.

## 5. Android native map setup

The mobile embedded map uses `react-native-maps`. Android production builds need a Google Maps SDK API key configured through the native app configuration/build environment. Restrict the key to the Android package and signing certificate. Do not commit or share the key in chat.

A native development build is required to validate background location; Expo Go is not sufficient.

## 6. Physical-device acceptance

- Sign in as a walker assigned to a test dog.
- Start a walk and grant foreground/background location permissions.
- Keep the app in the background for part of the walk and confirm GPS points continue to arrive.
- Stop the walk and confirm actual times, duration, report, and GPS points are saved.
- Sign in as the owning customer and confirm only that customer's dog and route are visible.
- Sign in as Admin and confirm active route updates and completed route history.
- Deny location permission and disable network; confirm the app does not falsely show a complete route.
- Verify customer/walker row-level access boundaries with separate test accounts.
- Confirm embedded route polylines and start/end markers render correctly on a physical Android device.

Map tiles and live route refresh require internet access. GPS accuracy and background behavior must be verified on real devices before launch.
