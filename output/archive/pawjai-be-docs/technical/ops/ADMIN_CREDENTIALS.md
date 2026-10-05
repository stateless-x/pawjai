# Admin Credentials

## Current Admin User

**Email:** askpurin@pm.me
**Password:** pawjai123
**Role:** super_admin
**Created:** 2025-11-10

## Permissions

`role: super_admin` bypasses granular permission checks entirely (`requirePermission()` in
`src/middleware/adminAuth.ts` short-circuits to allow when `role === 'super_admin'`), so the
specific permission rows seeded for this account don't gate what it can do. The bootstrap
scripts (`scripts/create-first-admin.ts`, `scripts/reset-admin.ts`) currently seed this list:
- `users:read`, `users:write`, `users:delete`
- `subscriptions:read`, `subscriptions:write`
- `payments:read`, `payments:refund`
- `analytics:read`
- `content:read`, `content:write`
- `admin:manage`

Note: routes now also check permission scopes not in that seed list (`blog:*`, `feedback:*`,
`lookup_types:*`, `notifications:*`) -- irrelevant for a `super_admin`, but relevant if you
create a non-super-admin account and expect it to match this list.

## API Endpoints

### Authentication (`/api/admin/auth`)
- **POST** `/api/admin/auth/login` - Login
- **GET** `/api/admin/auth/me` - Get current admin info
- **POST** `/api/admin/auth/logout` - Logout

### Admin Management (`/api/admin/admins`)
- **GET** `/api/admin/admins` - List all admins (requires `admin:manage`)
- **POST** `/api/admin/admins` - Create new admin (requires `admin:manage`)
- **GET** `/api/admin/admins/:id` - Get admin details (requires `admin:manage`)
- **PUT** `/api/admin/admins/:id` - Update admin (requires `admin:manage`)
- **DELETE** `/api/admin/admins/:id` - Delete admin (requires `admin:manage`)
- **POST** `/api/admin/admins/:id/password` - Change admin password (requires `admin:manage`)

## Security Notes

1. ⚠️ **Change default password immediately after first login**
2. Always use HTTPS in production
3. Admin JWT tokens expire after 24 hours (see `ADMIN_JWT_SECRET.md`); sessions are also
   revocable server-side via the `admin_sessions` table
4. At least one super_admin must exist at all times
5. All admin actions are logged in the audit trail

## Scripts

### Reset Admin
Purge all admins and create a new one:
```bash
bun --env-file=.env.local run scripts/reset-admin.ts
```

With custom credentials:
```bash
EMAIL=your@email.com PASSWORD=yourpassword bun --env-file=.env.local run scripts/reset-admin.ts
```

### Create Additional Admin
```bash
EMAIL=admin@example.com PASSWORD=password123 bun --env-file=.env.local run scripts/create-first-admin.ts
```
