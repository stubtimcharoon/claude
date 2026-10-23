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
| Brand tokens | Design skill or a tokens file (colors, type, radius, spacing) | Stage 1 header, every later header |

### Gate: refuse until complete

Before writing any prompt, check all five inputs. If anything is missing or vague, do NOT generate prompts. Reply with a list of what is missing, for example:

```
Missing before I can write the Figma Make prompts:
- Demo flows: brief lists 2, need 3 to 5 named click paths.
- Brand tokens: no hex values for primary or surface. Which tokens should I use?
```

"Vague" means: goal without a measurable outcome, flows without a start and end screen, data JSON absent or over ~3 KB with no subset chosen.

## Brand tokens

1. If `anthropic-skills:xsolla-ui-design` or `shurick-start:xsolla-design` is available, load it and pull the token values (color, type scale, radius, spacing) from it.
2. Otherwise use tokens from the brief or a tokens file the user provides.
3. Never invent hex values, font names or spacing. If a token is missing, ask. Do not guess "close enough" colors.
4. Write tokens into prompts as literal values (for example `primary #XXXXXX`), never as token names Make cannot resolve.

## Brand constraints block (Xsolla / x.la only)

When the project is Xsolla or x.la, every stage prompt (and every fix prompt) restates this block verbatim inside its `KEEP:` header. Do not paraphrase or shorten it. For other projects, omit it. The block (about 40 words) does not count toward the ~150 word limit.

```
BRAND (do not change):
- Use XUI elements and widgets only.
- Use the XUI QuestCard for quests.
- Tiles have straight corners, with labels above them.
- Buttons keep the XUI radius.
- Partner-facing copy never names "Xsolla ID" or "Backpack".
- Game names are illustrative placeholders.
```

Project-specific rules (screens, data, copy) belong in the project's own skill (for example `xla-holiday-calendar`), not here.

## Stage plan

Each prompt: under ~150 words, starts with a `KEEP:` block restating the locked constraints, then one stage's instructions only.

| # | Stage | What it asks Make to do | Locks after this stage |
|---|---|---|---|
| 1 | Shell, layout and tokens | App frame, nav, page grid, apply brand tokens as CSS variables | Layout, nav, tokens |
| 2 | Seed data | Paste the JSON inline; tell Make to hardcode it as a constant, no fetch, no invented rows | Data shape and values |
| 3 | Core views | Build the screens each demo flow needs, bound to the seed data | Screen list and routing |
| 4 | Interactions and states | Click paths for each flow; empty, loading, hover, selected, error states | Behavior |
| 5 | Responsive and a11y | Breakpoints (mobile, tablet, desktop), focus rings, contrast, labels, keyboard nav | Responsive rules |
| 6 | Polish | Copy pass for the audience, spacing rhythm, micro-transitions, demo reset button | Final |

The `KEEP:` block grows each stage. Stage 4's header, for example, restates tokens, layout, the data constant and the screen list.

## Live demo rule

- Seed fake but realistic data. Every number in the demo comes from the Stage 2 constant.
- If any piece must call a real API, mark it in the prompt with `[REAL API]` and name the endpoint.
- Every `[REAL API]` piece gets a fallback: on error or timeout over 2 s, render the seeded data and show a small "demo data" badge.
- Add a hidden or corner "Reset demo" control in Stage 6 so the presenter can restart a flow.

## Fix-prompt pattern

When Make breaks something that previously worked, do not re-paste a stage prompt. Send a short fix prompt:

```
Change only: {{the one thing that is wrong, and what it should be}}.
Keep everything else exactly as it is: layout, tokens, data, screens, interactions.
Do not refactor, rename or restyle anything else.
```

Rules: one fix per prompt, name the exact component or screen, state the expected result. If two fixes fail in a row, roll back to the last good version in Make and re-run the current stage prompt.

## Workflow

1. Read BRIEF.md, the seed JSON and the tokens source.
2. Run the gate. If anything is missing, list it and stop.
3. Load brand tokens (see Brand tokens). Ask if any are missing.
4. Fill the six templates from `references/prompt-templates.md`. Keep each under ~150 words; if the seed JSON pushes Stage 2 over, trim the JSON to the rows the flows use and say so.
5. Scan the output for em-dashes and replace them (house rule).
6. Return the output in the format below.

## Output format

````
## Stage 1: Shell, layout and tokens

```
{{prompt text}}
```

Verify before Stage 2:
- [ ] {{check}}
- [ ] {{check}}
````

Repeat for Stages 2 to 6. End with the fix-prompt template and a short list of `[REAL API]` pieces and their fallbacks (or "None: fully seeded").

### Default verify checks

- Stage 1: tokens applied (spot-check primary and surface hex in the inspector), nav present, no placeholder lorem colors.
- Stage 2: data renders verbatim, no extra or invented rows, no network calls.
- Stage 3: every demo flow has its screens, every screen shows seed data, Stage 1 layout unchanged.
- Stage 4: each flow clickable start to end; empty, loading, hover, selected states visible.
- Stage 5: works at 375 px, 768 px, 1440 px; tab order sensible; focus ring visible; text contrast passes.
- Stage 6: copy fits the audience, reset control works, nothing from earlier stages regressed.

## Hard rules

- Never generate prompts before the gate passes.
- Never invent brand values. Ask.
- One stage per prompt; every prompt opens with `KEEP:`.
- No em-dashes in prompts, checklists or this skill's output.
