---
name: xla-holiday-calendar
description: Project memory for recreating the "XLA Holiday Calendar (live demo)", an advent-style rewards calendar on x.la (December 2026, one door per day with a free partner bundle), originally prototyped in Figma Make. Holds the brief, the door data schema and sample data, and the decision log so every AI iteration stays consistent. Use when working on the holiday calendar, the XLA calendar, the advent calendar, or the holiday demo, before any design, prompt, or copy work. Hands off to figma-make-prompt for staged Figma Make prompts.
---

# XLA Holiday Calendar Skill

Single source of truth for rebuilding the **XLA Holiday Calendar (live demo)**: an advent-style rewards calendar, not a public-holiday calendar. Every day of December 2026 one door opens on x.la with a free partner-donated bundle. Players sign in, claim before midnight PT, and the items land in their inventory. Dec 24, 25 and 31 are grand drops.

This skill does not generate screens. It keeps the brief, the data, and the decisions stable so each AI iteration starts from the same facts.

Triggers: "holiday calendar", "XLA calendar", "holiday demo", "advent calendar".

## Files

| File | Holds |
|---|---|
| `BRIEF.md` | Goal, audience, people (roles), demo flows, what "live" means, views, out of scope, brand rules and token pointer, links. Unknowns are `TODO`. |
| `data/doors.schema.json` | JSON Schema for one door and the file wrapper. States: locked, teased, available, claimed, sold_out, missed. Optional fields: special_label, shell, cap, remaining, hint, gold_bonus, news_quest. |
| `data/doors.sample.json` | Fake sample doors (under `doors`) to seed the demo. Partner and game names are illustrative only. |
| `decisions.md` | Append-only log of settled choices. Newest at the bottom. |

## Step 1: Load context before any design work

Read, in order: `BRIEF.md`, `data/doors.schema.json`, `data/doors.sample.json`, `decisions.md`.

- A `decisions.md` entry overrides `BRIEF.md` when they disagree. Flag the conflict and offer to update the brief.
- `assumption, confirm` entries are working defaults. Use them, but surface them when they shape the output.
- Never fill a `TODO` silently. Ask, or label the guess as an assumption.

## Step 2: Record decisions

Whenever the user settles a choice (layout, door state, copy, token, data rule), append an entry to `decisions.md` using its template. Never edit or delete a past entry: supersede it with a new one that names the old ID.

## Step 3: Hand off for prompts

To turn this into Figma Make prompts, use the sibling skill **`figma-make-prompt`**. Pass it the brief, the schema, the sample doors, and the current decisions. Do not write Figma Make prompts from this skill.

## Step 4: Review passes

- Accessibility: `design:accessibility-review` on each iteration (contrast, keyboard order through the door grid, focus states, screen reader labels for door state and countdown).
- Copy: `design:ux-copy` for door states, countdown, claim confirmation, locked, teased, sold out and missed doors, empty and error states.
- Log any change these passes cause in `decisions.md`.

## Data rules

- `date` is ISO 8601 (`YYYY-MM-DD`). `claim_deadline_pt` is ISO 8601 with the PT offset (`-08:00` in December).
- `day` 1 to 31 matches the day of `date`. `tier` is `grand` only for days 24, 25, 31 unless a decision says otherwise.
- Keep the sample valid against the schema and keep its `_note` saying it is sample data.

## Brand

Rules are in BRIEF.md and confirmed in decisions.md (XUI only, QuestCard for quests, straight-corner tiles with labels above, XUI button radius). Tokens come from the `xsolla-ui-design` skill. Never invent hex values.

## Gotchas

- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names in mockups are illustrative only. No partner is confirmed.
- Do not use public-holiday data. This is not that product.
- No em-dashes in any file, prompt, or UI copy (house rule).
