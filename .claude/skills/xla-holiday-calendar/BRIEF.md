# XLA Holiday Calendar (live demo): Brief

Status: draft, reconciled with the PRD v0.1 (Oct 22), overview page, partner docs, GTKN-270 and #advent-calendar (to Oct 23). `TODO` marks what sources leave open. `assumption` marks plausible defaults awaiting confirmation in `decisions.md`.

Source tags: (PRD) = XNTWRK page 25430294608 "2. PRD, MVP phase 1"; (Overview) = page 25430163555; (One-pager) = page 25430655030; (Asset spec) = page 25430458453; (Jira) = GTKN-270; (Slack, date) = #advent-calendar.

## Goal

Recreate the "XLA Holiday Calendar (live demo)", originally prototyped in Figma Make, using AI, so it can be iterated on and demoed consistently.

The product is an advent-style rewards calendar on XLA (x.la), not a public-holiday calendar. Every day in December 2026 (31 doors, Dec 1 to 31, fallback start Dec 13) one door opens at 00:00 PT with a free bundle donated by a partner (virtual currency, in-game items, sometimes a game key, beta access, or a brand gift). Players sign in with Xsolla ID, claim before 23:59:59 PT, the items land in their Xsolla Backpack as codes with redeem steps, and they come back tomorrow. Dec 24, 25 and 31 are grand drops. (PRD)

It is the first consumer proof of "quests and items as a comms device". (PRD, Overview)

- Product success metrics exist (PRD section 3, M1 to M10: new Xsolla IDs, reminder opt-ins, daily claimers, return rate, sell-through, redemption, quest completion, partner fill, reliability, abuse), all targets TBD.
- Visual direction already approved by Shurick, as relayed by Alexander Menshikov. (Jira)
- TODO: success criteria for the demo itself and who signs off on the rebuilt demo.

## Audience

- Players: gamers visiting x.la in Nov and Dec, want free in-game value with no risk. (PRD)
- Partners (games and brands): donate items for free in exchange for exposure, named day, verified claims and a claim report. No integration, no cost. (PRD, One-pager)
- Internal ops (CSM, design, support, daily ops): run 31 doors config-driven. (PRD)
- Internal demo audience: the cross-team program (engineering needs PRD plus UX design before coding, Slack Oct 22) and BD/CSM, who use the demo as the design reference for the partner one-pager. (Slack Oct 23, One-pager)
- TODO: whether the demo is also shown live to partners or leadership.

## People (roles)

- Kickoff lead, direction, Confluence author, Figma Make user: Alexander Menshikov (Menshi)
- Idea and design rules: Shurick
- Sponsor: Grant Wei
- Tracking (GTKN-270, GTKN-277): Jason Foster
- Design lead: Andrew (Andy) Krelle, with Irina Schugoreva and Andrey Podshibyakin
- Product Owner: proposed René Valen, not yet confirmed (Jira comment, Slack Oct 23). PRD accountable: Anatolijs Ropotovs (PRD RACI).
- Tech: Kashif Haq, Moin Moinuddin, Van Pham, Nenad Kosanovic, Lucas Claude (PRD)

## Demo flows

1. **Landing quest first.** Every visit starts with the "Thanks for landing" quest on XUI QuestCard: set a reminder, sign in or create an Xsolla ID, confirm email, get an XLA branded Backpack item (example "Early Bird 2026") right away. Works in November before launch (countdown to Dec 1). Granted once only. (PRD LQ-1 to LQ-4)
2. **Open today's door.** Live badge, countdown to 23:59:59 PT ticking every second from server time, real-time "N left" against the daily cap (hidden for uncapped doors). Signed out: visible items shown, gold bonus slot locked "Sign in to reveal". Signed in: gold bonus revealed and added to the bundle. (PRD LD-1, LD-2, LD-7)
3. **Claim.** Requires Xsolla ID and confirmed email. A $0 PayStation checkout with no payment fields. Each item lands in the Backpack as a code with item name, image in its XLA shell, game, redeem steps and code expiry. Player gets the PayStation receipt plus a branded Advent Calendar email (Backpack link, redeem steps, tomorrow's teaser, reminder settings). In the demo the emails appear as a confirmation state only. Then the door shows "Claimed, in your Backpack" with a tomorrow teaser. (PRD CL-1 to CL-3, section 8)
4. **Limits.** One bundle per Xsolla ID per day; a second try shows "Already in your Backpack". Cap is hard: at zero the door switches to Sold out with claim disabled and a tomorrow teaser. Failed claims consume no cap and show a retry message. (PRD LD-3, LD-4, CL-4, CL-5)
5. **See missed, teased and locked doors.** Past doors are Gone (not claimable, no catch-up). The next 3 doors are teased (branded shell plus one-line hint, reward hidden). Later doors show "Opens Dec N" with date only. (PRD section 8, LD-5, LD-6)
6. **Grand drop.** Dec 24, 25 and 31 are labeled Grand drop in the grid from Day 1 and use the ticket stub shell. (PRD LD-8)
7. **Bonus quests.** One news quest per door (partner release, update or trailer) and all-month quests (Follow XLA on Instagram, Join the Discord, Invite a friend), each on XUI QuestCard, each completed once, each adding one item. (PRD BQ-1, BQ-2) Grant reiterated that quests are tied to receiving calendar rewards. (Slack, Oct 22 and Oct 23)

## What "live" means

- Interactive, clickable prototype driven by **seeded data** (`data/doors.sample.json`) with mock partners. See decisions.md D-003.
- Assumption: countdown and "N left" counter are simulated client-side, not backed by a real inventory. (The real product uses server time and an atomic server-side cap, PRD LD-1, section 11.)
- A demo control to set "today" to any date so every door state can be shown. Matches PRD AD-4 "preview any day" on staging. See decisions.md D-016.
- TODO: confirm whether any part of the demo must hit a real service. Sources are silent for the demo.

## Views

- Hero: "31 days of free loot", "Open today's door", "Remind me daily". Status chips: Live, Tomorrow, Gone, Opens Dec N, Beta access, Grand drop. (Jira, mockup description)
- Today's door with Ends in countdown, "N left" counter, claim button, gold bonus slot, two "your game" slots in official XLA shells. (One-pager, Jira)
- Month grid: every door in December, with a "show this week only" toggle. States: locked (Opens Dec N), teased, available (Live), sold out, claimed, missed (Gone); Beta access door (example Dec 15) and grand drop labels. (Jira, PRD section 8)
- Quest area: landing quest, one news bonus quest per door, all-month quests, all as XUI QuestCard. (PRD)
- How it works in three taps: sign in with Xsolla ID, open today's door, find it in your Backpack. (Jira)
- Partner pitch band: "Your game on December 12?" with buttons "Claim a door" and "Talk to us". (Jira)
- Footer: one bundle per Xsolla ID per day, gone at 11:59 pm PT. (Jira)
- Desktop and mobile layouts, designed phone first: 16px gutters, no horizontal scroll, tap targets 44px or more. (PRD section 11)
- Reused page widgets: XLA header, hero banner, item card row, quest card list, steps row, CTA band. Door grid is the extended Web Shop Daily Rewards block (Advent Mode), not a new plugin. (PRD section 10)
- "Your door, any day": listed on the month grid in the one-pager. Most likely the open-door slot that invites partners to claim any free day (it matches the "Claim a door" pitch and the form option "Any day in December"). Assumption, see D-014. TODO: confirm with Menshi or the Make file.
- Beta access door: a door carrying the Beta access label chip (example Dec 15). It follows normal door rules. (PRD section 8, AD-1)
- Gold rare item revealed on sign-in: the hidden gold bonus (PRD LD-7). Resolved.
- Two "your game" slots in official XLA shells: partner items shown inside XLA shells (cartridge, dome, crate, ticket stub, lanyard pass, gift card holder) on today's door. (One-pager, PRD glossary) TODO: exact contents of the second slot.

## Out of scope (for the demo)

- Assumption: real authentication, real PayStation checkout, real email sending.
- Assumption: partner door admin, code CSV upload and claim reports (these are MVP product features, PRD AD-1 to AD-6, but not part of the demo).
- Localisation: product MVP is English only. (PRD scope)
- Regional legal restrictions logic: product MVP is global minus Legal restrictions. (PRD scope) Not modelled in the demo.
- Catch-up on missed doors, guest claims, custom quest UI, a one-off calendar plugin: "Not doing" in the PRD scope.
- Public-holiday data of any kind.

## Brand rules and tokens

Confirmed rules (source: Shurick, Oct 21, restated as binding in PRD section 10; see decisions.md):

- Use XUI elements and widgets only. Everything should be a reusable XLA or XUI widget. Existing widgets look as before.
- Quests use the real XLA quest system with XUI QuestCard. No custom quest UI.
- UX may borrow from other games' advent calendars. UI comes only from XUI.
- Tiles have straight corners, with labels above the tiles.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack". (Player-facing copy does.)
- Game names in mockups are illustrative only. No partner is confirmed.
- Accessibility: WCAG 2.2 AA, keyboard-reachable doors, screen reader labels for states and countdown (announced politely, not every second), colour never the only state signal, reduced motion respected for the unpacking animation. (PRD section 11)

Tokens: use the `xsolla-ui-design` skill for colours, type, spacing and radii. Never invent hex values.

- Door state colours (locked, teased, available, sold out, claimed, missed, grand): TODO, map to xsolla-ui-design tokens. Sources are silent.
- Typography: real Xsolla brand fonts wanted for polish; the demo and one-pager draft used the live demo's styles. (One-pager) TODO: which brand font files.
- Mockup label "new plugin" on the door grid: must change. The grid is the extended Daily Rewards block (PRD section 10; reuse decision proposed for Oct 23). TODO: final label text.

## Links

- Original Make demo: https://www.figma.com/make/1KPNyHVbMijBYnbW0Y9EuG
- Figma design: https://www.figma.com/design/J8B83IdCvU5ujKUruhXopA
- Confluence overview: XNTWRK page 25430163555
- PRD, MVP phase 1: XNTWRK page 25430294608
- Partner one-pager: XNTWRK page 25430655030; onboarding form and asset spec: XNTWRK page 25430458453
- Jira tracking: GTKN-270 (children GTKN-271 to GTKN-277)
- Slack: #advent-calendar (private)
