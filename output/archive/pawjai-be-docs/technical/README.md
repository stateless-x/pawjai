# Technical Documentation

**Purpose:** Technical implementation details for developers and maintainers.
**Audience:** Developers, DevOps, system administrators

---

## Folders

### [api/](./api/)
API endpoint documentation and integration guides.

- **[PRICING.md](./api/PRICING.md)** - Dynamic pricing API endpoint
- **[SUBSCRIPTIONS.md](./api/SUBSCRIPTIONS.md)** - Subscription management API (NEW)

### [database/](./database/)
Database schema, migrations, and data management.

- **[MIGRATIONS.md](./database/MIGRATIONS.md)** - Database migration workflow
- **[LOOKUP_TYPES.md](./database/LOOKUP_TYPES.md)** - Pet record lookup types management

### [testing/](./testing/)
Test suites, guidelines, and test infrastructure.

- **[SUBSCRIPTIONS.md](./testing/SUBSCRIPTIONS.md)** - Subscription test documentation

### [ops/](./ops/)
Operations, deployment, monitoring, and maintenance.

- **[OFFER_CLEANUP.md](./ops/OFFER_CLEANUP.md)** - Offer cleanup job documentation
- **[AUDIT_LOG_MAINTENANCE.md](./ops/AUDIT_LOG_MAINTENANCE.md)** - Audit log retention and cleanup
- **[ADMIN_JWT_SECRET.md](./ops/ADMIN_JWT_SECRET.md)** - Admin auth JWT secret configuration
- **[ADMIN_CREDENTIALS.md](./ops/ADMIN_CREDENTIALS.md)** - Admin user credentials reference

---

## Quick Links

### Development Workflows
- [Database Migrations](./database/MIGRATIONS.md) - How to modify database schema
- [Running Tests](./testing/SUBSCRIPTIONS.md) - How to run test suites
- [Lookup Types](./database/LOOKUP_TYPES.md) - Managing pet record types

### Feature Implementation
- **[SHARE_WITH_VET.md](./SHARE_WITH_VET.md)** - Vet share technical implementation
- **[NOTIFICATIONS.md](./NOTIFICATIONS.md)** - Notification system architecture
- **[ONBOARDING_ANALYTICS.md](./ONBOARDING_ANALYTICS.md)** - Onboarding funnel tracking
- **[WEIGHT_TRACKING.md](./WEIGHT_TRACKING.md)** - Weight tracking implementation
- **[CHAT_RECEIPTS.md](./CHAT_RECEIPTS.md)** - Chat-write receipt payload contract and identity resolution

### API Integration
- [Pricing API](./api/PRICING.md) - GET `/api/subscriptions/pricing`
- [Subscription API](./api/SUBSCRIPTIONS.md) - Subscription endpoints

### Operations
- [Cleanup Jobs](./ops/OFFER_CLEANUP.md) - Automated maintenance tasks
- [Audit Log Maintenance](./ops/AUDIT_LOG_MAINTENANCE.md) - Retention and cleanup

---

## Implementation Status

See [/docs/business/README.md](../business/README.md) for feature implementation status.

Docs describing removed modules, completed migrations, or abandoned plans are deleted rather
than kept — git history preserves them if ever needed. If a doc here disagrees with the code,
the code is canon; fix the doc.
