# Database Migrations Guide

Canonical workflow for all schema changes. Follow exactly.

---

## Quick Reference

```bash
# 1. Edit schema (one file per domain, e.g. src/db/schema/pets.ts)
vi src/db/schema/<area>.ts

# 2. Generate migration
bun run db:generate

# 3. Add idempotency to generated SQL
vi db/drizzle/NNNN_*.sql

# 4. Apply migration locally
bun run db:migrate

# 5. Verify no drift
bun run db:generate  # Should show "No schema changes"

# 6. Commit files together
git add src/db/schema/ db/drizzle/NNNN_*.sql db/drizzle/meta/
```

---

## Protected Files

**Never edit these files:**
- `scripts/database/migrate.ts`
- `db/drizzle/meta/_journal.json`
- Existing `db/drizzle/NNNN_*.sql` files (already applied)
- `drizzle.__drizzle_migrations` table (database)

**Source of truth:**
- Edit only: `src/db/schema/` (a directory, one file per domain -- not a single `schema.ts`)

---

## Step-by-Step Workflow

### 1. Edit Schema

Edit the relevant `src/db/schema/<area>.ts` file with your changes.

**Example (`src/db/schema/pets.ts`):**
```typescript
export const pets = pgTable('pets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Add new column
  microchipId: text('microchip_id'),
});
```

### 2. Generate Migration

```bash
bun run db:generate
```

This creates:
- `db/drizzle/NNNN_description.sql` - Migration SQL
- `db/drizzle/meta/NNNN_snapshot.json` - Schema snapshot
- Updates `db/drizzle/meta/_journal.json`

### 3. Add Idempotency

**Critical:** Edit the generated SQL to make it idempotent.

**Before:**
```sql
ALTER TABLE "pets" ADD COLUMN "microchip_id" text;
CREATE INDEX "pets_microchip_id_idx" ON "pets" ("microchip_id");
```

**After:**
```sql
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "microchip_id" text;
CREATE INDEX IF NOT EXISTS "pets_microchip_id_idx" ON "pets" ("microchip_id");
```

**Patterns:**
- `ADD COLUMN` → `ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`
- `DROP TABLE` → `DROP TABLE IF EXISTS`
- For drops with constraints: `DROP ... CASCADE` (use carefully)

### 4. Apply Migration Locally

```bash
bun run db:migrate
```

Runs all pending migrations against your local database.

### 5. Verify No Drift

```bash
bun run db:generate
```

Should output: **"No schema changes"**

If it generates changes, your schema and migration are out of sync. Fix before proceeding.

### 6. Commit Files Together

Always commit these files together:

```bash
git add src/db/schema/<area>.ts
git add db/drizzle/NNNN_*.sql
git add db/drizzle/meta/_journal.json
git add db/drizzle/meta/NNNN_snapshot.json
git commit -m "Add microchip_id to pets table"
```

---

## Production Deployment

### Railway Auto-Deployment

The `preDeploy` hook is configured in `railway.toml`, not `package.json`:

```toml
[deploy.preDeploy]
command = "bun run db:dry-run && bun run db:migrate:prod"
```

`db:dry-run` runs first and aborts the deploy if more than one migration is pending without
`ALLOW_BULK_MIGRATION=true`. The build step separately runs `bun run db:validate` before
`bun run build` (see `[build].buildCommand` in `railway.toml`).

### Manual Production Migration

If needed:

```bash
# SSH into Railway container or use Railway CLI
bun run db:migrate:prod
```

**Prerequisites:**
- `DATABASE_URL` environment variable set
- SSL connection configured

---

## Git Hooks (Local Development)

### Install Pre-Commit Hook

```bash
bun run db:hooks:install
```

**What it does:**
- Validates migration files when committing
- Ensures `_journal.json` and snapshot are staged together
- Runs `bun run db:validate` before commit
- Blocks commit if validation fails

**Note:** Git hooks only run locally, not on Railway.

---

## Useful Commands

```bash
# Validate migrations
bun run db:validate

# Check migration status
bun run db:status

# Generate migration
bun run db:generate

# Apply migrations locally
bun run db:migrate

# Apply migrations in production
bun run db:migrate:prod

# Install git hooks
bun run db:hooks:install
```

---

## Forbidden Actions

❌ **Do not:**
- Hand-write numbered migration files
- Edit `_journal.json` manually
- Edit already-applied migration SQL files
- Use `drizzle-kit push` in production
- Skip idempotency checks
- Commit schema changes without migration files

---

## Troubleshooting

### "Column already exists"

**Cause:** Migration ran partially or ran twice.

**Solution:** Add `IF NOT EXISTS` to the migration:

```sql
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "microchip_id" text;
```

Re-run migration.

### "Migration pending but no schema changes"

**Cause:** Journal out of sync with database.

**Solution:**
1. Make pending migration idempotent
2. Run `bun run db:migrate` to apply it
3. Verify with `bun run db:generate` (should show "No changes")

### "Railway deployment failed"

**Check:**
1. Migration logs in Railway dashboard
2. Ensure all migrations are idempotent
3. Verify `DATABASE_URL` is set correctly
4. Check for data preconditions (e.g., handle NULLs before adding NOT NULL)

### "Cannot add NOT NULL column"

**Problem:**
```sql
ALTER TABLE "pets" ADD COLUMN "microchip_id" text NOT NULL;
```

Fails if existing rows have NULL.

**Solution:** Two-step migration:

**Migration 1:**
```sql
-- Add nullable column
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "microchip_id" text;

-- Set default value for existing rows
UPDATE "pets" SET "microchip_id" = '' WHERE "microchip_id" IS NULL;
```

**Migration 2:**
```sql
-- Add NOT NULL constraint
ALTER TABLE "pets" ALTER COLUMN "microchip_id" SET NOT NULL;
```

---

## Data Migrations

When migrating data between tables:

```sql
-- Create new table
CREATE TABLE IF NOT EXISTS "new_table" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "data" text NOT NULL
);

-- Migrate data with conditional check
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'old_table') THEN
    INSERT INTO new_table (id, data)
    SELECT id, old_data FROM old_table
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Drop old table after migration
DROP TABLE IF EXISTS "old_table" CASCADE;
```

**See:** `db/drizzle/0019_illegal_magneto.sql` for real example.

---

## Best Practices

1. **Always test locally first** - Run migration on local DB before production
2. **Make migrations idempotent** - Use `IF EXISTS` / `IF NOT EXISTS`
3. **Keep migrations small** - One logical change per migration
4. **Handle existing data** - Use DO blocks for conditional logic
5. **Commit atomically** - Schema + migration + metadata together
6. **Document breaking changes** - Add comments in migration SQL
7. **Backup before major changes** - Especially in production

---

## Examples

### Adding a Column

```sql
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "breed_id" uuid;
```

### Adding an Index

```sql
CREATE INDEX IF NOT EXISTS "pets_breed_id_idx" ON "pets" ("breed_id");
```

### Adding a Foreign Key

```sql
ALTER TABLE "pets"
ADD CONSTRAINT "pets_breed_id_fk"
FOREIGN KEY ("breed_id") REFERENCES "breeds"("id")
ON DELETE SET NULL;
```

### Renaming a Column

```sql
-- Drizzle generates this automatically
ALTER TABLE "pets" RENAME COLUMN "old_name" TO "new_name";
```

### Dropping a Column

```sql
ALTER TABLE "pets" DROP COLUMN IF EXISTS "old_column";
```

---

**Related:** `CLAUDE.md` (Database migrations section)
