# Testing Documentation

Test suites, guidelines, and test infrastructure.

---

## Test Guides

- **[SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md)** - Complete subscription test suite (test count varies; see the 9 files under `src/__tests__/integration/` it documents)

---

## Quick Reference

### Running Tests
```bash
# Run all tests (spins up a throwaway local Postgres via scripts/test.sh, migrates it,
# runs bun test against it, then tears it down)
bun run test

# Run only integration tests
bun run test:integration

# Run with coverage
bun run test:coverage
```

Use `bun run test`, not `bun test` directly -- the npm script goes through `scripts/test.sh`,
which spins up a throwaway Docker Postgres, migrates it, runs the suite, then tears it down.
Running `bun test` directly bypasses that provisioning and fails any suite needing a live
connection. See `CLAUDE.md` "Testing" for the full rules, including a known migration-replay
issue that currently breaks `bun run test` on a fresh database.

### Test Structure
- **Unit tests:** `src/__tests__/unit/` - pure logic, no I/O; these run fine under bare `bun test`
- **Integration tests:** `src/__tests__/integration/` - mixed: some suites use `TestDataFactory`
  against the real throwaway database (e.g. `trial-eligibility`, `premium-access`, `grace-period`,
  `subscription-lifecycle`); others mock all services/DB and need no connection at all (e.g.
  `webhook-stripe`, `offer-timer`, `payment-methods`, `pricing`) -- check individual suites in
  `docs/technical/testing/SUBSCRIPTIONS.md` before assuming either pattern
- **Helpers:** `src/__tests__/helpers/`
- **Pattern:** AAA (Arrange, Act, Assert)

---

**Last Updated:** 2025-11-21
