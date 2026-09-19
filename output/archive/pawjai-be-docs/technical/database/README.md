# Database Documentation

Database schema management and migrations.

---

## Guides

- **[MIGRATIONS.md](./MIGRATIONS.md)** - Complete migration workflow (step-by-step)
- **[LOOKUP_TYPES.md](./LOOKUP_TYPES.md)** - Pet record types management

---

## Quick Reference

### Common Commands
```bash
# Generate new migration
bun run db:generate

# Apply migrations locally
bun run db:migrate

# Apply migrations in production
bun run db:migrate:prod

# Check migration status
bun run db:status

# Validate migrations
bun run db:validate
```

### Schema Source of Truth
**File:** `src/db/schema/` (directory — one file per domain)

Never edit:
- `db/drizzle/meta/_journal.json`
- Existing migration SQL files
- `drizzle.__drizzle_migrations` table

---

**Last Updated:** 2025-11-21
