---
status: done (superseded by pawjai-react-native/docs/DESIGN.md)
updated: 2026-10-01
---

# RN Astro-vibe plan: "Sunny Vet Notebook" for the app

> **Done 2026-10-01** on pawjai-react-native branch `feat/astro-vibe-home`. The as-built system is `pawjai-react-native/docs/DESIGN.md`. Differences from this plan: large titles stayed Kanit Bold (in blue), the active tab is pj.orangeText, selected chips keep a blue label (orange text on peach is only 4.02), and the RDDinosaur font and stickers were dropped (owner). This file is kept for the reasoning only.

Owner ask (2026-10-01): make pawjai-react-native feel like pawjai-public (Astro), aesthetic first.
Decision log: ~/product-decisions/pawjai/2026-10-01b-feature.md (verdict: test first, revert in one commit).
Done already: 23 `pj-*` primitives in `src/design-system/tokens/colors.ts` + `tailwind.config.js`, 0 drift vs `pawjai-public/src/styles/tokens.css`. No visual change yet.

## Design stance

The website is a Persuade surface. The app is an Operate surface. We take the website's **world** (cream paper, blue ink, gold sticker button, peach tints, warm browns) and leave its **density and loudness** behind. Brand lives in the details; the task stays first.

Three rules carry over from pawjai-public/DESIGN.md, adapted:

1. **Blue Ink.** Titles and headings are Deep Blue `#1e4f78`, never black.
2. **Two Oranges.** Gold fills the one primary button. Orange `#ff9900` marks icons and states. Orange is never body text (2.04 on cream).
3. **Tint before shadow.** Separate surfaces by fill or a warm 1px border, not gray shadows.

Kept from today: Noto Sans Thai for all UI (Astro itself keeps Noto for app-flavoured UI), native tab bar and large titles, status colors (success, warning, danger, info), all copy, all flows, information order.

## Priority 1: aesthetic foundation (global, tokens only)

| Element | Today | Proposed | Contrast |
|---|---|---|---|
| Page ground | cream.bg `#fff4e9` | pj.cream `#fff9ec` | |
| Page and section titles | gray-900, Bold | pj.blue, Medium (500) | 8.19 |
| Body text | gray-700 | pj.brownNav `#584a40` | 8.11 |
| Secondary text (dates, subtitles) | gray-500/600 | pj.brownDark `#7a6858` | 5.07 |
| Disabled, placeholder | gray-400 | pj.brown `#9e8870` | 3.22, non-text only |
| Borders, dividers | warm.border | pj.borderCard `#ddd0b8` | |
| Icons and active tab | brand.orange `#ff8a3d` | pj.orange `#ff9900` | icon only |

Why first: this alone moves every screen toward the site, it is pure semantic remap, and it is one revertable commit.
Risk: brown body on dense Notebook rows may read muddy. Gate: owner judges Notebook, not just Home.

## Priority 2: UI signature pieces

1. **Sticker primary button** (Home "บันทึกกิจกรรม", sheet save buttons).
   Gold `#ffb91b` fill, pj.blue label (4.99, passes AA; today's white on orange is 2.35 and fails), 3px bottom and left edge in `#e07800`.
   Press: the button shifts 2px down-left and the edge shrinks, like pressing a sticker flat. Replaces `gradients.brand`; the gradient tokens get retired.
   Rule: one gold button per screen.
2. **Cards** (reminder card, pet rows, Settings groups): white fill, 1px pj.borderCard, no gray shadow, 12px radius (already the RN card radius).
3. **Filter chips and segmented** (Notebook filters): active chip = pj.peach fill, pj.orangeText bold label, 1px pj.borderCta. Inactive = white, 1px borderCard, brownDark label. Avoids white-on-orange.
4. **Date bands** in Notebook ("วันนี้", "24 ก.ย. 2569"): pj.peachLight strip with brownDark label, so the list reads like dated notebook pages.
5. **Pet avatar discs**: peach ring behind the avatar, matching the site's avatar discs.

## Priority 3: Pepe as the "blue room" (the strongest brand link)

On pawjai.co, Pepe lives inside a blue phone mock: blue-bg screen, white Pepe bubbles, pale-blue chips, sand input bar. The app's Pepe screen becomes that same room, so a user who saw the site recognises it on first open.

| Pepe element | Proposed |
|---|---|
| Screen ground | pj.blueBg `#eef5fb` |
| Pepe bubble | white, 1px pj.borderPhone |
| User bubble | pj.bluePale `#d0e5f5`, pj.blue text |
| Suggestion chips ("โมจิกินข้าวหรือยัง") | pj.bluePale fill, pj.blue text |
| Input bar | pj.sand `#f0e8d5`, send button pj.blue |

This is the one place blue becomes a ground. Everywhere else blue stays ink.

## Priority 4: delight (only after 1 to 3 are accepted)

- **Stickers in empty states** (no pets, empty Notebook, empty Pepe): the CDN sticker set the site uses. Needs the asset list and a size budget.
- **One hand-lettered line per screen**, RDDinosaur in orange, e.g. a Home greeting above "หน้าหลัก". Needs the font bundled in RN (free, already self-hosted by pawjai-public) and a Thai glyph check. Optional.

## Leave alone (anti-goals)

- No Mitr, no marketing gutters or section spacing, no gradients, no dark mode.
- Settings stays quiet: ground, text and border changes only.
- No copy, flow or order changes. No status color changes.
- Native chrome stays native. The iOS 26 glass tab bar only takes a tint color, so only its active color changes.

## Build sequence (each step one commit, screenshot-gated)

0. **Docs first** (CLAUDE.md rule: deviating from design guidelines needs owner OK, then a doc update):
   - New `pawjai-react-native/DESIGN.md` in DESIGN.md format, extending pawjai-public's world for Operate mode, with the table above as its color section.
   - Amend the "exact iOS parity" rule: layout and behaviour still follow iOS, color and surface now follow pawjai-public. Update the `colors.ts` header and the canon line in `docs/ARCHITECTURE.md`.
   - PRODUCT.md: reuse `pawjai-public/PRODUCT.md` product truth.
1. Priority 1 semantic remap. Fix the 15 files that read `primitives.*` directly.
2. Sticker button + retire `gradients.brand`.
3. Cards, chips, date bands, avatar rings.
4. Pepe blue room.
5. Delight, if wanted.

Gate per step: before and after simulator screenshots of Home, Pets, Notebook, Pepe and Settings; all text pairs at 4.5 or above; `npm run typecheck`, `npx jest`, `npm run lint` pass.

## Open decisions for the owner

1. Title weight: Medium (site look, softer) or keep Bold (stronger native large title)?
2. Brown body text, or keep gray body and change only titles? Decide on the Notebook screenshot.
3. Priority 4 at all: stickers and RDDinosaur add assets and a font.
