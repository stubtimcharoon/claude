# Figma Make Stage Templates

Fill every `{{placeholder}}`. Keep each filled prompt at 150 words max (brand blocks and the Stage 2 seed JSON do not count). The `KEEP:` block carries forward everything locked by earlier stages. No em-dashes.

`{{brand_block}}`: for Xsolla or x.la projects, paste `references/xsolla-brand-block.txt` verbatim, then the project's own `brand-block.txt` verbatim if it has one. For any other project, delete the placeholder line. It appears in every stage and in the fix prompt.

Single-page variant: use the Stage 1, 3 and 4 alternates at the end of this file. Stages 2, 5 and 6 are shared (read "screens" as "sections").

## Stage 1: Shell, layout and tokens

```
KEEP: This is a {{product_name}} prototype for {{audience}}. Goal: {{goal}}.
{{brand_block}}

Build only the app shell. No content screens yet.
- Layout: {{layout_description}} (for example left sidebar nav, top bar, main content area).
- Nav items: {{nav_items}}.
- Define these as CSS variables and use only them:
  {{color_roles}}
  Font {{font_family}} (fallback {{font_fallback}}); sizes {{type_scale}}; radius {{radius}}; spacing unit {{spacing_unit}}.
- Do not add any other colors or fonts.
- Main area shows a placeholder "Content" label for now.
```

`{{color_roles}}`: one `role #hex` pair per color the token source defines, comma separated, no fixed count. For XUI include at least canvas, surface, text, muted, primary, text on primary, focus border, tile border, success.

## Stage 2: Seed data

```
KEEP: Shell, nav and CSS variables from the previous step. Do not change layout or colors.
{{brand_block}}

Add this data as a hardcoded constant named {{data_constant_name}} in its own file. Use it exactly as written. Do not fetch, generate or add rows.

{{seed_json}}

Show a temporary debug list of {{primary_entity}} names in the main area so I can confirm the data loaded.
{{real_api_note}}
```

`{{real_api_note}}`: either empty, or `[REAL API] {{endpoint}} provides {{field}}. Call it, and on error or after 2 s fall back to {{data_constant_name}} and show a small "demo data" badge.`

## Stage 3: Core views

```
KEEP: Shell, nav, CSS variables, and the {{data_constant_name}} constant. Do not edit the data or the tokens.
{{brand_block}}

Replace the debug list with these screens, all reading from {{data_constant_name}}:
1. {{screen_1_name}}: {{screen_1_content}}
2. {{screen_2_name}}: {{screen_2_content}}
3. {{screen_3_name}}: {{screen_3_content}}
{{more_screens}}
Wire nav items to these screens. Static views only; no hover or loading states yet.
```

## Stage 4: Interactions and states

```
KEEP: Shell, CSS variables, {{data_constant_name}}, and screens {{screen_list}}. Do not restyle or reorder anything.
{{brand_block}}

Make these demo flows clickable end to end:
- {{flow_1_name}}: {{flow_1_path}}
- {{flow_2_name}}: {{flow_2_path}}
- {{flow_3_name}}: {{flow_3_path}}
{{more_flows}}
Add states using existing tokens only:
- Empty: {{empty_state_copy}} when a list has no items.
- Loading: skeleton for {{loading_ms}} ms on screen change (delete this line if no view changes).
{{timer_rule}}
- Hover and selected: {{hover_selected_rule}}.
- Error: {{error_state_copy}}.
```

`{{timer_rule}}`: empty, or `- Timer: {{duration}} s, simulated on the client, starts on {{trigger}}; at zero show {{end_state}}. {{scoring_rule}}. Countdowns count from demoNow in {{data_constant_name}}.`

## Stage 5: Responsive and accessibility

```
KEEP: Everything from previous steps: tokens, data, screens, flows and states. Change layout only at the breakpoints below.
{{brand_block}}

Responsive (must work at 360, 390, 768 and 1280 px, no horizontal scroll at any width):
- Under 768 px: {{mobile_rule}} (for example sidebar collapses to a bottom tab bar).
- 768 to 1279 px: {{tablet_rule}}.
- 1280 px and up: current layout.
Accessibility:
- Visible focus ring using {{color_accent}}.
- Logical tab order through each flow.
- Labels on every icon button and input.
- Text contrast at least 4.5:1; if a token pair fails, tell me instead of changing the color.
- Under prefers-reduced-motion: no animation or transitions; timers still update their text.
```

## Stage 6: Polish

```
KEEP: Everything from previous steps. No new screens, colors, fonts or data.
{{brand_block}}

Polish for a live demo to {{audience}}:
- Rewrite UI copy in a {{tone}} tone; keep labels under {{max_label_words}} words.
- Even spacing on the {{spacing_unit}} grid.
- Subtle transitions ({{transition_ms}} ms) on screen change and selection.
- Add a small "Reset demo" control in {{reset_location}} that restores the initial state.
- Footer disclaimer: {{disclaimer}} (must match the facts table: name what is placeholder).
- Page title: {{page_title}}.
```

## Fix prompt

```
KEEP:
{{brand_block}}
Change only: {{component_or_screen}}. It currently {{current_behavior}}; it should {{expected_behavior}}.
Keep everything else exactly as it is: layout, tokens, data, screens, interactions.
Do not refactor, rename or restyle anything else.
```

## Single-page variant: Stage 1 (page frame and tokens)

```
KEEP: This is a {{product_name}} page for {{audience}}. Goal: {{goal}}.
{{brand_block}}

Build only the page frame. No section content yet.
- Sticky header with anchor links: {{anchor_links}}.
- Empty sections in this order, each with an id matching its link: {{section_order}}.
- Define these as CSS variables and use only them:
  {{color_roles}}
  Font {{font_family}} (fallback {{font_fallback}}); sizes {{type_scale}}; radius {{radius}}; spacing unit {{spacing_unit}}.
- Do not add any other colors or fonts.
```

## Single-page variant: Stage 3 (sections and widgets)

```
KEEP: Header, section order, CSS variables, and the {{data_constant_name}} constant. Do not edit the data or the tokens.
{{brand_block}}

Replace the debug list. Fill each section from {{data_constant_name}}:
1. {{section_1_name}}: {{section_1_content}}
2. {{section_2_name}}: {{section_2_content}}
{{more_sections}}
Widgets, drawn static for now: {{widget_list}}.
Anchor links scroll to their section. No hover or game logic yet.
```

## Single-page variant: Stage 4 (widget behavior and states)

```
KEEP: Header, sections {{section_list}}, CSS variables, {{data_constant_name}}. Do not restyle or reorder anything.
{{brand_block}}

Make each widget work start to end:
- {{widget_1_name}}: {{widget_1_path}}
- {{widget_2_name}}: {{widget_2_path}}
{{more_widgets}}
{{timer_rule}}
States using existing tokens only:
- Empty: {{empty_state_copy}}.
- Hover and selected: {{hover_selected_rule}}.
- Error: {{error_state_copy}}.
```
