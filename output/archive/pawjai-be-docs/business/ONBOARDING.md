# Onboarding Flow - Business Logic

How new users get started with Pawjai.

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Add pet endpoint | ✅ Implemented | `POST /api/pets` |
| Update name | ✅ Implemented | `POST /api/users/onboarding/name` |
| Update demographics | ✅ Implemented | `POST /api/users/onboarding/demographics` |
| Onboarding status | ✅ Implemented | `GET /api/users/onboarding/status` |
| Welcome offer trigger | ✅ Implemented | Triggered from `/api/users/onboarding/finalize`, window set by `OFFER_WINDOW_HOURS` (see `docs/business/OFFERS.md`) |
| Email verification | ✅ Implemented | Handled by Supabase Auth |
| OAuth (Google/Apple) | ✅ Implemented | Web + mobile flows |
| iOS Custom URL Scheme | ✅ Implemented | `pawjai://` for app opening from emails |
| iOS Native Handoff | ✅ Implemented | `/auth/native-handoff` for WebView session setup |

---

## User Journey Overview

```
Sign Up → Add First Pet → Enter Display Name → Complete Demographics (+ TOS) → Dashboard → Start Logging
```

**3-Step Onboarding Flow:**
1. **Add Pet** - Create their first pet profile
2. **Your Name** - Enter display name for personalization
3. **Demographics** - Optional info + required Terms of Service acceptance

---

## Step-by-Step Flow

### 1. Sign Up

**Entry Points:**
- Landing page "Get Started" button
- "Sign Up" link in navigation
- Direct link: `/signup`

**Sign Up Methods:**
1. **Email + Password** (traditional)
2. **Google OAuth** (web + mobile)
3. **Apple OAuth** (web + mobile)

**Email Sign Up Flow:**
1. Enter email address
2. Create password
3. Account created in Supabase Auth
4. Verification email sent by Supabase
5. Click verification link in email → Opens `https://pawjai.co/auth/callback?type=signup#access_token=...`
6. Callback page detects `type=signup` in hash parameters
7. Extracts tokens from URL hash using `getTokensFromUrl()`
8. Manually establishes session using `authService.setSessionFromTokens()`
9. Account activated
10. Redirected to `/auth/onboarding/add-pet` to begin onboarding

**OAuth Sign Up Flow (Web):**
1. Click "Continue with Google" or "Continue with Apple"
2. OAuth provider authenticates user
3. Provider redirects to `/auth/callback` with tokens in URL hash
4. Callback page extracts tokens from hash using `getTokensFromUrl()`
5. Manually establishes session using `authService.setSessionFromTokens()`
6. Account created automatically
7. DisplayName extracted from OAuth provider metadata and saved
8. Redirected to `/auth/onboarding/add-pet` (or `/dashboard` if onboarding complete)

**OAuth Sign Up Flow (iOS App - Custom URL Scheme):**
1. Click OAuth button in mobile app
2. WebView opens Safari for OAuth flow
3. OAuth completes → Supabase redirects to `https://pawjai.co/auth/callback#access_token=...`
4. Safari receives callback URL, detects it's being viewed outside app
5. Callback page attempts to open `pawjai://auth/callback#access_token=...` via custom URL scheme
6. iOS app intercepts custom URL scheme and opens the app
7. App converts `pawjai://` URL back to `https://pawjai.co/auth/callback#access_token=...`
8. WebView navigates to callback URL
9. Callback page detects tokens in hash and establishes session using `authService.setSessionFromTokens()`
10. DisplayName extracted from OAuth provider and saved
11. Redirected to `/auth/native-handoff?access_token=...&refresh_token=...` for mobile session setup
12. Native handoff establishes WebView session and redirects to `/auth/onboarding/add-pet` (first step)

**Account Created:**
- User ID assigned
- Free plan activated by default
- Subscription record created with `plan: 'free'`, `status: 'active'`

---

### 2. Add First Pet (Step 1 of 3)

**Route:** `/auth/onboarding/add-pet`

**Form Fields:**
- Pet name (required)
- Species (required): Dog, Cat, Rabbit, etc.
- Breed (optional)
- Date of birth (optional)
- Gender (optional)
- Weight (optional)
- Photo (optional - can add later)

**Validation:**
- Pet name: 1-50 characters
- Species: Must select from list
- Photo: Max 5MB, JPEG/PNG only

**What Happens on Submit:**
1. Pet created in database
2. Pet ID assigned
3. User metadata updated: `pet_added = true`
4. User redirected to `/auth/onboarding/your-name` (Step 2)

---

### 3. Your Name (Step 2 of 3)

**Route:** `/auth/onboarding/your-name`

**What User Sees:**
- Display name input field
- "What should we call you?" prompt
- Save button

**Form Fields:**
- **Display Name** (required, 2-50 characters)

**What Happens on Submit:**
1. Display name saved to backend (`POST /api/users/onboarding/name`)
2. User metadata updated: `display_name_saved = true`
3. User redirected to `/auth/onboarding/demographics` (Step 3)

---

### 4. Demographics (Step 3 of 3)

**Route:** `/auth/onboarding/demographics`

**What User Sees:**
- Optional demographic information form
- Terms of Service acceptance (required)
- Skip option available

**Form Fields:**
- **Birth Date** (optional)
- **Gender** (optional: Male, Female, Other, Prefer not to say)
- **Phone Number** (optional)
- **Terms of Service** (required checkbox)

**What Happens on Submit:**
1. Demographics saved to backend if provided (`POST /api/users/onboarding/demographics`)
2. TOS acceptance recorded
3. User metadata updated:
   - `tos_accepted = true`
   - `onboarding_completed = true`
4. User redirected to `/dashboard`

---

### 5. Dashboard (First Time)

**What User Sees:**
```
┌──────────────────────────────────────┐
│  Dashboard - Welcome!                │
│                                      │
│  Your pet: Luna 🐱                   │
│                                      │
│  ✨ Quick tips:                      │
│  • Log activities daily              │
│  • Add photos to track growth        │
│  • View timeline to see history      │
│                                      │
│  [Start Logging] →                   │
└──────────────────────────────────────┘
```

**Components:**
- QuickLog widget (ready to use)
- Empty timeline (no records yet)
- Tips banner (dismissable)

---

### 6. First Log (QuickLog)

**What User Sees:**
```
QuickLog Widget:
┌──────────────────────────────────────┐
│  Quick Log                           │
│                                      │
│  Pet: Luna ▼                         │
│  Type: Activity ▼                    │
│  Date: Today ▼                       │
│  Notes: [                          ] │
│                                      │
│  [Save Log]                          │
└──────────────────────────────────────┘
```

**User Actions:**
1. Select pet (auto-selected if only 1 pet)
2. Select record type (Activity, Symptom, Vet Visit, Medication)
3. Select date (defaults to today)
4. Add notes (optional)
5. Click "Save Log"

**What Happens:**
1. Record saved to database
2. Timeline updated
3. Success toast: "Activity logged! 🎉"
4. Form resets (ready for next log)

---

### 6. Explore Timeline

**After First Log:**
```
Timeline Page:
┌──────────────────────────────────────┐
│  Timeline - Luna                     │
│                                      │
│  📅 Nov 9, 2025                      │
│  ────────────────────────────────    │
│  🐾 Activity                         │
│  Played fetch in the park            │
│  2:30 PM                             │
│                                      │
│  [Add Photo] [Edit] [Delete]         │
└──────────────────────────────────────┘
```

**Features Highlighted:**
- Chronological list of all records
- Filter by pet (if multiple)
- Filter by type (Activity, Symptom, etc.)
- Add photos to records

---

## Onboarding Completion

**Considered "Onboarded" When (`userService.getOnboardingStatus`):**
- ✅ Display name saved
- ✅ At least 1 pet added
- ✅ Terms of Service accepted

No record needs to be logged for onboarding to be marked complete.

**Post-Onboarding:**
- Tips banner can be dismissed
- User has full access to all Free features
- Can explore Premium features (with upgrade prompts)

---

## Upgrade Prompts During Onboarding

### When Free Users See Upgrade Prompts

**1. After Creating First Pet:**
- Small banner: "Want to track more pets? Upgrade to Premium!"

**2. Trying to Add 2nd Pet:**
- Modal dialog blocks action
- Explains Free limit (1 pet)
- Shows upgrade button

**3. Viewing Timeline:**
- Info banner: "Premium users get unlimited history (you: 3 months)"

---

## Special Onboarding Offers

### Welcome Offer
**Trigger:** Hybrid approach (primary + fallback)
**Duration:** `OFFER_WINDOW_HOURS` from signup date (account creation), default 72 hours -- see `docs/business/OFFERS.md`
**Discount:** 50% off first year

**How it Works:**
1. **Primary Trigger:** When user completes onboarding (`/api/users/onboarding/finalize`)
2. **Fallback Trigger:** When free user visits /tier page (`/api/offers/active`)

**Key Points:**
- Offer window is calculated from **signup date**, not trigger time
- `user_config.welcome_offer_triggered` flag ensures only one trigger per user
- If user signs up and waits longer than the offer window before triggering, no offer is created
- Cooldown (`OFFER_COOLDOWN_DAYS`, default 30 days) still applies after offer expires/redeems

**Banner:**
```
┌──────────────────────────────────────┐
│ 🎉 Welcome Offer!                    │
│ Get 50% off Premium for first year  │
│ Offer expires in 2 days, 12 hours   │
│                                      │
│ [Claim Offer] →                      │
└──────────────────────────────────────┘
```

---

## Onboarding Analytics

### Metrics Tracked
- Signup completion rate (verified / started)
- Time to first pet (signup → pet created)
- Time to first log (signup → first record)
- Onboarding drop-off points

### Drop-off Points to Monitor
1. Email verification (didn't click link)
2. Add pet form (abandoned mid-form)
3. First log (never logged anything)

---

## Multi-Pet Onboarding (Premium)

**For Premium Users During Signup:**
- Can add multiple pets immediately (up to 10)
- "Add Another Pet" button after first pet
- No upgrade prompts

**Flow:**
```
Sign Up → Add Pet 1 → Add Pet 2 (optional) → Add Pet 3 (optional) → Dashboard
```

---

## Email Verification

### Verification Email
**Sent by:** Supabase Auth
**Subject:** "Verify your Pawjai account"
**Link:** Valid for 24 hours

**Content:**
```
Welcome to Pawjai! 🐾

Please verify your email address to start tracking your pet's health.

[Verify Email] →

This link expires in 24 hours.
```

**Technical Flow:**
- Link format: `https://pawjai.co/auth/callback?type=signup#access_token=...&refresh_token=...`
- Callback page checks for `type=signup` in URL hash
- Extracts tokens from hash and manually establishes session
- Works on both web and iOS app (via custom URL scheme)

### If Link Expires
**User Action:** Click "Resend verification email" in app
**System:** Sends new verification email
**Limit:** Max 3 resends per hour (prevent abuse)

---

## Password Recovery

### Recovery Email
**Sent by:** Supabase Auth
**Subject:** "Reset your Pawjai password"
**Link:** Valid for 1 hour

**Flow:**
1. User clicks "Forgot password" on sign-in page
2. Enters email address
3. Supabase sends recovery email with link
4. Link format: `https://pawjai.co/auth/callback?type=recovery#access_token=...&refresh_token=...`
5. Callback page detects `type=recovery` in URL or hash
6. Extracts tokens from URL hash
7. Redirects to `/auth/reset-password` with tokens as query params
8. User enters new password
9. Session established with new credentials

**iOS App Support:**
- Recovery link opens in Safari
- Custom URL scheme redirects to app: `pawjai://auth/callback?type=recovery#...`
- App reopens WebView with callback URL
- Same token extraction and session flow as web

---

## Localization (Thai/English)

### Language Selection
**During Signup:**
- Auto-detect from browser language
- Manual toggle in top-right corner

**Supported Languages:**
- 🇬🇧 English (default)
- 🇹🇭 Thai (ภาษาไทย)

**Onboarding Text:**
- All UI text translatable
- Form labels, buttons, tooltips
- Error messages

---

## Common Questions

**Q: Do I need to add a pet immediately?**
A: Yes. You can't use the app without at least 1 pet.

**Q: Can I skip email verification?**
A: No. Verification required for account security.

**Q: Can I add multiple pets during signup?**
A: Free users: 1 pet. Premium users: Up to 10 pets.

**Q: What if I don't get the verification email?**
A: Check spam folder. Click "Resend email" if needed.

**Q: Can I change my pet's info later?**
A: Yes. Go to My Pets → Click pet → Edit details.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/users/onboarding/name` | Update display name |
| `POST` | `/api/users/onboarding/demographics` | Update phone, birthdate, gender |
| `GET` | `/api/users/onboarding/status` | Check onboarding completion status |
| `POST` | `/api/users/onboarding/finalize` | Save TOS consent, mark onboarding complete, trigger welcome offer |
| `POST` | `/api/users/onboarding/track` | Track an onboarding analytics event (hydration recovery) |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/routes/users-onboarding.ts` | Onboarding API endpoints |
| `src/services/scheduledOfferService.ts` | Welcome offer trigger (hybrid approach) |
| `src/services/userConfigService.ts` | User config flags (welcome_offer_triggered) |
| `src/services/userService.ts` | User profile management |
| `src/routes/offers.ts` | Offers API (includes fallback trigger in /active) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WELCOME_OFFER_ENABLED` | `true` | Enable welcome offers after onboarding |
| `OFFER_WINDOW_HOURS` | `72` | Unified offer duration (3 days) |

**Note:** `WELCOME_OFFER_WINDOW_HOURS` has been deprecated. Use `OFFER_WINDOW_HOURS` instead.

---

## iOS App Integration (Custom URL Scheme)

### Custom URL Scheme Configuration
**Scheme:** `pawjai://`
**Purpose:** Enable deep linking from Safari to iOS app for email confirmation and OAuth callbacks

### How It Works

**1. Configuration Files:**
- `Info.plist` - Registers `pawjai://` URL scheme
- `PawjaiMobileApp.swift` - Handles incoming URLs with `.onOpenURL()` modifier
- `.well-known/apple-app-site-association` - Universal Links config (backup method)

**2. Authentication Flow:**
```
User clicks email link in Mail app
  ↓
Safari opens: https://pawjai.co/auth/callback#access_token=...
  ↓
Callback page detects iOS Safari (not in app)
  ↓
Page attempts: window.location.href = "pawjai://auth/callback#access_token=..."
  ↓
iOS intercepts custom URL scheme
  ↓
App launches and receives URL via .onOpenURL()
  ↓
App extracts tokens from URL
  ↓
App reopens WebView with original callback URL
  ↓
WebView processes callback normally (establishes session)
```

**3. Token Extraction:**
- Callback page uses `getTokensFromUrl()` utility
- Checks both URL hash and query parameters
- Hash format: `#access_token=...&refresh_token=...&type=signup`
- Manually establishes session via `authService.setSessionFromTokens()`

**4. Universal Links (Alternative):**
- Configured via AASA file at `/.well-known/apple-app-site-association`
- Domain: `pawjai.co`
- Paths: `/auth/callback`, `/auth/*`
- Associated Domains entitlement in Xcode
- Currently **not primary method** due to iOS inconsistencies
- Custom URL scheme is more reliable

### Supported Auth Flows
- ✅ Email signup confirmation
- ✅ Password recovery
- ✅ OAuth (Google/Apple) signin/signup
- ✅ All flows work on both web and iOS app

---

## Technical Implementation Details

### Token Extraction from URL Hash

**Why Hash Instead of Query Params?**
Supabase Auth uses URL hash (`#`) for security - tokens don't get sent to server logs.

**Extraction Logic:**
```typescript
// lib/utils/authSession.ts
export function getTokensFromUrl() {
  // Check hash first (Supabase default)
  const hash = window.location.hash.substring(1);
  const hashParams = new URLSearchParams(hash);

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (accessToken && refreshToken) {
    return { accessToken, refreshToken };
  }

  // Fallback to query params
  const searchParams = new URLSearchParams(window.location.search);
  return {
    accessToken: searchParams.get('access_token'),
    refreshToken: searchParams.get('refresh_token')
  };
}
```

### Manual Session Establishment

**Why Manual?**
For iOS app custom URL scheme flow, Supabase client doesn't automatically detect session from hash.

**Implementation:**
```typescript
// lib/services/authService.ts
async setSessionFromTokens(accessToken: string, refreshToken: string) {
  const { data, error } = await this.supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (error) throw error;
  return data.session;
}
```

**Used In:**
- Email confirmation callback (`type=signup`)
- OAuth callback (web + iOS app)
- Password recovery callback (`type=recovery`)

### Middleware Authentication Logic

**File:** `pawjai-client/middleware.ts`

**Key Decision - No Step Validation:**
Middleware does NOT validate individual onboarding steps due to JWT metadata staleness.

**Why?**
```
Problem: JWT metadata has a delay in updating (can take seconds to refresh)

Race condition:
1. User completes step → Backend saves data → Frontend navigates to next step
2. Middleware checks JWT → Metadata not refreshed yet → Redirects back
3. User stuck in loop, requires multiple submissions

Solution: Middleware only checks if onboarding is complete, not individual steps
```

**What Middleware Does:**
```typescript
// Only checks high-level onboarding status
const isOnboarded = isOnboardedFromMetadata(meta);

if (!isOnboarded && !isOnboardingRoute) {
  // Redirect to first incomplete step
  const incompleteStep = getIncompleteOnboardingStep(meta);
  redirect(incompleteStep);
}
```

**What Middleware Does NOT Do:**
- ❌ Validate if user is on "correct" onboarding step
- ❌ Redirect between onboarding steps based on JWT
- ❌ Check if pet is added, displayName is saved, etc.

**Step Validation Handled By:**
- Individual page `useEffect` hooks check metadata
- Backend API validates data before saving
- Frontend only navigates after successful backend response

---

### Race Condition Fix: SessionStorage Flags

**Problem:** JWT metadata refresh delay causes redirect loops between onboarding steps.

**Solution:** Use sessionStorage flags to bypass redirect checks immediately after form submission.

**How It Works:**
1. User submits form (e.g., add pet)
2. Backend saves data successfully
3. Frontend sets `sessionStorage.setItem("justCompletedPet", "true")`
4. Frontend navigates to next step (`/auth/onboarding/your-name`)
5. Next page checks for flag:
   - If flag exists → Remove it and skip redirect check
   - If no flag → Check JWT metadata and redirect if incomplete
6. This allows immediate navigation while JWT refreshes in background
7. On subsequent visits, normal metadata-based redirect logic applies

**Active Flags:**
- `justCompletedPet` - Set by AddPetForm, checked by your-name page
- `justCompletedName` - Set by your-name page, checked by demographics page

**Cleanup:**
- Flags are automatically removed after first check
- Flags are cleared on sign out for clean state

**Benefits:**
- ✅ No waiting for JWT refresh (instant navigation)
- ✅ No infinite redirect loops
- ✅ Users can still resume incomplete onboarding (metadata checks)
- ✅ Self-cleaning (flags removed after use)

**For technical details, see:**
- `pawjai-client/docs/technical/ONBOARDING_NAVIGATION.md` - Full technical implementation

---

**For additional technical details, see:**
- `src/routes/users-onboarding.ts` - Onboarding endpoints
- `src/services/scheduledOfferService.ts` - Welcome offer logic
- `pawjai-client/app/auth/callback/page.tsx` - Token extraction and session establishment
- `pawjai-client/middleware.ts` - Authentication middleware
- `pawjai-client/lib/utils/authSession.ts` - Token extraction utilities
- `PawjaiMobile/PawjaiMobile/Info.plist` - iOS custom URL scheme config
- `PawjaiMobile/PawjaiMobile/PawjaiMobileApp.swift` - iOS URL handler
