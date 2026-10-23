# XLA Holiday Calendar: Decisions Log

Append-only. Newest entry at the bottom. Never edit or delete a past entry: supersede it with a new one that names the old ID.

Status values: `assumption, confirm` (working default, not yet agreed), `confirmed`, `superseded by D-NNN`.

## Template

```
### D-NNN: <short title>
- Date: YYYY-MM-DD
- Status: assumption, confirm | confirmed | superseded by D-NNN
- Decision: <what was settled, one or two sentences>
- Why: <reason or source, for example "Shurick, Oct 21" or "user said so in session">
- Affects: <BRIEF.md section, data file, view, or prompt stage>
```

## Log

### D-001: Week starts on Monday
- Date: 2026-10-23
- Status: assumption, confirm
- Decision: If the month grid is laid out as a calendar week grid, weeks start on Monday.
- Why: ISO 8601 default. Not checked against the original Make demo, which may use a plain 1 to 31 door grid instead.
- Affects: BRIEF.md Views, month grid layout.

### D-002: ISO 8601 dates in data
- Date: 2026-10-23
- Status: assumption, confirm
- Decision: Stored dates use `YYYY-MM-DD`. Deadlines use ISO 8601 date-time with explicit PT offset. Display formatting is a separate, open choice.
- Why: Unambiguous and matches `data/doors.schema.json`.
- Affects: data/doors.schema.json, data/doors.sample.json.

### D-003: "Live demo" uses seeded data
- Date: 2026-10-23
- Status: assumption, confirm
- Decision: The demo is interactive but reads from `data/doors.sample.json` with mock partners. Countdown and cap counter are simulated. No real auth, checkout, or inventory.
- Why: The original is a Figma Make prototype with mock partner data. No partner is confirmed.
- Affects: BRIEF.md "What live means", figma-make-prompt data stage.

### D-004: Timezone is Pacific Time
- Date: 2026-10-23
- Status: confirmed
- Decision: Doors open and claims close at midnight PT. Countdown targets midnight PT. Deadlines are stored as `23:59:59-08:00` in December.
- Why: Research on the original project (Confluence overview, XNTWRK page 25430163555).
- Affects: data schema `claim_deadline_pt`, countdown, copy.

### D-005: Brand and UI rules
- Date: 2026-10-23
- Status: confirmed
- Decision: Use XUI elements and widgets only. Quests use XUI QuestCard (no custom quest UI). Tiles have straight corners with labels above them. Buttons keep the XUI radius. Partner-facing copy never names "Xsolla ID" or "Backpack". Game names in mockups are illustrative only.
- Why: Shurick, Oct 21.
- Affects: BRIEF.md Brand rules, every figma-make-prompt stage, ux-copy pass.

### D-006: Source check of D-001, D-002, D-003 (Oct 23)
- Date: 2026-10-23
- Status: confirmed
- Decision: Checked against the PRD v0.1, overview, partner docs, GTKN-270 and #advent-calendar. D-001 (week starts Monday): still assumption, sources are silent on week start (see D-015). D-002 (ISO dates in data): still assumption, a data-file choice that sources do not address and do not contradict. D-003 (seeded data): still assumption, sources describe the product, not the demo; PRD AD-4 (simulated date preview on staging) is consistent with it. D-004 (PT): reconfirmed, doors open at 00:00 PT and close at 23:59:59 PT, server time, no DST in December, page also shows local time (PRD header, LD-1, section 11). D-005: reconfirmed as binding (PRD section 10).
- Why: PRD page 25430294608; Overview page 25430163555.
- Affects: D-001 to D-005.

### D-007: Eligibility to claim
- Date: 2026-10-23
- Status: confirmed
- Decision: Claiming requires a signed-in Xsolla ID with a confirmed email. No guest claims. Signed-out taps on claim, quest or reminder open the standard Xsolla ID flow and return the player to the same door and action. Region: global minus Legal restrictions, English only.
- Why: PRD ID-1, ID-2, section 4 scope.
- Affects: BRIEF.md Demo flows 1 and 3, sign-in and claim views, copy.

### D-008: Claim limits
- Date: 2026-10-23
- Status: confirmed
- Decision: One bundle per Xsolla ID per day; a second attempt shows "Already in your Backpack". Each door has a hard daily cap; at zero it switches to Sold out with claim disabled and a tomorrow teaser. "N left" never goes negative and is hidden for uncapped doors. Failed claims consume no cap; retries grant at most one bundle. Default cap per door is still open (PRD Q11).
- Why: PRD LD-2, LD-3, LD-4, CL-4, CL-5, section 8.
- Affects: data schema (`cap`, `remaining`, state `sold_out`), today's door view, copy.

### D-009: Missed doors are Gone
- Date: 2026-10-23
- Status: confirmed
- Decision: At 23:59:59 PT the live door becomes Gone (state `missed`), unclaimable, and the next door goes Live. No catch-up on missed doors.
- Why: PRD LD-5, section 4 "Not doing", section 8.
- Affects: month grid, data `state`, copy.

### D-010: Teased and locked doors
- Date: 2026-10-23
- Status: confirmed
- Decision: The next 3 doors are teased (state `teased`): branded shell plus a one-line hint, reward hidden. Later doors show "Opens Dec N" (state `locked`), date only, reward hidden. Before Dec 1 all doors are teased with a countdown to Dec 1.
- Why: PRD LD-6, section 8.
- Affects: data schema (`teased`, `hint`), month grid.

### D-011: Grand drops
- Date: 2026-10-23
- Status: confirmed
- Decision: Dec 24, 25 and 31 are labeled Grand drop in the grid from Day 1 and use the ticket stub shell. Partners are asked for rare or high-value items for these days.
- Why: PRD LD-8, Overview decisions table, asset spec Q5.
- Affects: data (`tier`, `special_label`, `shell`), month grid.

### D-012: Beta access door
- Date: 2026-10-23
- Status: confirmed
- Decision: "Beta access" is a label chip on an ordinary door (example Dec 15), configured like Grand drop. It follows normal claim, cap and Gone rules.
- Why: PRD section 8 "Special labels", AD-1; Jira mockup status chips.
- Affects: data `special_label`, month grid.

### D-013: Hidden gold bonus
- Date: 2026-10-23
- Status: confirmed
- Decision: Today's door has a gold bonus slot. Signed out it shows locked "Sign in to reveal"; on sign-in the gold bonus item is revealed and included in the bundle. This is the "gold rare item revealed on sign-in".
- Why: PRD LD-7, section 7 step 6, section 8; One-pager.
- Affects: data `gold_bonus`, today's door view.

### D-014: "Your door, any day"
- Date: 2026-10-23
- Status: assumption, confirm
- Decision: Treat "your door, any day" on the month grid as an open-door slot pitching partners to claim any free day, linked to the partner band ("Your game on December 12?", "Claim a door", "Talk to us"). It is not a player catch-up feature (catch-up is out of scope, D-009).
- Why: One-pager lists it under "Every door in December"; Jira mockup description has the partner pitch band; asset spec Q5 offers "Any day in December". No source defines it directly.
- Affects: BRIEF.md Views, month grid.

### D-015: Month grid layout
- Date: 2026-10-23
- Status: confirmed
- Decision: The grid shows every door in December with a "show this week only" toggle. Tiles have straight corners with labels above. Week start (D-001) remains an open assumption.
- Why: Jira GTKN-270 mockup description; Shurick rules (D-005).
- Affects: month grid, D-001.

### D-016: Demo date control
- Date: 2026-10-23
- Status: assumption, confirm
- Decision: The demo has a control to set "today" to any date (including a November pre-launch date) so every door and page state can be shown.
- Why: Mirrors PRD AD-4 "preview any day" on staging. No source specifies it for the demo.
- Affects: BRIEF.md "What live means", figma-make-prompt stages.

### D-017: Landing quest first
- Date: 2026-10-23
- Status: confirmed
- Decision: Every visit starts with the "Thanks for landing" quest (set a reminder, sign in, confirm email) on XUI QuestCard. It grants an XLA branded Backpack item (example "Early Bird 2026") once only, and works in November before launch.
- Why: PRD LQ-1 to LQ-4, section 7; Overview decisions (Oct 22).
- Affects: quest area, Demo flow 1.

### D-018: Bonus quests add items
- Date: 2026-10-23
- Status: confirmed
- Decision: One news quest per door plus all-month quests (Follow XLA on Instagram, Join the Discord, Invite a friend). Each completes once per Xsolla ID and adds one item. Only verifiable events count.
- Why: PRD BQ-1 to BQ-3; Grant Wei, Slack Oct 22 and Oct 23 (quests tied to calendar rewards).
- Affects: data `news_quest`, quest area.

### D-019: Branded claim email is required
- Date: 2026-10-23
- Status: confirmed
- Decision: After a claim the player gets the PayStation receipt plus a separate branded Advent Calendar email. This overturns the brief's "assumption" wording; the email is a product requirement. The demo still shows it as a confirmation state only.
- Why: PRD CL-3; Overview "How it works" step 3.
- Affects: BRIEF.md Demo flow 3, claim confirmation view.

### D-020: Door grid is the extended Daily Rewards block
- Date: 2026-10-23
- Status: assumption, confirm
- Decision: The door grid reuses the Web Shop Daily Rewards block in Advent Mode, extended (31 days, PT, cap, Gone, teasers, bundles, Backpack claim). No new plugin. The mockup label "new plugin" must change.
- Why: PRD section 10; Overview marks it "proposed, decision Oct 23". Not yet confirmed in Slack or Jira.
- Affects: BRIEF.md Brand rules, door grid label.

### D-021: Door model extended
- Date: 2026-10-23
- Status: confirmed
- Decision: `state` adds `teased` and `sold_out`. New optional door fields: `special_label` (beta_access, grand_drop), `shell` (cartridge, dome, crate, ticket_stub, lanyard_pass, gift_card_holder), `cap` (integer or null for uncapped), `remaining`, `hint`, `gold_bonus`, `news_quest`. Sample data updated and revalidated.
- Why: PRD section 8, AD-1, LD-2, LD-6, LD-7, BQ-1, glossary.
- Affects: data/doors.schema.json, data/doors.sample.json.
