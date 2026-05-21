# Chat-Write — Onboarding Tutorial Flag

Companion to the FE / BE inventories. Decides how the first-time chat-write popup is tracked.

---

## Decision

**Add a parallel column `chat_write_tutorial_completed_at timestamp` on `user_profiles`. Do not reuse the existing `tutorial_completed_at`.**

---

## Why not reuse the dashboard flag?

The existing `user_config.tutorial_completed_at` (schema: `src/db/schema/users.ts` line 77) is a single timestamp serving one tutorial — the dashboard tour. The team controls re-display via a `TUTORIAL_RESET_BEFORE` constant on FE.

Reusing it for chat-write would mean:
- Dismissing the dashboard tour silently dismisses chat-write onboarding too.
- Bumping `TUTORIAL_RESET_BEFORE` for any one tutorial re-shows them all.
- The same coupling compounds with every future tutorial.

---

## Alternatives considered

1. **Reuse the existing column** — rejected: coupling above.
2. **`user_tutorials` table** (`user_id`, `tutorial_key`, `completed_at`) — rejected as over-engineered for ~3 tutorials. Adds a join + a query on every page that gates on a flag.
3. **Parallel column** — accepted: same pattern as the dashboard one, same `TUTORIAL_RESET_BEFORE` mechanism, same shape of API. One column, one row of code change in the service.

---

## The trigger to refactor

**Two flag columns is fine. Three is the trigger to refactor to a `user_tutorials` table.** Document this rule so the team doesn't slide into 8 columns by accident.

---

## Smallest implementation

### Schema
- `src/db/schema/users.ts` — add `chatWriteTutorialCompletedAt: timestamp('chat_write_tutorial_completed_at')` on the `userConfig` table, next to the existing `tutorialCompletedAt` (line 77).

### Service
- `src/services/userConfigService.ts` — add `getChatWriteTutorialCompletedAt(userId)` and `markChatWriteTutorialCompleted(userId)`. Copy-paste-edit of the existing dashboard tutorial methods.

### Routes
- `src/routes/users-preferences.ts` — add two routes mirroring the existing tutorial ones (lines 117 and 135):
  - `GET /settings/chat-write-tutorial-status`
  - `PATCH /settings/chat-write-tutorial-completed`

### FE hook
- `hooks/useChatWriteTutorial.ts` — returns `{ hasSeen: boolean; markSeen: () => void }`. Same shape as the existing dashboard tutorial hook.

### Gate the dialog
- `components/chat/ChatWriteOnboardingDialog.tsx` — renders only when premium AND `!hasSeen`. On close (any outcome), call `markSeen()`.
