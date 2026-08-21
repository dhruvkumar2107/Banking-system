# Digital Pigmee — Customer App

Flutter mobile app (Android-first, also builds for web) for the Digital Pigmee
daily micro-savings platform. Customers sign in with a mobile OTP, view their
pigmy account balance and passbook, make daily deposits through the payment
gateway, and manage their profile, nominees, KYC documents and bank details.

## Stack

| Concern        | Choice                                    |
| -------------- | ----------------------------------------- |
| State          | `flutter_riverpod` (no codegen)           |
| Routing        | `go_router` (auth-aware redirect)         |
| HTTP           | `dio` (bearer auth + silent token refresh)|
| Secure storage | `flutter_secure_storage` (tokens)         |
| Prefs          | `shared_preferences` (locale, onboarding) |
| i18n           | Hand-rolled `en` / `hi` map (`lib/l10n`)  |
| Money          | Integer **paise** end-to-end              |

## Project layout

```
lib/
├── core/          config, theme, formatters
├── data/          api_client, models, repositories, token_storage
├── l10n/          strings.dart (en + hi)
├── router/        app_router.dart (go_router + auth redirect)
├── screens/       splash, onboarding, login, otp, register, dashboard,
│                  account detail, pay, pay result, receipt, transactions,
│                  notifications, profile, edit profile, bank details, help
├── state/         providers, auth_controller, data_providers
├── widgets/       shared UI (buttons, cards, paged list, state views, money)
└── main.dart      bootstraps prefs + token storage, then ProviderScope
```

## Money & security conventions

- **All amounts are integer paise.** The API returns `{ paise, rupees, display }`;
  the UI always renders the server-provided `display` string via `MoneyText`.
  The client never computes or formats currency itself.
- **Payments are verified server-side only.** The app creates an order, hands the
  gateway credentials back to the server for verification, and trusts the server's
  verdict — a client "success" is never treated as authoritative.
- **Bank account numbers are shown masked** (`••••` + last 4) via
  `Formatters.maskAccount`.
- Access/refresh tokens live in `flutter_secure_storage`; a `401` triggers one
  transparent refresh-and-replay, and an unrecoverable `401` clears the session
  and redirects to login.

## Configure the API endpoint

`AppConfig.apiBaseUrl` (in `lib/core/config.dart`) already includes the `/api`
prefix and defaults to the Android-emulator loopback `http://10.0.2.2:4000/api`
(which maps to the host's `localhost`). Override at build/run time:

```bash
# Android emulator (default — no flag needed): 10.0.2.2 -> host localhost
flutter run

# Web / desktop / physical device
flutter run --dart-define=API_BASE_URL=http://localhost:4000/api
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4000/api
```

Start the API first (see `apps/api/README.md`): `npm run seed && npm run dev:api`.

## Develop

```bash
flutter pub get
flutter analyze          # 0 issues
flutter test             # boot-to-login smoke test
flutter run              # pick an emulator / device / Chrome
```

## Build

```bash
# Web (release) — no native toolchain required
flutter build web --release
#   output: build/web

# Android APK (release) — requires the Android SDK + JDK 17
flutter build apk --release
#   output: build/app/outputs/flutter-apk/app-release.apk

# Android App Bundle (for Play Store)
flutter build appbundle --release
```

> The release build is currently signed with the **debug** keystore
> (`android/app/build.gradle.kts`) so `flutter run --release` works out of the
> box. Before publishing, add a real signing config — see `docs/DEPLOYMENT.md`.

### Android toolchain (one-time)

The APK build needs a JDK 17 and the Android SDK. Without Android Studio:

```powershell
winget install --id Microsoft.OpenJDK.17 -e
# Download commandline-tools, then:
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
sdkmanager --licenses          # accept all
flutter config --android-sdk C:\Android\sdk
```

## Demo flow

1. Launch → splash → onboarding (first run) → **login**.
2. Enter a seeded mobile number → **Send OTP**. In dev the OTP is echoed back and
   prefilled on the OTP screen.
3. Verify → dashboard with balance + recent activity.
4. **Pay now** → choose amount → sandbox payment → verified server-side → receipt.
5. Profile → manage nominees, KYC documents, bank details; toggle English/हिन्दी.
