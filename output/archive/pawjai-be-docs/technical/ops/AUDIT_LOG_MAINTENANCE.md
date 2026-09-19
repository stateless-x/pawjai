# Audit Log Maintenance Guide

## Overview

The audit log tracks all admin actions for security and compliance. It's designed to be lightweight and self-maintaining.

**Key Principles:**
- ✅ **Lightweight** - Fire-and-forget logging, never blocks operations
- ✅ **Minimal data** - Only essential fields stored
- ✅ **Auto-cleanup** - 90-day retention policy (configurable)
- ✅ **Non-fatal** - Logging failures never break main operations

---

## Retention Policy

**Default: 90 days**

This balances between:
- Security compliance (most regulations require 60-90 days)
- Database size (prevents bloat)
- Query performance (smaller table = faster queries)

### Why 90 Days?

- **Security**: Long enough to investigate incidents
- **Compliance**: Meets most audit requirements
- **Performance**: Keeps table size manageable
- **Storage**: Prevents database bloat

---

## Automated Cleanup

### Quarterly Cleanup (Recommended)

Run this script every 3 months:

```bash
cd pawjai-be

# Preview what will be deleted (dry run)
bun run scripts/cleanup-audit-log.ts --dry-run
# or: bun run audit:cleanup:dry

# Actual cleanup (90 days retention)
bun run scripts/cleanup-audit-log.ts
# or: bun run audit:cleanup

# Custom retention period
bun run scripts/cleanup-audit-log.ts 60  # 60 days
```

### Schedule with Cron

Add to your server's crontab:

```bash
# Run quarterly cleanup (90 days) on 1st day of Jan/Apr/Jul/Oct at 2 AM
0 2 1 1,4,7,10 * cd /path/to/pawjai-be && bun run scripts/cleanup-audit-log.ts >> /var/log/audit-cleanup.log 2>&1
```

Or use Railway's scheduled tasks (if available).

---

## Monitoring

### Check Current Status

```bash
# View stats
bun run scripts/test-audit-log.ts

# Manual query
bunx drizzle-kit studio
# Navigate to admin_audit_log table
```

### Key Metrics to Watch

| Metric | Threshold | Action |
|--------|-----------|--------|
| Total entries | > 100,000 | Run cleanup sooner |
| Last 30 days | > 10,000 | Normal for active systems |
| Oldest entry | > 180 days | Run cleanup |

---

## Performance Impact

### Storage

**Estimated size per entry:** ~500 bytes

```
1,000 entries   = ~500 KB
10,000 entries  = ~5 MB
100,000 entries = ~50 MB  ⚠️ Cleanup recommended
1,000,000 entries = ~500 MB  🚨 Cleanup urgent!
```

### Query Performance

| Table Size | Query Speed | Index Status |
|------------|-------------|--------------|
| < 10K | Instant | ✅ Good |
| 10K-100K | < 100ms | ✅ Good |
| 100K-1M | < 500ms | ⚠️ OK |
| > 1M | > 1s | 🚨 Slow |

---

## Usage Patterns

### Fire-and-Forget (Default)

```typescript
import { logAdminAction, AUDIT_ACTIONS } from '@/utils/auditLog';

// This doesn't block - runs asynchronously
logAdminAction({
  adminUserId: admin.id,
  action: AUDIT_ACTIONS.USER_ACTIVATED,
  targetUserId: userId,
  ipAddress: request.ip,
});

// Main operation continues immediately
return reply.send(ApiResponses.success(data));
```

### Synchronous (Rarely Needed)

```typescript
import { logAdminActionSync } from '@/utils/auditLog';

// Only use when audit log MUST be written before continuing
await logAdminActionSync({
  adminUserId: admin.id,
  action: AUDIT_ACTIONS.ADMIN_DELETED,
  targetUserId: deletedAdminId,
});
```

### Batch Logging (Efficient)

```typescript
import { logAdminActions } from '@/utils/auditLog';

// Log multiple actions at once (more efficient)
logAdminActions([
  { adminUserId: admin.id, action: AUDIT_ACTIONS.USER_ACTIVATED, targetUserId: user1 },
  { adminUserId: admin.id, action: AUDIT_ACTIONS.USER_ACTIVATED, targetUserId: user2 },
  { adminUserId: admin.id, action: AUDIT_ACTIONS.USER_ACTIVATED, targetUserId: user3 },
]);
```

---

## Actions Logged

### Currently Implemented

All action constants live in `AUDIT_ACTIONS` in `src/utils/auditLog.ts`.

| Action | When | Location |
|--------|------|----------|
| `admin_login` / `admin_login_failed` | Admin logs in / login attempt fails | `adminAuthService` |
| `admin_logout` | Admin logs out | `routes/admin/auth` |
| `admin_password_changed` | Password changed | `adminAuthService` |
| `user_activated` | Admin activates user | `routes/admin/users` |
| `user_deactivated` | Admin deactivates user | `routes/admin/users` |
| `user_profile_updated` | Admin edits user profile | `routes/admin/users` |
| `user_note_added` | Admin adds note to user | `routes/admin/users` |
| `user_password_reset` | Admin resets user password | `routes/admin/users` |
| `user_hard_deleted` | Admin hard-deletes a user | `routes/admin/dev-tools` |
| `users_batch_hard_delete_requested` / `_executed` | Batch hard-delete flow | `routes/admin/dev-tools` |
| `admin_created` / `admin_updated` / `admin_deleted` | Admin account management | `adminManagementService` |
| `admin_generate_jwt_secret` | Generate a new JWT secret | `routes/admin/settings-audit` |
| `admin_update_settings` | Update admin settings (notifications, broadcasts, test-send favorites, etc.) | `routes/admin/settings-notifications`, `routes/admin/broadcasts*`, `routes/admin/test-send-favorites` |

### Defined but not yet wired to a call site

These constants exist in `AUDIT_ACTIONS` for future use but have no logging call site yet:

| Action | Intended use |
|--------|------|
| `subscription_plan_changed` | Change subscription |
| `subscription_canceled` | Cancel subscription |
| `subscription_reactivated` | Reactivate subscription |
| `grace_period_extended` | Extend grace period |
| `payment_refunded` | Issue refund |
| `payment_retried` | Retry failed payment |

---

## Database Schema

Defined in `src/db/schema/admin.ts` (`adminAuditLog`):

```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID,                   -- Who did it (nullable: failed logins against
                                         -- unknown emails still get logged, with the
                                         -- attempted email preserved in metadata)
  action TEXT NOT NULL,                 -- What they did
  target_user_id UUID,                  -- Who it affected (if applicable)
  target_resource_type TEXT,            -- Resource type (user, subscription, etc.)
  target_resource_id TEXT,              -- Resource ID
  reason TEXT,                          -- Why (optional)
  metadata JSONB,                       -- Extra context (minimal!)
  ip_address TEXT,                      -- Where from
  user_agent TEXT,                      -- Which client
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX admin_audit_log_admin_user_id_idx ON admin_audit_log(admin_user_id);
CREATE INDEX admin_audit_log_target_user_id_idx ON admin_audit_log(target_user_id);
CREATE INDEX admin_audit_log_created_at_idx ON admin_audit_log(created_at);
```

There is no index on `action` in the current schema.

---

## Best Practices

### ✅ DO

- Use `logAdminAction()` (async) for most cases
- Keep `metadata` minimal (< 1KB)
- Run cleanup quarterly
- Monitor table size monthly
- Use action constants from `AUDIT_ACTIONS`

### ❌ DON'T

- Don't use `logAdminActionSync()` unless absolutely necessary
- Don't store large objects in `metadata`
- Don't log user passwords or sensitive data
- Don't manually insert into `admin_audit_log` table
- Don't skip quarterly cleanups

---

## Troubleshooting

### Audit log entries not appearing

**Check:**
1. Table exists: `bunx drizzle-kit studio`
2. Logging isn't throwing errors: Check backend logs
3. Fire-and-forget completed: May take 1-2 seconds

**Fix:**
```bash
# Test with sync logging
import { logAdminActionSync } from '@/utils/auditLog';
await logAdminActionSync({ ... });
```

### Table getting too large

**Check:**
```bash
bun run scripts/test-audit-log.ts
```

**Fix:**
```bash
# More aggressive cleanup
bun run scripts/cleanup-audit-log.ts 60  # 60 days instead of 90
```

### Slow audit log queries

**Check:**
```sql
-- Check table size
SELECT COUNT(*) FROM admin_audit_log;

-- Check oldest entry
SELECT MIN(created_at) FROM admin_audit_log;
```

**Fix:**
```bash
# Run cleanup
bun run scripts/cleanup-audit-log.ts

# Rebuild indexes (if needed)
REINDEX TABLE admin_audit_log;
```

---

## Migration Guide

If you have old audit log code using direct DB inserts:

### Before (Old Way)
```typescript
await db.insert(adminAuditLog).values({
  adminUserId: admin.id,
  action: 'user_activated',
  targetUserId: userId,
  ipAddress: request.ip,
});
```

### After (New Way)
```typescript
import { logAdminAction, AUDIT_ACTIONS } from '@/utils/auditLog';

logAdminAction({
  adminUserId: admin.id,
  action: AUDIT_ACTIONS.USER_ACTIVATED,
  targetUserId: userId,
  ipAddress: request.ip,
});
```

**Benefits:**
- Non-blocking (faster)
- Error handling built-in
- Consistent action names
- Never breaks main operations

---

## Compliance Notes

### Data Retention

Most regulations require:
- **SOC 2**: 90 days minimum
- **GDPR**: As long as necessary (90 days reasonable)
- **PCI DSS**: 90 days minimum

Our **90-day default meets all requirements**.

### Data Access

- Only `super_admin` can access audit logs
- Logs cannot be modified (append-only)
- Automatic cleanup leaves no trace (by design)

### Right to Erasure (GDPR)

When deleting a user (GDPR request):
- Audit logs are kept (legitimate interest)
- User ID is retained for security
- Personal data (names, emails) not stored in audit log

---

## Summary

✅ **Lightweight:** Fire-and-forget, never blocks  
✅ **Maintained:** 90-day auto-cleanup  
✅ **Performant:** Indexed queries, minimal data  
✅ **Compliant:** Meets security standards  

**Action Required:** Run cleanup quarterly

```bash
# Add to calendar: Every 3 months
bun run scripts/cleanup-audit-log.ts
```

