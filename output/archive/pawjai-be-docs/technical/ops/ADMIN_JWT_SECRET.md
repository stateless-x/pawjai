# ADMIN_JWT_SECRET

## Overview

`ADMIN_JWT_SECRET` is the secret key used to sign and verify JWT tokens for admin authentication. This is **required** in production and must be kept secure.

---

## Usage

### Location
- **Middleware:** `src/middleware/adminAuth.ts`
- **Service:** `src/services/adminAuthService.ts`

### Operations

1. **Token Signing** (`generateAdminToken`)
   - Called during admin login (`/api/admin/auth/login`)
   - Creates JWT with 24-hour expiration (`ADMIN_TOKEN_TTL_MS` in `src/middleware/adminAuth.ts`;
     down from a prior 7-day TTL)
   - Payload: `{ adminId, email, role, jti }` -- `jti` identifies the row in `admin_sessions`

2. **Token Verification** (`requireAdmin` middleware)
   - Used on all protected admin routes
   - Verifies signature and expiration
   - Requires a `jti` claim; tokens issued before session tracking shipped are rejected
   - Looks up the `admin_sessions` row by `jti` and rejects if missing, revoked
     (`revokedAt` set), or past `expiresAt` -- so a session can be invalidated server-side
     before the JWT itself expires
   - Validates admin exists and is active
   - Loads admin permissions from database

### Protected Routes

All admin routes require authentication:
- `/api/admin/users/*` - User management
- `/api/admin/subscriptions/*` - Subscription operations
- `/api/admin/analytics/*` - Analytics data
- `/api/admin/admins/*` - Admin management
- `/api/admin/auth/me` - Current admin info
- `/api/admin/auth/logout` - Logout action

---

## Configuration

### Environment Variable
```bash
ADMIN_JWT_SECRET=your-secret-key-here
```

### Development
- Defaults to `'dev-secret-key'` if not set
- **Warning:** Never use default in production

### Production
- **Required** - Server will throw error on startup if:
  - Variable is not set, OR
  - Variable equals `'dev-secret-key'`

### Generating a Secret

**Option 1: Admin Panel (Recommended)**
1. Log in as super admin
2. Go to Settings → JWT Secret
3. Click "Generate Secret"
4. Copy the secret or environment variable
5. Paste into your environment configuration

**Option 2: Command Line Script**
```bash
bun run scripts/generate-jwt-secret.ts
```

Both methods generate a cryptographically secure random string (64 bytes, base64url encoded) suitable for production use.

**What happens if you generate but don't use it?**

If you generate a secret but don't update the `ADMIN_JWT_SECRET` environment variable:
- ✅ **Nothing breaks** - Backend continues using the old secret
- ✅ **All existing sessions work** - No disruption to current admins
- ✅ **New logins work** - Still signed with the old secret
- ℹ️ The generated secret is just unused - safe to generate a new one anytime

**The secret only takes effect after:**
1. Updating the environment variable
2. Restarting the backend server

---

## Token Flow

```
1. Admin submits credentials -> POST /api/admin/auth/login
2. Backend verifies email/password
3. Backend generates JWT using ADMIN_JWT_SECRET (24-hour expiration) and creates
   a matching admin_sessions row keyed by jti
4. Token returned to frontend
5. Frontend stores token in localStorage
6. Frontend sends token: Authorization: Bearer <token>
7. Backend verifies token signature/expiration and checks the admin_sessions row
   for the token's jti is not revoked or expired
8. Backend loads admin + permissions from database
9. Request proceeds with admin context
```

---

## Security

### Requirements
- ✅ Use strong, random secret (64+ characters recommended)
- ✅ Never commit secret to version control
- ✅ Rotate secret if compromised
- ✅ **Use different secrets per environment** (dev/staging/prod) - **Required**

### Environment Isolation

**Why different secrets per environment?**

1. **Security isolation** - If staging secret is compromised, production remains secure
2. **Prevent cross-environment access** - Tokens from staging won't work in production
3. **Accident prevention** - Prevents accidentally using staging tokens in production
4. **Compliance** - Industry best practice for environment separation

**Setup:**
- **Development:** `'dev-secret-key'` (default) or custom secret
- **Staging:** Generate unique secret with `bun run scripts/generate-jwt-secret.ts`
- **Production:** Generate unique secret with `bun run scripts/generate-jwt-secret.ts`

**⚠️ Never share secrets between environments**

### Token Details
- **Expiration:** 24 hours (tokens expire, not the secret) -- shorter TTL limits the window a
  stolen token is useful; the `admin_sessions` table handles revocation within that window
- **Storage:** Frontend localStorage (consider httpOnly cookies for enhanced security)
- **Validation:** Signature + expiration + `admin_sessions` lookup (revoked/expired check)
- **Refresh:** No automatic refresh - admins re-login when token expires

### Rotation

**Important:** The JWT secret should be **stable** and **not changed frequently**.

- ✅ **Set once** - Generate a strong secret and keep it
- ✅ **Only rotate if compromised** - If secret is leaked/stolen
- ❌ **Don't rotate regularly** - Changing it invalidates ALL existing tokens

**Token Expiration vs Secret Rotation:**
- **Tokens expire** after 24 hours -> Admins re-login (automatic)
- **Secret rotation** -> Invalidates ALL tokens immediately (only if compromised)

**What happens if you change the secret periodically in production:**

⚠️ **Not Recommended** - Changing the secret regularly causes:

1. **Immediate session invalidation** - ALL admin sessions become invalid instantly
2. **Forced re-login** - Every admin must log in again immediately
3. **Service disruption** - Any in-progress admin operations will fail
4. **No gradual migration** - Unlike token expiration, there's no grace period
5. **Operational overhead** - Requires coordination and communication with all admins

**When to rotate:**
- ✅ Secret is compromised (leaked, stolen, exposed)
- ✅ Security audit requires it
- ✅ Moving to a new infrastructure setup
- ❌ **NOT** for regular security maintenance (tokens already expire)

**If secret is compromised:**
1. Generate new secret (use admin panel or `bun run scripts/generate-jwt-secret.ts`)
2. Update `ADMIN_JWT_SECRET` environment variable
3. Restart backend server
4. All existing tokens become invalid (admins must re-login)
5. Notify all admins to re-authenticate

---

## Related Files

- `src/middleware/adminAuth.ts` - JWT signing/verification logic
- `src/services/adminAuthService.ts` - Login service
- `src/routes/admin/auth.ts` - Auth endpoints
- `scripts/generate-jwt-secret.ts` - Secret generator

---

## Frontend Integration

The frontend (`pawjai-admin`) does **not** need this secret. It only:
- Receives tokens from backend
- Stores tokens in localStorage
- Sends tokens in Authorization headers

Token verification is handled entirely by the backend.

