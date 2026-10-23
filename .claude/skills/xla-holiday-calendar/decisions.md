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
