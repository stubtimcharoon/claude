# BRIEF: Xsolla event page, "Asia Games Com"

Test project for the `figma-make-prompt` skill. Concept mockup, not a live page.

## Event facts and sources

The request named the event "Asia Games Com". Confluence has no event by that name; the closest match is gamescom asia 2026, where Xsolla has a booth. This brief treats them as the same event. If that assumption is wrong, every fact below becomes a placeholder.

| Fact | Value | Status | Source |
|---|---|---|---|
| Event name | gamescom asia x Thailand Game Show 2026 | Sourced | Confluence MAR 24147689473 "10/29 - 10/30 - gamescom asia 2026" |
| Dates | 29 to 30 October 2026 | Sourced | same page |
| Venue | Queen Sirikit National Convention Center (QSNCC), Bangkok | Sourced | same page (Plenary Hall, Level 1) |
| Xsolla booth | Booth E21, B2B Hall | Sourced | same page |
| Agenda sessions, times, rooms | see `data/event.sample.json` | **Placeholder (sample)** | none |
| Speakers | see `data/event.sample.json` | **Placeholder (sample)** | none |
| Leaderboard names and scores | see `data/event.sample.json` | **Placeholder (sample)** | none |
| Reward item | "Sample booth merch item" | **Placeholder** | none |
| Meeting slots | see `data/event.sample.json` | **Placeholder (sample)** | none |
| FAQ answers | written for the mockup | **Placeholder** | none |

Searched with no event-specific hit: Slack ("Asia Games"), Google Drive ("Asia Games Com"). Slack and Drive only confirmed team travel to gamescom asia in Thailand at the end of October.

## Goal

Prove that a phone-first event page can turn a booth visitor into an engaged lead in under 2 minutes: the visitor finishes one 30-second game round and either claims the reward or requests a meeting. Measurable in the demo: game start to reward code shown in at most 4 taps after the round ends; meeting request sent in at most 4 taps from the booth section.

## Audience

Attendees on their phones at or near the Xsolla booth (mostly game studio developers and business people, some players from the consumer show). One hand, short attention, bright hall, often poor network. The presenter is a booth staff member handing over a phone or pointing to a QR code.

## Demo flows (start screen to end screen)

1. **Play and claim**: Hero "Play the booth game" > Game widget Start > 30 s round > End screen with score > "Claim reward" > Reward code screen ("Show this at Booth E21").
2. **Replay and leaderboard**: End screen > "Play again" > second round > End screen > Leaderboard shows "You" ranked against sample scores.
3. **Book a meeting**: Hero "Book a meeting" (or Booth section CTA) > meeting form > choose slot > "Send request" > confirmation message.
4. **Browse agenda**: Agenda section > "Day 2" tab > session tile > speaker name and room visible.
5. **FAQ**: FAQ section > open "Where is the Xsolla booth?" > answer shows Booth E21.

## Sections (top to bottom)

1. Header: Xsolla wordmark text, anchor nav (Agenda, Game, Booth, FAQ), theme toggle.
2. Hero: event name, dates, venue, booth number; CTAs "Play the booth game" (primary) and "Book a meeting" (secondary).
3. Agenda: Day 1 and Day 2 tabs, session tiles with time label above each tile.
4. Speakers: speaker tiles with role label above.
5. Xsolla booth: booth location, three booth quests (XUI QuestCard), book-a-meeting CTA and form.
6. Minigame widget: 30 s tap game on a 3x3 tile grid, score, timer, leaderboard stub, claim reward end state.
7. FAQ: 4 questions, disclosure pattern.
8. Footer: "Concept mockup. Event details are placeholders."

## Data

- Seed: `data/event.sample.json` (about 1.9 KB, under the skill's 3 KB limit). All rows are fake except the `event` block.
- Real APIs: none. Fully seeded. Leaderboard and meeting form are local stubs; nothing is sent anywhere.

## Brand

- Tokens: `.claude/skills/xla-holiday-calendar/design/tokens.json` (Pentagram Dark default, Pentagram Light available).
- Rules: `XUI-GUIDE.md` and `brand-block.txt` in the same folder, plus `anthropic-skills:xsolla-ui-design` component specs (button, tag, quest-card).
- Fonts: Pilat Wide and Aktiv Grotesk load from cdn.xsolla.net, which this prototype may not use. The prototype falls back to Noto Sans (named in the token font stack) from Google Fonts. Figma Make prompts name the real fonts.
