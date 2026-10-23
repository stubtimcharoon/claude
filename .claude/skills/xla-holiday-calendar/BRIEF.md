# XLA Holiday Calendar (live demo): Brief

Status: draft. `TODO` marks unknowns. `assumption` marks plausible defaults awaiting confirmation in `decisions.md`.

## Goal

Recreate the "XLA Holiday Calendar (live demo)", originally prototyped in Figma Make, using AI, so it can be iterated on and demoed consistently.

The product is an advent-style rewards calendar on XLA (x.la), not a public-holiday calendar. Every day in December 2026 (31 doors) one door opens with a free bundle donated by a partner (virtual currency, in-game items, sometimes a game key, beta access, or a brand gift). Players sign in with Xsolla ID, claim before midnight PT, the items land in their Xsolla Backpack, and they come back tomorrow. Dec 24, 25 and 31 are grand drops.

It is the first consumer proof of "quests and items as a comms device".

- TODO: demo success criteria and who signs off.

## Audience

- Players: visit daily, claim free items.
- Partners (games and brands): donate items for free in exchange for exposure.
- TODO: internal demo audience (leadership review, partner pitch, or both).

## People (roles)

- Kickoff lead, direction, Confluence author, Figma Make user: Alexander Menshikov
- Idea and design rules: Shurick
- Sponsor: Grant Wei
- Tracking (GTKN-270): Jason Foster
- Design lead: Andrew Krelle

## Demo flows

1. **Sign in.** Land on the page, complete the "Thanks for landing" quest (sign in with Xsolla ID, confirm email, get a branded Backpack item).
2. **Open today's door.** See today's door with a live countdown to midnight PT and a live "N left" daily cap counter.
3. **Claim.** Claim the bundle (a $0 checkout). Items and codes land in the Backpack. Assumption: a branded confirmation email follows, shown as a confirmation state only.
4. **See missed and locked doors.** Month grid shows past unclaimed doors as missed ("Gone"), future doors as locked, with teasers for the next 3 doors.
5. **Grand drop.** Dec 24, 25 and 31 doors are visually distinct grand drops with a larger bundle.

## What "live" means

- Interactive, clickable prototype driven by **seeded data** (`data/doors.sample.json`) with mock partners. See decisions.md D-003.
- Assumption: countdown and "N left" counter are simulated client-side, not backed by a real inventory.
- Assumption: a demo control to set "today" to any December date so every door state can be shown.
- TODO: confirm whether any part must hit a real service.

## Views

- Today's door (hero) with countdown, cap counter, claim button.
- Month grid of 31 doors with states: locked, available, claimed, missed; grand drop styling; teasers.
- Quest area: welcome quest, one news bonus quest per door, monthly quests (Instagram, Discord, invite a friend), all as XUI QuestCard.
- Desktop and mobile layouts.
- TODO: "your door, any day" and beta-access door behaviour; the gold rare item revealed on sign-in; the two "your game" slots in official XLA shells.

## Out of scope

- Assumption: real authentication, real PayStation checkout, real email sending.
- Assumption: partner inventory upload and management (partner asset spec lives in Confluence).
- Assumption: localisation (launch is English only).
- Assumption: regional legal restrictions logic (launch is global minus Legal restrictions).
- Public-holiday data of any kind.

## Brand rules and tokens

Confirmed rules (source: Shurick, Oct 21; see decisions.md):

- Use XUI elements and widgets only. Everything should be a reusable XLA or XUI widget.
- Quests use XUI QuestCard. No custom quest UI.
- Tiles have straight corners, with labels above the tiles.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names in mockups are illustrative only. No partner is confirmed.

Tokens: use the `xsolla-ui-design` skill for colours, type, spacing and radii. Never invent hex values.

- Door state colours (locked, available, claimed, missed, grand): TODO, map to xsolla-ui-design tokens.
- Typography: TODO. Real Xsolla brand fonts are wanted for polish (the original used demo styles).
- Mockup label "new plugin" on the door grid: TODO, will change.

## Links

- Original Make demo: https://www.figma.com/make/1KPNyHVbMijBYnbW0Y9EuG
- Figma design: https://www.figma.com/design/J8B83IdCvU5ujKUruhXopA
- Confluence overview: XNTWRK page 25430163555
- Jira tracking: GTKN-270
- Slack: #advent-calendar
