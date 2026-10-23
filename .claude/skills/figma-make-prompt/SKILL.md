---
name: figma-make-prompt
description: Turns a product brief (BRIEF.md + seed data JSON + brand tokens) into a staged sequence of short Figma Make prompts that the user pastes in one at a time, with a verify checklist after each stage and a fix-prompt pattern for when Make breaks something. Figma Make drifts on long one-shot prompts, so this skill stages it. Use when the user says "figma make", "make prompt", "prototype in figma make", "recreate this figma make", or asks for prompts to build a clickable prototype or live demo in Figma Make.
---

# Figma Make Prompt Skill

Produces six numbered Figma Make prompts (one per stage) plus a verify checklist for each. The user pastes them into Figma Make in order and checks the result before moving on. Templates live in `references/prompt-templates.md`.

## Why staged

Figma Make loses earlier constraints on long prompts: colors drift, data gets invented, layouts reshuffle. Short prompts that each restate the locked constraints keep it on track. One stage per prompt. Never merge stages.

## Inputs required

| Input | Where it comes from | Used in |
|---|---|---|
| Goal | BRIEF.md: one sentence on what the prototype proves | Every prompt (constraint header) |
| Audience | BRIEF.md: who watches the demo | Stage 1, Stage 6 copy tone |
| Demo flows | BRIEF.md: 3 to 5 named flows, each a short click path | Stage 3, Stage 4 |
| Data source | Seed JSON file, plus a note on which pieces are real APIs | Stage 2 |
| Brand tokens | See Brand tokens (priority order) | Stage 1 header, every later header |
| Facts | Every real-world claim in the brief or seed data | Stage 2, Stage 3, footer copy |

### Gate: refuse until complete

Before writing any prompt, check all six inputs. If anything is missing or vague, do NOT generate prompts. Reply with a list of what is missing, for example:

```
Missing before I can write the Figma Make prompts:
- Demo flows: brief lists 2, need 3 to 5 named click paths.
- Brand tokens: no hex values for primary or surface. Which tokens should I use?
- Facts: venue "QSNCC Bangkok" has no source. Source it or mark it placeholder.
```

"Vague" means: goal without a measurable outcome, flows without a start and end (screen or page section), data JSON absent or over ~3 KB with no subset chosen.

**Fact sourcing.** Every factual claim (event name, dates, venue, booth, people, partners, prices) carries a source tag (Confluence page ID, URL, Slack link, or "brief") or is labeled `placeholder`. Never infer an identity from a similar name without saying so. Footer and disclaimer copy must match the real split: if the name and dates are sourced but the agenda is not, say exactly that ("Agenda and speakers are placeholders"), not "Event details are placeholders".

## Brand tokens (priority order)

1. The project's own `tokens.json` (in the project folder) wins.
2. For a value the tokens file lacks, use `anthropic-skills:xsolla-ui-design` or `shurick-start:xsolla-design`, and list each value taken from there in the output.
3. Brief values come last. Never invent hex values, font names or spacing. If no source has it, ask.
4. Write tokens into prompts as literal values (for example `primary #XXXXXX`), never as token names Make cannot resolve.
5. Stage 1 lists every color role the token source defines (no fixed slot count). XUI pages need at least: canvas, surface, text, muted text, primary, text on primary, focus or brand border, tile border, success.
6. Fonts: name the real fonts plus the token stack fallback. Make may not load cdn.xsolla.net fonts; the Stage 1 verify checks which font actually rendered.

## Brand block (Xsolla / x.la only)

For Xsolla or x.la projects, the `KEEP:` header of every stage prompt and every fix prompt includes, verbatim:

1. **Generic block:** `references/xsolla-brand-block.txt`. Project-neutral XUI rules and values. Always included.
2. **Project block (optional):** `brand-block.txt` from the project's own folder (for example `.claude/skills/xla-holiday-calendar/design/brand-block.txt`). Include it only for that project. Never paste another project's block into a new project; its screens and dates leak into the design.

Order: generic first, then project. Where they conflict, the project block wins; note the conflict in the output. If the project's `tokens.json` contradicts a generic value, flag it and ask before shipping. Do not paraphrase or shorten either block. For non-Xsolla projects, omit both.

Project rules (screens, data, copy) belong in the project's own skill, not here.

## Word cap

Each prompt: 150 words max. Count the `KEEP:` line and the stage instructions. Do NOT count the brand blocks (generic or project) or the pasted seed JSON in Stage 2. If a prompt runs over, shorten the instructions, never the blocks.

## Stage plan

Each prompt starts with a `KEEP:` block restating the locked constraints, then one stage's instructions only. Pick the variant that fits the brief.

**Multi-screen app** (routes, nav switches screens):

| # | Stage | What it asks Make to do | Locks after this stage |
|---|---|---|---|
| 1 | Shell, layout and tokens | App frame, nav, page grid, brand tokens as CSS variables | Layout, nav, tokens |
| 2 | Seed data | Paste the JSON inline; hardcode it as a constant, no fetch, no invented rows | Data shape and values |
| 3 | Core views | Screens each demo flow needs, bound to the seed data | Screen list and routing |
| 4 | Interactions and states | Click paths per flow; empty, loading, hover, selected, error states | Behavior |
| 5 | Responsive and a11y | Breakpoints, focus rings, contrast, labels, keyboard nav | Responsive rules |
| 6 | Polish | Copy pass, spacing rhythm, micro-transitions, demo reset control | Final |

**Single page with widgets** (landing or event page, anchor nav, embedded widgets such as a game, form or tabs):

| # | Stage | What it asks Make to do | Locks after this stage |
|---|---|---|---|
| 1 | Page frame and tokens | Sticky header with anchor links, section order, grid, tokens as CSS variables | Section order, tokens |
| 2 | Seed data | Same as above | Data shape and values |
| 3 | Sections and widgets | Each section bound to seed data; widgets drawn static | Section and widget list |
| 4 | Widget behavior and states | Each widget works start to end; anchors scroll; empty, hover, selected, error states | Behavior |
| 5 | Responsive and a11y | Same as above | Responsive rules |
| 6 | Polish | Same as above | Final |

Templates for both are in `references/prompt-templates.md`. Drop a state placeholder that cannot occur (for example a loading skeleton on a page with no view changes) and say so in the output. The `KEEP:` block grows each stage: Stage 4 restates tokens, layout, the data constant and the screen or section list.

## Timers, randomness and game logic

- Timers and countdowns are simulated on the client. A countdown to an event date counts from a fixed `demoNow` in the seed data, so the demo never drifts or shows a negative time.
- State the duration, what happens at zero, and the scoring or unlock rule in Stage 4 as numbers (for example "30 s round, Claim unlocks at score 10").
- Randomness uses a fixed seed or a fixed sequence so every demo run looks the same.
- Reduced motion: under `prefers-reduced-motion`, remove animation and transitions, but the timer text still updates. Announce time with `aria-live="polite"` at coarse steps (every 10 s, then the last 5 s), not every tick.
- Verify: the timer really counts the stated duration, zero triggers the end state, reduced motion keeps it usable.

## Breakpoints

Test at 360, 390, 768 and 1280 px. No horizontal scroll at any width. 360 px is the floor for house pages; the XUI breakpoints (600, 960, 1024) may be used for layout changes in between.

## Live demo rule

- Seed fake but realistic data. Every number in the demo comes from the Stage 2 constant.
- If any piece must call a real API, mark it in the prompt with `[REAL API]` and name the endpoint.
- Every `[REAL API]` piece gets a fallback: on error or timeout over 2 s, render the seeded data and show a small "demo data" badge.
- Add a hidden or corner "Reset demo" control in Stage 6 so the presenter can restart a flow.

## Fix-prompt pattern

When Make breaks something that previously worked, do not re-paste a stage prompt. Send a short fix prompt:

```
KEEP: {{brand blocks, verbatim, Xsolla / x.la only}}
Change only: {{component or screen}}. It currently {{what it does}}; it should {{expected result}}.
Keep everything else exactly as it is: layout, tokens, data, screens, interactions.
Do not refactor, rename or restyle anything else.
```

Rules: one fix per prompt, name the exact component or screen, state the expected result. If two fixes fail in a row, roll back to the last good version in Make and re-run the current stage prompt.

## Workflow

1. Read BRIEF.md, the seed JSON, the project's `tokens.json` and any project brand block.
2. Run the gate (all six inputs, including fact sourcing). If anything is missing, list it and stop.
3. Load brand tokens in priority order. Ask if any are missing.
4. Pick the stage plan variant. Fill the six templates. Keep each under the word cap; if the seed JSON makes Stage 2 unwieldy, trim it to the rows the flows use and say so.
5. Scan the output for em-dashes and replace them (house rule).
6. Write the result to `PROMPTS.md` in the project folder (or reply in chat if there is no project folder), then reply with a short summary and the file path.

## Output format

`PROMPTS.md` opens with the gate table (each input, pass or fail, note) and a facts table (claim, source tag or `placeholder`). Then, per stage:

````
## Stage 1: Shell, layout and tokens

```
{{prompt text}}
```

Verify before Stage 2:
- [ ] {{check}}
````

Repeat for Stages 2 to 6. End with the fix-prompt template, any token values taken from a design skill, and a short list of `[REAL API]` pieces and their fallbacks (or "None: fully seeded").

### Default verify checks

- Stage 1: tokens applied (spot-check canvas, surface and primary hex in the inspector), nav present, no stray colors, rendered font is the named font or the stated fallback.
- Stage 2: data renders verbatim, no extra or invented rows, no network calls.
- Stage 3: every flow has its screens or sections, all show seed data, Stage 1 layout unchanged. Xsolla: tiles 0 px corners with labels above, buttons keep XUI radius, quests use `xui-quest-card__status--{status}`.
- Stage 4: each flow works start to end; empty, hover, selected, error states visible (loading only if views change); timers count the stated duration.
- Stage 5: no horizontal scroll at 360, 390, 768, 1280 px; tab order sensible; focus ring visible; text contrast passes; reduced motion respected.
- Stage 6: copy fits the audience, footer and disclaimer match the facts table, reset control works, nothing regressed.

## Hard rules

- Never generate prompts before the gate passes.
- Never invent brand values or facts. Ask, or label placeholder.
- One stage per prompt; every prompt and fix prompt opens with `KEEP:` (and the brand blocks for Xsolla / x.la).
- No em-dashes in prompts, checklists or this skill's output.
