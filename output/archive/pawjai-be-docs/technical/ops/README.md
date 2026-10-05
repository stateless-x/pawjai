# Operations Documentation

Production deployment, monitoring, and maintenance.

---

## Guides

- **[OFFER_CLEANUP.md](./OFFER_CLEANUP.md)** - Offer cleanup job (90-day retention)
- **[AUDIT_LOG_MAINTENANCE.md](./AUDIT_LOG_MAINTENANCE.md)** - Audit log retention and cleanup
- **[ADMIN_JWT_SECRET.md](./ADMIN_JWT_SECRET.md)** - Admin authentication JWT secret configuration
- **[ADMIN_CREDENTIALS.md](./ADMIN_CREDENTIALS.md)** - Admin account credentials and management endpoints (contains a real, plaintext credential -- see note in that file)

---

## Quick Reference

### Deployment
- **Platform:** Railway
- **Build:** `bun run db:validate && bun run build` (see `[build]` in `railway.toml`)
- **Pre-Deploy:** `bun run db:dry-run && bun run db:migrate:prod` (see `[deploy.preDeploy]` in `railway.toml`)
- **Environment:** Set all env vars in Railway dashboard

### Monitoring
- **Logs:** Railway dashboard → Deployments → Logs
- **Stripe:** Stripe dashboard → Webhooks → Delivery attempts
- **Database:** Railway dashboard → Database → Metrics

### Maintenance Jobs
- **Offer Cleanup:** Runs automatically, monthly (1st of month) -- see `src/jobs/offerJobs.ts`. No standalone script; call `offerService.cleanupOldOffers()` directly for a manual run (see `OFFER_CLEANUP.md`).

---

**Last Updated:** 2025-11-21
