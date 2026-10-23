# Figma Make prompts: Xsolla at gamescom asia 2026 ("Asia Games Com")

Paste one stage at a time into Figma Make. Check every box under a stage before pasting the next one. If Make breaks something that worked, use the fix prompt at the end instead of re-pasting a stage.

## Gate check (skill input gate)

| Input | Status | Where |
|---|---|---|
| Goal | Pass: measurable (reward code within 4 taps of round end; meeting request within 4 taps) | BRIEF.md "Goal" |
| Audience | Pass | BRIEF.md "Audience" |
| Demo flows | Pass: 5 flows, each with a start and end screen | BRIEF.md "Demo flows" |
| Data source | Pass: `data/event.sample.json`, 1.9 KB (1.65 KB minified), no real APIs | BRIEF.md "Data" |
| Brand tokens | Pass: literal hex, type, radius, spacing from `xla-holiday-calendar/design/tokens.json` | BRIEF.md "Brand" |

All five inputs present. Prompts generated.

## How the brand text is used

Every prompt carries two brand blocks inside `KEEP:`. Neither counts toward the ~150 word stage limit.

1. The skill's "Brand constraints block", verbatim.
2. `brand-block.txt`, verbatim, under a one-line lead-in. That file was written for the XLA Holiday Calendar, so it mentions doors and December dates. The lead-in tells Make to apply only its colors, type, radius and spacing. See REVIEW.md, skill gap 1.

---

## Stage 1: Shell, layout and tokens

```
KEEP: This is an Xsolla event page prototype for attendees on phones at the Xsolla booth, gamescom asia 2026. Goal: after one 30-second booth game, a visitor claims a reward or requests a meeting within 4 taps.
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
Brand values (copied from the house brand file; use its colors, fonts, radius and spacing only, ignore doors and December dates):
Use Xsolla XUI (Pentagram Dark) only; no custom UI. Page background #141d1f. Door tiles #1b2628, 1px border rgba(178,242,255,0.1), 0px straight corners, a square label above each tile. Text #e8eced; muted text rgba(232,236,237,0.58). Today's door: cyan #55dcf6 border, Claim button #80eaff with black text. Claimed: green tag #95ff80. Grand drops Dec 24, 25, 31: lime #cef655. Buttons keep XUI radius (8px medium, 4px small). Headings Pilat Wide Bold, body Aktiv Grotesk. Spacing 4/8/16/24/32px. Quests use the XUI QuestCard. No gradients. Never write "Xsolla ID" or "Backpack".

Build only the page shell. No content yet.
- Layout: one scrolling page, mobile first. Sticky top bar: "Xsolla" wordmark, links Agenda, Game, Booth, FAQ, theme toggle.
- Empty full-width bands: Hero, Agenda, Speakers, Booth, Game, FAQ, Footer, each showing its name.
- Define these as CSS variables and use only them:
  page #141d1f, surface #1b2628, primary #80eaff, on-primary #000000, text #e8eced, muted rgba(232,236,237,0.58), accent #cef655, focus #55dcf6, tile border rgba(178,242,255,0.1), success #95ff80.
  Headings Pilat Wide 700; body Aktiv Grotesk; sizes 40, 32, 24, 16, 14, 12 px; tiles 0 px radius; buttons 8 px (medium) and 4 px (small); spacing 4, 8, 16, 24, 32 px.
- Do not add any other colors or fonts.
```

Verify before Stage 2:
- [ ] Inspector shows page background #141d1f and band surface #1b2628.
- [ ] Top bar has the wordmark, 4 anchor links and a theme toggle.
- [ ] Seven bands in the order Hero, Agenda, Speakers, Booth, Game, FAQ, Footer.
- [ ] No placeholder lorem colors, no gradients, no fonts other than Pilat Wide and Aktiv Grotesk (or their fallbacks).
- [ ] Nothing mentions doors, December or a calendar (brand-block leakage).

## Stage 2: Seed data

```
KEEP: Shell, top bar, bands and CSS variables from the previous step. Do not change layout or colors.
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
Brand values (copied from the house brand file; use its colors, fonts, radius and spacing only, ignore doors and December dates):
Use Xsolla XUI (Pentagram Dark) only; no custom UI. Page background #141d1f. Door tiles #1b2628, 1px border rgba(178,242,255,0.1), 0px straight corners, a square label above each tile. Text #e8eced; muted text rgba(232,236,237,0.58). Today's door: cyan #55dcf6 border, Claim button #80eaff with black text. Claimed: green tag #95ff80. Grand drops Dec 24, 25, 31: lime #cef655. Buttons keep XUI radius (8px medium, 4px small). Headings Pilat Wide Bold, body Aktiv Grotesk. Spacing 4/8/16/24/32px. Quests use the XUI QuestCard. No gradients. Never write "Xsolla ID" or "Backpack".

Add this data as a hardcoded constant named EVENT_DATA in its own file. Use it exactly as written. Do not fetch, generate or add rows.

{"_sample":"SAMPLE DATA. Sessions, speakers, leaderboard and reward are fake. Event name, dates, venue and booth come from Confluence MAR 24147689473.","event":{"name":"gamescom asia x Thailand Game Show 2026","dates":"29 to 30 October 2026","venue":"Queen Sirikit National Convention Center (QSNCC), Bangkok","booth":"Booth E21, B2B Hall"},"sessions":[{"id":"s1","day":1,"time":"10:00","title":"Sample talk: Going direct with a mobile web shop","speakerId":"p1","room":"Sample Stage A"},{"id":"s2","day":1,"time":"13:30","title":"Sample panel: Payments that fit Southeast Asia","speakerId":"p2","room":"Sample Stage B"},{"id":"s3","day":1,"time":"16:00","title":"Sample demo: Live at the Xsolla booth","speakerId":"p3","room":"Booth E21"},{"id":"s4","day":2,"time":"11:00","title":"Sample talk: Launch and grow beyond your home market","speakerId":"p4","room":"Sample Stage A"},{"id":"s5","day":2,"time":"14:00","title":"Sample workshop: Partner Network basics","speakerId":"p1","room":"Sample Room 3"}],"speakers":[{"id":"p1","name":"Sample Speaker A","role":"Head of Partnerships (sample)"},{"id":"p2","name":"Sample Speaker B","role":"Payments Lead (sample)"},{"id":"p3","name":"Sample Speaker C","role":"Solutions Engineer (sample)"},{"id":"p4","name":"Sample Speaker D","role":"Studio Founder (sample)"}],"leaderboard":[{"name":"PLAYER_01","score":38},{"name":"PLAYER_02","score":33},{"name":"PLAYER_03","score":29},{"name":"PLAYER_04","score":24},{"name":"PLAYER_05","score":18}],"game":{"seconds":30,"grid":9,"rewardMinScore":10,"reward":"Sample booth merch item"},"meetingSlots":["29 Oct 11:00","29 Oct 15:00","30 Oct 10:30","30 Oct 14:30"]}

Show a temporary debug list of session titles in the Agenda band so I can confirm the data loaded.
```

Verify before Stage 3:
- [ ] Debug list shows exactly 5 session titles, each starting with "Sample".
- [ ] EVENT_DATA file matches the JSON above character for character (spot-check booth "Booth E21, B2B Hall" and leaderboard top score 38).
- [ ] No extra or invented rows; no network calls in the code.
- [ ] Shell and colors from Stage 1 unchanged.

## Stage 3: Core views

```
KEEP: Shell, top bar, bands, CSS variables, and the EVENT_DATA constant. Do not edit the data or the tokens.
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
Brand values (copied from the house brand file; use its colors, fonts, radius and spacing only, ignore doors and December dates):
Use Xsolla XUI (Pentagram Dark) only; no custom UI. Page background #141d1f. Door tiles #1b2628, 1px border rgba(178,242,255,0.1), 0px straight corners, a square label above each tile. Text #e8eced; muted text rgba(232,236,237,0.58). Today's door: cyan #55dcf6 border, Claim button #80eaff with black text. Claimed: green tag #95ff80. Grand drops Dec 24, 25, 31: lime #cef655. Buttons keep XUI radius (8px medium, 4px small). Headings Pilat Wide Bold, body Aktiv Grotesk. Spacing 4/8/16/24/32px. Quests use the XUI QuestCard. No gradients. Never write "Xsolla ID" or "Backpack".

Replace the debug list with these views, all reading from EVENT_DATA:
1. Hero: event name, dates, venue, booth. Buttons "Play the booth game" (primary #80eaff) and "Book a meeting" (secondary).
2. Agenda: Day 1 and Day 2 tabs; one tile per session, time label above the tile, title, speaker name, room.
3. Speakers: one tile per speaker, role label above.
4. Booth: booth text, three QuestCards (Play the game, Book a meeting, Visit Booth E21), meeting form with name, company and a slot select from meetingSlots.
5. Game: Start screen, a 3x3 grid of square tiles with key labels 1 to 9 above, score, 30 s timer, leaderboard of 5 rows.
6. FAQ: 4 collapsed questions. Footer: "Concept mockup. Event details are placeholders."
Static views only; no hover or loading states yet.
```

Verify before Stage 4:
- [ ] Each of the 5 demo flows has its views (hero CTAs, agenda tabs, booth form, game grid, FAQ).
- [ ] Every session, speaker, leaderboard row and slot comes from EVENT_DATA; nothing invented.
- [ ] Tiles have 0 px corners and a label above; buttons are 8 px (medium) or 4 px (small).
- [ ] Quests use QuestCard rows (icon well, title, subtitle, status dot), not custom cards.
- [ ] Stage 1 layout and colors unchanged.

## Stage 4: Interactions and states

```
KEEP: Shell, CSS variables, EVENT_DATA, and views Hero, Agenda, Speakers, Booth, Game, FAQ, Footer. Do not restyle or reorder anything.
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
Brand values (copied from the house brand file; use its colors, fonts, radius and spacing only, ignore doors and December dates):
Use Xsolla XUI (Pentagram Dark) only; no custom UI. Page background #141d1f. Door tiles #1b2628, 1px border rgba(178,242,255,0.1), 0px straight corners, a square label above each tile. Text #e8eced; muted text rgba(232,236,237,0.58). Today's door: cyan #55dcf6 border, Claim button #80eaff with black text. Claimed: green tag #95ff80. Grand drops Dec 24, 25, 31: lime #cef655. Buttons keep XUI radius (8px medium, 4px small). Headings Pilat Wide Bold, body Aktiv Grotesk. Spacing 4/8/16/24/32px. Quests use the XUI QuestCard. No gradients. Never write "Xsolla ID" or "Backpack".

Make these demo flows clickable end to end:
- Play and claim: hero button > Game > Start > a random tile lights (#55dcf6 border, "Tap" tag); tapping it scores 1 and lights another > after game.seconds, end screen with score > "Claim reward" > code "Show this at Booth E21".
- Replay: end screen "Play again" restarts; leaderboard inserts "You" by score.
- Book a meeting: form > slot > "Send request" > success message.
- Agenda: Day 2 tab. FAQ: question toggles answer.
States, existing tokens only:
- Empty: "No sessions this day" for an empty day.
- Score under rewardMinScore: "Score 10 to unlock the reward" and Claim disabled.
- Hover and selected: tiles lift 2 px; selected tab underlined #80eaff.
- Error: empty name shows "Add your name".
```

Verify before Stage 5:
- [ ] Play and claim runs Start to code screen; the timer really counts down 30 s.
- [ ] Score below 10 disables Claim and shows the unlock line.
- [ ] Play again resets score and timer; "You" appears in the leaderboard in score order.
- [ ] Meeting form blocks an empty name, then confirms; no data is sent anywhere.
- [ ] Day 2 tab and FAQ toggles work; hover and selected states visible.

## Stage 5: Responsive and accessibility

```
KEEP: Everything from previous steps: tokens, data, views, flows and states. Change layout only at the breakpoints below.
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
Brand values (copied from the house brand file; use its colors, fonts, radius and spacing only, ignore doors and December dates):
Use Xsolla XUI (Pentagram Dark) only; no custom UI. Page background #141d1f. Door tiles #1b2628, 1px border rgba(178,242,255,0.1), 0px straight corners, a square label above each tile. Text #e8eced; muted text rgba(232,236,237,0.58). Today's door: cyan #55dcf6 border, Claim button #80eaff with black text. Claimed: green tag #95ff80. Grand drops Dec 24, 25, 31: lime #cef655. Buttons keep XUI radius (8px medium, 4px small). Headings Pilat Wide Bold, body Aktiv Grotesk. Spacing 4/8/16/24/32px. Quests use the XUI QuestCard. No gradients. Never write "Xsolla ID" or "Backpack".

Responsive:
- Under 768 px: one column, 16 px side gutters, top bar links collapse into a single row that scrolls, game grid fills the width. No horizontal page scroll at 360 px.
- 768 to 1279 px: agenda and speakers in 2 columns.
- 1280 px and up: Booth and Game side by side, 32 px gutters.
Accessibility:
- Visible focus ring using #55dcf6.
- Logical tab order through each flow; game tiles are buttons; keys 1 to 9 tap tiles.
- Labels on every icon button and input; score and timer announced politely, not every second.
- Text contrast at least 4.5:1; if a token pair fails, tell me instead of changing the color.
- Respect reduced motion: no lifts or fades. No sound.
```

Verify before Stage 6:
- [ ] Works at 375 px, 768 px, 1440 px; no horizontal scroll at 360 px.
- [ ] A full game round is playable with keyboard only (Tab to Start, Enter, keys 1 to 9, Tab to Claim).
- [ ] Focus ring #55dcf6 visible on every control.
- [ ] Make reported any failing contrast pair instead of changing a color.
- [ ] Reduced motion setting removes movement; no audio anywhere.

## Stage 6: Polish

```
KEEP: Everything from previous steps. No new views, colors, fonts or data.
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
Brand values (copied from the house brand file; use its colors, fonts, radius and spacing only, ignore doors and December dates):
Use Xsolla XUI (Pentagram Dark) only; no custom UI. Page background #141d1f. Door tiles #1b2628, 1px border rgba(178,242,255,0.1), 0px straight corners, a square label above each tile. Text #e8eced; muted text rgba(232,236,237,0.58). Today's door: cyan #55dcf6 border, Claim button #80eaff with black text. Claimed: green tag #95ff80. Grand drops Dec 24, 25, 31: lime #cef655. Buttons keep XUI radius (8px medium, 4px small). Headings Pilat Wide Bold, body Aktiv Grotesk. Spacing 4/8/16/24/32px. Quests use the XUI QuestCard. No gradients. Never write "Xsolla ID" or "Backpack".

Polish for a live demo to attendees on phones at the booth:
- Rewrite UI copy in a short, friendly, direct tone; keep labels under 4 words; sentence case.
- Even spacing on the 8 px grid.
- Subtle transitions (150 ms) on tile hits, tab change and FAQ open.
- Add a small "Reset demo" control in the footer that clears score, leaderboard "You" row, claimed code and form.
- Page title: Xsolla at gamescom asia 2026.
```

Verify when done:
- [ ] Copy is short and friendly; no label over 4 words; nothing names "Xsolla ID" or "Backpack".
- [ ] Reset demo restores the first-load state.
- [ ] Footer still reads "Concept mockup. Event details are placeholders."
- [ ] Re-run the Stage 4 and Stage 5 checks: nothing regressed.

---

## Fix prompt (example)

Use when Make breaks something that worked. One fix per prompt.

```
Change only: the Game view end screen. It currently shows "Claim reward" enabled for every score; it should be disabled with the line "Score 10 to unlock the reward" when score is under EVENT_DATA.game.rewardMinScore.
Keep everything else exactly as it is: layout, tokens, data, screens, interactions.
Do not refactor, rename or restyle anything else.
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
Brand values (copied from the house brand file; use its colors, fonts, radius and spacing only, ignore doors and December dates):
Use Xsolla XUI (Pentagram Dark) only; no custom UI. Page background #141d1f. Door tiles #1b2628, 1px border rgba(178,242,255,0.1), 0px straight corners, a square label above each tile. Text #e8eced; muted text rgba(232,236,237,0.58). Today's door: cyan #55dcf6 border, Claim button #80eaff with black text. Claimed: green tag #95ff80. Grand drops Dec 24, 25, 31: lime #cef655. Buttons keep XUI radius (8px medium, 4px small). Headings Pilat Wide Bold, body Aktiv Grotesk. Spacing 4/8/16/24/32px. Quests use the XUI QuestCard. No gradients. Never write "Xsolla ID" or "Backpack".
```

If two fixes fail in a row, roll back to the last good version in Make and re-run the current stage prompt.

## [REAL API] pieces

None: fully seeded. Leaderboard, reward code and meeting request are local stubs.
