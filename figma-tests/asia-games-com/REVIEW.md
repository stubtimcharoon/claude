# REVIEW: figma-make-prompt test run (Asia Games Com)

Date: 2026-10-23. Scope: `figma-tests/asia-games-com/` only. Figma was network-blocked, so no prompt was run in Make. The prompts are checked against the skill's rules, and `index.html` is checked against the per-stage verify lists as a stand-in for what Make should produce.

## 1. Skill rules applied to PROMPTS.md

| Rule (SKILL.md) | Result | Note |
|---|---|---|
| Gate: all 5 inputs before writing prompts | Pass | Gate table at the top of PROMPTS.md. Goal has a measurable outcome; 5 flows with start and end; seed 1.9 KB. |
| Six stages, one stage per prompt, never merged | Pass | |
| Every prompt opens with `KEEP:` and the block grows | Pass | Stage 4 restates tokens, layout, data constant and view list. |
| ~150 words per prompt (brand block excluded) | Borderline | Without the two brand blocks and the JSON: 153, 62, 151, 152, 144, 90 words; fix prompt 54. Stages 1, 3 and 4 sit just over 150. |
| Brand constraints block verbatim in every stage and fix prompt | Pass | Checked by script: exact match in all 7 code blocks. |
| `brand-block.txt` verbatim (task instruction) | Pass, with caveat | Exact match in all 7 blocks, under a one-line lead-in telling Make to ignore doors and December dates. See gap 1. |
| Tokens as literal values, never token names | Pass | Stage 1 lists hex and px values. |
| Never invent hex, font or spacing | Pass | Every value is in `tokens.json`. Five gap tokens used only by the HTML come from the `xsolla-ui-design` templates (listed in the `index.html` header comment). |
| Live demo rule: seeded data, `[REAL API]` marks, reset control | Pass | No real APIs. Reset demo is in Stage 6 and in the prototype footer. |
| Fix prompt: one fix, names the component, states the expected result | Pass | Example fixes the Claim button gating. |
| No em-dashes | Pass | Scanned all files. |
| Output ends with fix template and `[REAL API]` list | Pass | "None: fully seeded". |

## 2. Per-stage verify checklist, run on index.html

| Stage | Check | Result |
|---|---|---|
| 1 | Primary and surface hex applied | Pass. `body` is `--xui-bg-secondary` #141d1f, tiles `--xui-bg-primary` #1b2628, CTA #80eaff. No hex or rgba outside `:root` (script check). No gradients. |
| 1 | Nav present | Pass. Sticky header, 5 anchor links, theme toggle. |
| 2 | Data verbatim, no invented rows, no network | Pass. `EVENT_DATA` is the JSON file inlined unchanged. Playwright saw zero failed requests and no fetch calls. Only external load: Google Fonts (Noto Sans). |
| 3 | Every flow has its views, all bound to seed data | Pass. Hero, Agenda (tabs), Speakers, Booth (3 QuestCards and a form), Game, FAQ, Footer. |
| 3 | Tiles have 0 corners and labels above; buttons keep size-class radius | Pass. `--page-radius-tile: 0px`; every tile has an `xui-tag-label` above; buttons use 8 px (md) and 4 px (sm, xs) from `button.md`. |
| 3 | QuestCard for quests, modifier `xui-quest-card__status--{status}` | Pass. |
| 4 | Each flow clickable start to end | Pass, tested: play and claim, replay, book a meeting (with empty-name error), agenda Day 2, FAQ open, reset demo. |
| 4 | Empty, hover, selected, error states | Pass. "No sessions this day." exists in code but no seed day is empty, so it never shows. Score under 10 disables Claim (tested). Loading skeleton: not built (no screen changes on a one-page site). |
| 5 | 375, 768, 1440 px | Tested at 360, 390 and 1280 px (the sizes the task asked for). No horizontal scroll at 360, 390 or 1280. 768 and 1440 not tested. |
| 5 | Tab order, focus ring, labels | Pass. 16 Tabs from the top reach Start. Focus moves to the lit tile, then to the end heading, then Tab goes to Claim and Play again. Ring is 2 px `--xui-border-brand`. |
| 5 | Contrast | Dark: all text pairs pass AA (lowest: tertiary on bg-secondary 5.64; secondary on the game band #0b3841 6.30). Light fails, left unchanged as the skill says: field error #e84f30 on white 3.76; lit-tile border #31cae8 1.95 (the "Tap" tag carries the state); low-time #c37822 3.48 (24 px bold, passes large-text 3:1). |
| 5 | Reduced motion, no audio | Pass. With `reducedMotion: reduce`, animations are "none" and transitions 0s. No audio or video elements. |
| 6 | Copy fits the audience, reset works, no regressions | Pass. Short sentence-case copy. Nothing says "Xsolla ID" or "Backpack". Reset restores the first-load state (tested). |

### Playwright results (Chromium from /opt/pw-browsers, headless)

- 390x844 and 1280x800: page loads with 0 console errors and 0 failed requests.
- Keyboard-only round at both sizes: Tab to Start, Enter, then a mix of keys 1 to 9 and Enter on the focused lit tile. The timer ran its full 30 s, the end screen showed, Tab then Enter claimed (code `SAMPLE-XXXX`, booth quest set to success), and Tab then Enter replayed. Bot scores were 113 and 115.
- Separate run: a 0-point round leaves Claim disabled and shows "Score 10 to unlock the reward".
- Screenshots: `screenshot-mobile-390-{full,playing,end,claimed,low-score,light}.png`, `screenshot-desktop-1280-{full,end,claimed}.png`.

## 3. Deviations and open items in this output

- **Event identity is assumed.** No Confluence, Slack or Drive source uses the name "Asia Games Com". The page assumes it means gamescom asia x Thailand Game Show 2026 (Confluence MAR 24147689473: 29 to 30 Oct 2026, QSNCC Bangkok, Booth E21 in the B2B Hall). If that is wrong, these facts become placeholders.
- **Footer is not fully accurate.** The footer says "Concept mockup. Event details are placeholders." as instructed, but the name, dates, venue and booth are sourced; only the agenda, speakers, leaderboard, reward and slots are placeholders. A small note under the hero says which is which.
- **Fonts.** Pilat Wide and Aktiv Grotesk load only from cdn.xsolla.net, which this prototype was not allowed to use. The prototype renders in Noto Sans, the third font in the token stack. The Make prompts name the real fonts.
- **XUI skill rules not followed:**
  - Did not start from `templates/base.html`, because of the font CDN.
  - Saved to this folder, not `prototypes/`, because of the task's file boundary.
  - Day tabs are XUI buttons, not the XUI Tabs component (its doc was not read).
  - Form fields are styled with tokens, not copied from `input.md`.
  - The step 9 UXW copy audit table was not produced.
- **Mono secondary button.** The `xui-btn--secondary xui-btn--mono` hover tokens are missing from `tokens.json`. They were filled from the XUI templates.
- **Tag label fixes:**
  - The tag label `__id` segment needs `--xui-bg-neutral-secondary`, which is not in `tokens.json`. It was filled from the XUI templates.
  - In Pentagram Light, the documented series chip is black on black (`--xui-content-tertiary` on `--xui-content-static-dark`). A page-level override fixes it. This should go back to the XUI component doc.

## 4. Where the skill was unclear or wrong

1. **No project-neutral brand block.** SKILL.md's block is generic rules with no values. The only file with values, `brand-block.txt`, belongs to the holiday calendar ("Door tiles", "Today's door", "Grand drops Dec 24, 25, 31"). Pasting it verbatim into an event page invites Make to draw doors. The skill should either own a neutral XUI token block or say how to adapt a project block.
2. **Token source priority conflicts.** SKILL.md says to load `xsolla-ui-design` first and use a tokens file only "otherwise". The task (and the calendar project) treat `tokens.json` as the primary source. The skill also has no rule for which source wins when the tokens file lacks a value the design skill has.
3. **The Stage 1 template has too few color slots.** It has 5 slots (primary, surface, text, muted, accent). XUI needs at least these more: page canvas vs surface, text on the primary color (black), focus/border brand, tile border, success. Without them Make guesses.
4. **Word limit is unclear.** The skill exempts "the block (about 40 words)" but says nothing about a second brand block, the seed JSON in Stage 2, or the `KEEP:` header. Stages 1, 3 and 4 land at about 151 to 153 words.
5. **Fix-prompt text is inconsistent.** The SKILL.md fix-prompt pattern has no brand block line, but the same file says every fix prompt must restate it, and `prompt-templates.md` includes it.
6. **Templates assume a multi-screen app.** They use "screens", "routing", "nav items wired to screens" and "Loading: skeleton on screen change". A one-page event site with anchors and an embedded widget does not fit. The skill does not say whether an unused placeholder may be dropped (here the loading skeleton was).
7. **No guidance for time-based or game logic.** There is nothing on timers, randomness or scoring rules, and nothing in the verify lists about timing ("timer really counts down 30 s" had to be added by hand). The fallback rule ("[REAL API] over 2 s") is the only timing rule.
8. **Breakpoints conflict.** The Stage 5 defaults are 375, 768 and 1440 px. XUI uses 600, 960 and 1024; house page rules need 360 px with no horizontal scroll. The skill does not reconcile these.
9. **Gate ignores fact sourcing.** It checks goal, audience, flows, data and tokens, but not whether real-world facts (event name, dates, venue) are sourced or marked placeholder. For event pages that is the main risk.
10. **Output location is undefined.** "Return the output in the format below" does not say whether to write a file (PROMPTS.md) or reply in chat, or whether to include the gate result.
11. **Brand rule has no class name.** "Use the XUI QuestCard" does not name the modifier, and the XUI index lists the wrong one (`xui-quest-card--{status}`). The Stage 3 checklist could name `xui-quest-card__status--{status}`.
12. **No font fallback rule.** Make may not load the cdn.xsolla.net fonts, and the skill says nothing about checking the rendered font in the Stage 1 verify.
