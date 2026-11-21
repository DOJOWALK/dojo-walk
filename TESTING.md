# DOJO WALK local build and device test checklist

The GitHub repository stores source code; it does not build or publish the apps automatically. Run these checks on a computer with Node.js/npm installed.

## 1. Install dependencies

From the repository root:

```bash
npm install
```

## 2. Configure Supabase client keys

Copy the example environment files to local files (do not commit the local files):

- Admin: `apps/admin/.env.example` → `apps/admin/.env`
- Mobile: `apps/mobile/.env.example` → `apps/mobile/.env`

Set the Supabase project URL and **publishable** client key in each file. Do not put a Supabase service-role key or secret key in either app.

## 3. Build the Admin dashboard

```bash
npm run build:admin
```

Then optionally preview the production build:

```bash
npm run preview --workspace @dojowalk/admin
```

## 4. Check the Expo mobile project

From the repository root:

```bash
cd apps/mobile
npx expo install --check
npx expo-doctor
```

If Expo reports a package version mismatch, use the Expo-recommended version rather than forcing an arbitrary version.

## 5. Native device builds

The embedded mobile map uses `react-native-maps`. Android release builds require a Google Maps SDK API key configured through the native app configuration/build environment. Keep that key out of Git and chat; use a restricted key with Android package/signing-certificate restrictions. iOS uses the native Apple map provider unless a Google Maps iOS key/provider is configured.

For a local Android device/emulator with Android Studio and SDK installed:

```bash
cd apps/mobile
npx expo prebuild --platform android
npx expo run:android
```

For iOS, use macOS with Xcode:

```bash
cd apps/mobile
npx expo prebuild --platform ios
npx expo run:ios
```

A development build is required for background location testing; Expo Go is not a substitute for validating background GPS.

## 6. Physical-device acceptance checklist

- Sign in as a walker assigned to a test dog.
- Start a walk and grant foreground/background location permissions.
- Keep the app in the background for part of the walk; confirm location points continue to arrive.
- Stop the walk; confirm actual start/end times, duration, report, and GPS points are saved.
- Sign in as the owning customer; confirm only that customer's dog and route are visible.
- Sign in as Admin; confirm the active route updates and completed route history is visible.
- Deny location permission and disable network; confirm the app explains GPS is unavailable/incomplete and does not falsely show a complete route.
- Verify that walkers cannot read another walker's assigned dogs and customers cannot read another customer's routes.

Map tiles and live route refresh require internet access. GPS accuracy and background behavior must be verified on real devices before launch.
