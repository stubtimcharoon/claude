# XUI Guide: XLA Holiday Calendar (x.la, December 2026)

Design reference for the 31-door advent rewards calendar. It feeds Figma Make prompts and the HTML mockup. Every value carries a source tag. `TODO` means no source had a value: do not guess it.

Built 2026-10-23. Figma was network-blocked, so nothing here was read from Figma files directly.

## 0. Source tags

| Tag | Source | Notes |
|---|---|---|
| `[XUI-dark]` | `xsolla-ui-design` skill, `templates/base.html` `:root` (Pentagram Dark, mirrors `packages/core/src/tokens/pentagram-dark.json`) | Canonical token names and values. Highest authority. |
| `[XUI-light]` | `xsolla-ui-design` skill, `templates/base-light.html` `:root` (Pentagram Light) | Same names, light values. |
| `[XUI-type]` | `xsolla-ui-design` `core/tokens/typography.md` | B2C / B2B / Pay Station scales. |
| `[XUI-space]` | `xsolla-ui-design` `core/tokens/spacing.md` | Spacing and radius scale. |
| `[XUI-skill]` | `xsolla-ui-design` `SKILL.md` (steps 6 to 8, rules 12 to 17) | Motion timing, layout patterns, shadow usage. |
| `[XUI-<component>]` | `xsolla-ui-design` `components/<name>.md` or `sections/<name>.md` | Component HTML/CSS/props. |
| `[XUI-icons]` | `xsolla-ui-design` `assets/icons-inline.md` | Inline SVG names. |
| `[CF-overview]` | Confluence XNTWRK 25430163555 "1. XLA Holiday Calendar - overview and direction" | Founder design rules (Shurick, Oct 21). |
| `[CF-ws1733]` | Confluence TUP 25262326029 "WS-1733 - Advent Calendar" | Web Shop Daily Rewards "Advent Mode" behavior. |
| `[JIRA-8828]` | DSD-8828 (Done) "UI and CTA Styles for Frontify guidelines: corner-radius 0 px" | Brand direction for square corners. |
| `[JIRA-10759]` | DSD-10759 (Done) "Add Rarity color tokens to the Design System and XUI" | Rarity token names; values only in Figma. |
| `[CF-sds-q4]` | Confluence SDS 25227100310 "Tasks Q4 2026" (DSD-11794 in progress) | "tile based layout, square corners, label style containers". |
| `[LEGACY]` | `shurick-start:xsolla-design-system` THEME.md / DESIGN.md and `shurick-start:xsolla-design` css-variables.md | Older `--xla-*` palette. Do NOT use for this build; listed only for conflicts. |
| `[CALC]` | WCAG 2.1 relative-luminance math run on the token values above | Alpha tokens composited over their background first. |

## 1. Theme

- Default theme: **Pentagram Dark**. Page `body` background is `--xui-bg-secondary`, never `--xui-bg-primary`. `[XUI-skill]`
- Light theme: **Pentagram Light** with the same variable names (`base-light.html`). `[XUI-light]`
- Only these two themes. No Xsolla Light/Dark or LTG themes. `[XUI-skill]`
- Whether x.la ships a light mode for this page: `TODO` (no source).

## 2. Color tokens

### 2.1 Surfaces and content

| Token | Dark | Light | Source |
|---|---|---|---|
| `--xui-bg-secondary` (page canvas) | `#141d1f` | `#f3f3f2` | `[XUI-dark]` `[XUI-light]` |
| `--xui-bg-primary` (tile surface, alt band) | `#1b2628` | `#ffffff` | `[XUI-dark]` `[XUI-light]` |
| `--xui-bg-brand-secondary` (one accent band per page max) | `#0b3841` | `#b2f2ff` | `[XUI-dark]` `[XUI-light]` `[XUI-skill]` |
| `--xui-content-primary` | `#e8eced` | `#000000` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-secondary` | `rgba(232,236,237,0.72)` | `rgba(0,0,0,0.75)` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-tertiary` (text floor) | `rgba(232,236,237,0.58)` | `rgba(0,0,0,0.6)` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-static-dark` | `#000000` | `#000000` | `[XUI-dark]` `[XUI-light]` |
| `--xui-border-secondary` (tile outline) | `rgba(178,242,255,0.1)` | `rgba(0,0,0,0.1)` | `[XUI-dark]` `[XUI-light]` |
| `--xui-overlay-mono` (QuestCard icon well) | `rgba(178,242,255,0.06)` | `rgba(0,0,0,0.05)` | `[XUI-dark]` `[XUI-light]` |
| `--xui-layer-scrim` (modal backdrop) | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.75)` | `[XUI-dark]` `[XUI-light]` |

### 2.2 Brand and state

| Token | Dark | Light | Source |
|---|---|---|---|
| `--xui-bg-brand-primary` | `#80eaff` | `#80eaff` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-brand-primary` | `#80eaff` | `#22a8c3` | `[XUI-dark]` `[XUI-light]` |
| `--xui-border-brand` | `#55dcf6` | `#31cae8` | `[XUI-dark]` `[XUI-light]` |
| `--xui-bg-brand-extra-primary` | `#cef655` | `#cef655` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-brand-extra-primary` | `#cef655` | `#79971b` | `[XUI-dark]` `[XUI-light]` |
| `--xui-border-brand-extra` | `#cef655` | `#bae831` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-on-brand` / `--xui-content-on-brand-extra` | `#000000` | `#000000` | `[XUI-dark]` `[XUI-light]` |
| `--xui-bg-success-primary` | `#95ff80` | `#95ff80` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-success-primary` | `#70f655` | `#30981b` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-on-success` | `#000000` | `#000000` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-warning-primary` | `#f6ab55` | `#c37822` | `[XUI-dark]` `[XUI-light]` |
| `--xui-content-alert-primary` | `#f67055` | `#e84f30` | `[XUI-dark]` `[XUI-light]` |
| `--xui-bg-alert-primary` | `#e84f30` | `#e84f30` | `[XUI-dark]` `[XUI-light]` |

### 2.3 Control tokens used here

| Token | Dark | Light | Source |
|---|---|---|---|
| `--xui-ctrl-brand-primary-bg` / `-hover` / `-press` | `#80eaff` / `#b2f2ff` / `#55dcf6` | same | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-brand-primary-border` / `-hover` | `#31cae8` / `#55dcf6` | same | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-brand-primary-bg-disable` | `rgba(52,71,75,0.85)` | `#cccccc` | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-brand-text-primary` | `#000000` | `#000000` | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-brand-extra-primary-bg` / `-hover` / `-press` | `#cef655` / `#bae831` / `#dfff80` | `#bae831` / `#cef655` / `#9bc323` | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-brand-extra-text-primary` | `#000000` | `#000000` | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-mono-secondary-bg` / `-border` | `#34474b` / `#4b6368` | `#dadbd7` / `#c1c2bc` | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-mono-text-secondary` | `#ffffff` | `#000000` | `[XUI-dark]` `[XUI-light]` |
| `--xui-ctrl-focus-border` | `#55dcf6` | `#31cae8` | `[XUI-dark]` `[XUI-light]` |

### 2.4 Rarity (grand drops)

| Token | Value | Source |
|---|---|---|
| Figma variables `tag-label/rarity` `bg-common`, `bg-uncommon`, `bg-rare`, `bg-epic`, `bg-legendary` + content | `TODO` (values live only in Figma, node 17494-15746; dev ticket XUITSD-109) | `[JIRA-10759]` |
| Intended hues: common white/grey, uncommon green, rare cyan/blue, epic purple, legendary orange/gold | descriptive only, no hex | `[JIRA-10759]` |

Do not use the `[LEGACY]` RarityBadge hexes (`#D9FF66` legendary etc.). They predate and contradict DSD-10759 (legendary is orange/gold there).

## 3. Typography

Context: **B2C** (consumer x.la page). The page is promotional, so rule 12 applies to `h1` and `h2`. `[XUI-skill]` `[XUI-type]`

| Role | Token / font | Size / line-height / weight | Source |
|---|---|---|---|
| Heading font | `--xui-font-heading-b2c` = Pilat Wide stack | | `[XUI-dark]` |
| Promo h1/h2 | `--xui-font-promo-heading`, `--xui-font-weight-promo-heading` = 700 | | `[XUI-dark]` `[XUI-skill]` |
| Body font | `--xui-font-body` = Aktiv Grotesk stack | | `[XUI-dark]` |
| display | B2C | 48 / 58px / 800 | `[XUI-type]` |
| h1 (page title) | B2C | 40 / 48px / 700 | `[XUI-type]` |
| h2 (section) | B2C | 32 / 38px / 700 | `[XUI-type]` |
| h3 | B2C | 28 / 34px / 700 | `[XUI-type]` |
| h4 (door number on tile) | B2C | 24 / 28px / 700 | `[XUI-type]` |
| h5 | B2C | 20 / 24px / 700 | `[XUI-type]` |
| body-lg | B2C | 18 / 24px / 400, accent 500 | `[XUI-type]` |
| body-md (countdown, bundle name) | B2C | 16 / 20px / 400, accent 500 | `[XUI-type]` |
| body-sm (labels above tiles) | B2C | 14 / 18px / 400, accent 500 | `[XUI-type]` |
| body-xs (fine print) | B2C | 12 / 16px / 400, accent 500 | `[XUI-type]` |
| QuestCard title / subtitle | fixed in component | 16/20 400 ; 12/18 400 | `[XUI-quest-card]` |

Font files load from `cdn.xsolla.net` via the `@font-face` block in `base.html`. `[XUI-dark]`

## 4. Spacing, radius, elevation

### 4.1 Spacing

| Token | Value | Use here | Source |
|---|---|---|---|
| `--xui-space-xs` | 4px | label to tile gap | `[XUI-space]` |
| `--xui-space-s` | 8px | tag insets, mobile tight gaps | `[XUI-space]` |
| `--xui-space-m` | 16px | grid gap, tile padding | `[XUI-space]` |
| `--xui-space-l` | 24px | section stack | `[XUI-space]` |
| `--xui-space-xl` | 32px | page band horizontal gutter | `[XUI-space]` `[XUI-skill]` |
| 12px step | `calc((var(--xui-space-s) + var(--xui-space-m)) / 2)` | footer padding | `[XUI-game-card]` |

Larger than 32px: `calc(var(--xui-space-xl) * 2)`. `[XUI-skill]`

### 4.2 Radius

| Element | Value | Source |
|---|---|---|
| **Door tile** | **0** (straight corners) | `[CF-overview]`, aligned with `[JIRA-8828]` and `[CF-sds-q4]` |
| Label above tile (Tag label) | 0 (square by spec) | `[XUI-tag-label]` |
| Button xl / lg / md | 8px | `[XUI-button]` size table |
| Button sm / xs | 4px | `[XUI-button]` size table |
| `--xui-radius-button` token | 4px | `[XUI-space]` |
| `--xui-radius-card` (modal) | 12px | `[XUI-space]` `[XUI-modal]` |
| `--xui-radius-tag-sm` (tag md/sm/xs) / `--xui-radius-tag-lg` (tag xl/lg) | 2px / 4px | `[XUI-space]` `[XUI-tag]` |
| QuestCard | 4px (component CSS) | `[XUI-quest-card]` |

"Buttons keep the XUI radius" means: keep the radius baked into the button size class. Do not set 0 on buttons. `[CF-overview]`

### 4.3 Elevation

| Token | Value | Use | Source |
|---|---|---|---|
| `--xui-shadow-surface` | `0px 1px 2px rgba(7,7,8,0.2), 0px 2px 6px 2px rgba(7,7,8,0.1)` | tiles at rest, QuestCard | `[XUI-dark]` `[XUI-skill]` |
| `--xui-shadow-surface-hover` | `0px 4px 8px 3px rgba(7,7,8,0.1), 0px 1px 3px rgba(7,7,8,0.2)` | available tile hover | `[XUI-dark]` |
| `--xui-shadow-popover` | `0px 6px 10px 4px rgba(7,7,8,0.1), 0px 2px 3px rgba(7,7,8,0.2)` | tooltips | `[XUI-dark]` |
| `--xui-shadow-modal` | `0px 8px 12px 6px rgba(7,7,8,0.1), 0px 4px 4px rgba(7,7,8,0.2)` | claim modal | `[XUI-dark]` |

No CSS gradients unless a component spec contains one (GameCard readout fade does). `[XUI-skill]` rule 13.

## 5. XUI components to use

UI comes only from XUI elements; quests only via XUI QuestCard. `[CF-overview]` No custom door component exists in XUI, so the door is composed from the parts below.

| Need | Component (package) | Classes / props | Source |
|---|---|---|---|
| Door tile shell | GameCard section (`@xsolla/xui-game-card`) with radius overridden to 0 | `xui-game-card xui-game-card--responsive`; `__image-wrap`, `__img`, `__fade`, `__tags--top-left/right`, `__footer`, `__title`, `__subtitle`; `lootBadge: best/better/good` | `[XUI-game-card]` |
| Label above tile | Tag label | `xui-tag-label` with `__id` (`__id-series` "DEC" + `__id-number` "07") and `__name` (bundle name); grand doors add `__rarity`; `xui-tag-label--inline-compact` for narrow mobile | `[XUI-tag-label]` |
| Locked / missed art cover | ImageThumbnail | `xui-img-thumb`, `xui-img-thumb__overlay--dark` (missed, teased), `__center` for lock icon; props `ratio`, `overlay: none/fade/dark` | `[XUI-image-thumbnail]` |
| State chip on tile | Tag | `xui-tag xui-tag--xs` (mobile) or `--sm` (desktop); tones `--brand`, `--brand-extra`, `--success`, `--primary`, `--secondary` | `[XUI-tag]` `[XUI-game-card]` |
| State dot + text | Status | `xui-status xui-status--sm/md`, `__dot--default/success/warning/alert/neutral`, `role="status"` | `[XUI-status]` |
| Claim CTA | Button | `xui-btn xui-btn--primary xui-btn--brand xui-btn--sm xui-btn--full-width xui-btn--spread` + trailing `icon_arrow-right--line` | `[XUI-button]` `[XUI-skill]` rule 16 |
| Grand claim CTA | Button | `xui-btn--primary xui-btn--brand-extra` (same size/spread) | `[XUI-button]` |
| Secondary action (view item) | Button | `xui-btn--secondary xui-btn--mono xui-btn--sm` | `[XUI-button]` |
| "N left" daily cap | ProgressLine | `xui-progress-line xui-progress-line--sm` (4px), states `default/success/error` | `[XUI-progress-line]` |
| Quests | QuestCard (`@xsolla/xui-quest-card`) | `xui-quest-card`, `__icon-wrap` (48x48), `__title`, `__subtitle`, `__status--default/warning/success/alert`, `__trailing` (reward `xui-tag xui-tag--xs xui-tag--brand-extra`) | `[XUI-quest-card]` |
| Claim confirmation | Modal | `xui-modal` small (`maxWidth 360`), actions `xui-btn--md --full-width` | `[XUI-modal]` |
| Post-claim feedback | Toast | `xui-toast xui-toast--success`, `duration` 5000 default | `[XUI-toast]` |
| Icons | inline SVG, `fill="currentColor"` | `icon_lock--line`, `icon_lock-open--line`, `icon_check--solid`, `icon_gift--line`, `icon_star--solid`, `icon_arrow-right--line`, `tag_label_rarity_rare` | `[XUI-icons]` |

Note: `references/component-index.md` lists QuestCard modifier as `xui-quest-card--{status}`, but the component CSS uses `xui-quest-card__status--{status}`. Use the component CSS. `[XUI-quest-card]`

## 6. Door state mapping (Pentagram Dark)

All tiles: radius 0, `border: 1px solid` (color below), `box-shadow: var(--xui-shadow-surface)`, label above (Tag label). `[CF-overview]` `[XUI-skill]`

| State | Tile bg | Border | Art | Chip / status | Text color | CTA | Source |
|---|---|---|---|---|---|---|---|
| **locked** (future) | `--xui-bg-primary` | `--xui-border-secondary` | Hidden. Centered `icon_lock--line` in `--xui-content-tertiary` | `xui-status` `__dot--default` + "Opens Dec N" | `--xui-content-tertiary` | none | `[CF-ws1733]` (lock icon + label, content hidden) `[XUI-status]` |
| **locked, teased** (next 3 doors) | `--xui-bg-primary` | `--xui-border-secondary` | Art behind `xui-img-thumb__overlay--dark` + lock icon | same as locked | `--xui-content-tertiary` | none | `[CF-overview]` (next three teased) `[XUI-image-thumbnail]` |
| **available** (today) | `--xui-bg-primary` | `--xui-border-brand` | Full art, GameCard fade | `xui-tag--brand` "Today" top-left; countdown in body-md accent `--xui-content-primary`; "N left" + ProgressLine sm | `--xui-content-primary` | `xui-btn--primary --brand --sm --full-width --spread` "Claim" | `[XUI-dark]` `[XUI-tag]` `[XUI-button]` |
| **claimed** | `--xui-bg-primary` | `--xui-border-secondary` | Full art | `xui-tag--success` with `icon_check--solid` "Claimed" | `--xui-content-primary` | `xui-btn--secondary --mono --sm` "View item" | `[XUI-tag]` `[XUI-button]` |
| **missed** (past, not claimed) | `--xui-bg-secondary` (sunk, same as canvas, border carries the edge) | `--xui-border-secondary` | Art behind `xui-img-thumb__overlay--dark` | `xui-status` `__dot--default` + "Gone" | `--xui-content-tertiary` | none | `[CF-overview]` ("Gone" state) `[XUI-status]` |

Missed uses the `default` palette (screen reader prefix "inactive"), not `alert`: a missed day is not an error. `xui-tag--alert` is avoided anyway because it fails text contrast (section 9).

### 6.1 Grand tier (Dec 24, 25, 31)

Layered on top of the state above. `[CF-overview]`

| Element | Token / class | Source |
|---|---|---|
| Border (available and locked-teased) | `--xui-border-brand-extra` | `[XUI-dark]` |
| Loot pill on art | `xui-game-card__loot-badge--best` (bg `--xui-bg-brand-extra-primary`, text `--xui-content-on-brand-extra`, border `1px solid var(--xui-border-inverse)`) | `[XUI-game-card]` |
| Chip | `xui-tag--brand-extra` "Grand drop" | `[XUI-tag]` |
| Label above tile | Tag label with `__rarity` segment, glyph `tag_label_rarity_rare`; rarity fill colors `TODO` | `[XUI-tag-label]` `[JIRA-10759]` |
| CTA when available | `xui-btn--primary xui-btn--brand-extra` | `[XUI-button]` |
| Larger footprint (span 2 cols) | `TODO`: not decided. Bento span pattern exists `[XUI-skill]` but the Figma file (J8B83IdCvU5ujKUruhXopA) could not be read. | |

Limit: one or two focal accents per page. `[XUI-skill]` Today's door is the cyan focal point; grand drops are the lime accent.

## 7. Layout

| Item | Value | Source |
|---|---|---|
| Page shell | full width, no outer `max-width`, gutters `padding-inline: var(--xui-space-xl)` | `[XUI-skill]` rule 17 |
| Grid gap | `var(--xui-space-m)` | `[XUI-skill]` `[XUI-shop-item-card]` |
| Mobile grid | `grid-template-columns: repeat(auto-fit, minmax(min(148px, 100%), 1fr))` (2 columns at 360px) | `[XUI-shop-item-card]` shelf pattern |
| Breakpoints | 960px (to 2 cols in shelf pattern), 600px (to 1 col), 1024px desktop density | `[XUI-game-card]` |
| Landing single-column threshold | 768px | `[LEGACY]` xsolla-design landing recipe |
| Desktop columns | `TODO` (7 for a week row is a recommendation only; no source fixes it) | |
| Mobile horizontal gutter | `TODO` (XUI only states `--xui-space-xl` band gutters; artifact pages require 16px = `--xui-space-m`) | |
| Label above tile | Tag label, then `--xui-space-xs` gap, then tile | `[CF-overview]` (position) ; gap is a recommendation |
| Quest list | vertical stack of QuestCards, gap `--xui-space-s` | QuestCard `[XUI-quest-card]` ; gap recommendation |
| Sections | alternate `--xui-bg-secondary` and `--xui-bg-primary` bands with `--xui-border-secondary` top/bottom | `[XUI-skill]` |
| Door aspect ratio | `TODO`. GameCard offers 366/206, 1/1, 200/113 `[XUI-game-card]` | |

## 8. Motion

Page-level tokens (define in page styles, not in base): `[XUI-skill]` step 7

| Token | Value |
|---|---|
| `--page-duration-micro` | 150ms (hover, focus, press) |
| `--page-duration-macro` | 300ms (card reveal) |
| `--page-duration-slow` | 500ms (hero entrance) |
| `--page-easing` | `cubic-bezier(0.16, 1, 0.3, 1)` |

Door open (recommendation built from the rules above; no XUI door animation exists):

1. Available tile hover: `transform: translateY(-2px)` + `--xui-shadow-surface-hover`, `--page-duration-micro`. `[XUI-skill]`
2. On claim success: lock-to-open icon swap (`icon_lock--line` to `icon_lock-open--line`), then art reveal with opacity 0 to 1 and `translateY(12px)` to 0 (the `xui-fadeSlideUp` keyframe), `--page-duration-macro`, `--page-easing`. `[XUI-skill]` `[XUI-icons]`
3. Chip swap to `xui-tag--success` and Toast success. `[XUI-toast]`
4. Only `transform` and `opacity`; any single animation under 500ms; never override component hover/active colors. `[XUI-skill]` rule 14
5. `@media (prefers-reduced-motion: reduce)`: drop transforms, keep instant state change. Motion-reduced mode is required in the related Web Shop advent work. `[CF-ws1733]`
6. 3D-style flip, sparkle or confetti: `TODO` ("Sparkle" is in DSD-11794 scope `[CF-sds-q4]` but has no spec yet).

## 9. Accessibility

Computed WCAG 2.1 contrast `[CALC]`. Text AA needs 4.5:1 (3:1 for 18.66px bold / 24px+); non-text UI needs 3:1.

### 9.1 Pentagram Dark

| Pair | Ratio | Result | Used for |
|---|---|---|---|
| `--xui-content-primary` on `--xui-bg-primary` | 13.03 | AA | tile text |
| `--xui-content-secondary` on `--xui-bg-primary` | 7.46 | AA | supporting text |
| `--xui-content-tertiary` on `--xui-bg-primary` | 5.35 | AA | locked text |
| `--xui-content-tertiary` on `--xui-bg-secondary` | 5.64 | AA | missed text |
| `--xui-ctrl-brand-text-primary` on `--xui-ctrl-brand-primary-bg` | 15.13 | AA | Claim button |
| `--xui-content-brand-primary` on `--xui-bg-primary` | 11.17 | AA | accent text |
| `--xui-border-brand` vs `--xui-bg-primary` | 9.56 | 3:1 pass | today border |
| `--xui-border-brand` vs `--xui-bg-secondary` | 10.57 | 3:1 pass | focus ring on canvas |
| `--xui-content-on-success` on `--xui-bg-success-primary` | 16.89 | AA | Claimed tag |
| `--xui-content-success-primary` on `--xui-bg-primary` | 11.08 | AA | success dot/text |
| `--xui-content-on-brand-extra` on `--xui-bg-brand-extra-primary` | 16.94 | AA | Grand drop tag, loot pill, grand CTA |
| `--xui-border-brand-extra` vs `--xui-bg-primary` | 12.50 | 3:1 pass | grand border |
| `--xui-content-alert-primary` on `--xui-bg-primary` | 5.44 | AA | (not used for missed) |
| `--xui-content-on-alert` on `--xui-bg-alert-primary` | 3.76 | **fails AA text** | avoid `xui-tag--alert` for small labels |
| `--xui-content-on-neutral` on `--xui-bg-neutral-primary` | 2.32 | **fails** | avoid `xui-tag--neutral` |
| `--xui-bg-primary` vs `--xui-bg-secondary` | 1.11 | below 3:1 | tile edge relies on `--xui-border-secondary` + shadow; state must never be color-only |

### 9.2 Pentagram Light

| Pair | Ratio | Result |
|---|---|---|
| `--xui-content-primary` on `--xui-bg-primary` | 21.00 | AA |
| `--xui-content-tertiary` on `--xui-bg-primary` / `--xui-bg-secondary` | 5.74 / 5.58 | AA |
| Claim button text on `--xui-ctrl-brand-primary-bg` | 15.13 | AA |
| `--xui-border-brand` vs `--xui-bg-primary` | 1.95 | **fails 3:1**: today needs the "Today" tag, not the border alone |
| `--xui-content-brand-primary` on `--xui-bg-primary` | 2.82 | **fails**: no small cyan text in light |
| `--xui-content-success-primary` on `--xui-bg-primary` | 3.73 | large text / non-text only |
| `--xui-border-brand-extra` vs `--xui-bg-primary` | 1.43 | **fails 3:1**: grand needs tag + loot pill |
| `--xui-content-brand-extra-primary` on `--xui-bg-primary` | 3.36 | large text only |
| `--xui-content-alert-primary` on `--xui-bg-primary` | 3.76 | large text only |
| tag fills (success, brand-extra) with black text | 16.89 / 16.94 | AA |

### 9.3 Behavior

- Every state has a text label and an icon, never color alone (see 9.1 last row and 9.2 failures).
- Each door is one focusable element (button for available, otherwise a non-interactive group) with an `aria-label` like "December 7, Starter bundle, available, closes in 3 hours". Tag label carries `role="group"` + `aria-label`. `[XUI-game-card]`
- Status uses `role="status"` (polite). Do not live-announce a per-second countdown; announce at coarse intervals. `[XUI-status]` ; interval `TODO`
- Focus: `outline: 2px solid var(--xui-border-brand); outline-offset: 2px`. `[XUI-button]`
- Disabled buttons: `opacity: 0.6`, not used for locked doors (locked doors have no button). `[XUI-button]`
- Keyboard order through the grid: left to right, top to bottom, Dec 1 to 31.

## 10. Copy constraints that touch design

- Partner-facing copy never names "Xsolla ID" or "Backpack". `[CF-overview]`
- No em-dashes anywhere (house rule).
- Game names in mockups are illustrative only. `[CF-overview]`
- Run the UXW 5-layer audit (`xsolla-ui-design` `UXW/ux-copy-analyst.md`) on final strings. `[XUI-skill]`

## 11. Conflicts between sources

| Topic | Source A | Source B | Resolution here |
|---|---|---|---|
| Button radius | `--xui-radius-button` 4px `[XUI-space]` | size classes 8px (xl/lg/md), 4px (sm/xs) `[XUI-button]` | Use size-class radius (it is what renders). |
| Button radius | XUI radius `[XUI-button]`, founder rule "keep XUI radius for now" `[CF-overview]` | Frontify UI/CTA corner-radius 0 `[JIRA-8828]`; legacy "pill-shaped" `[LEGACY]` DESIGN.md | Founder rule wins: keep XUI radius. |
| Tile radius | GameCard 8px `[XUI-game-card]`, React 4px | 0 `[CF-overview]` `[JIRA-8828]` | 0. |
| Lime accent | `#cef655` brand-extra `[XUI-dark]` | `#D9FF66` Mindaro `[LEGACY]` | `#cef655`. |
| Card surface | `#1b2628` `[XUI-dark]` | `#1F2B2E` `[LEGACY]` | `#1b2628`. |
| Body font | Aktiv Grotesk `[XUI-dark]` | Pilat body `[LEGACY]` | Aktiv Grotesk. |
| Rarity | DSD-10759 tiers, legendary orange/gold `[JIRA-10759]` | RarityBadge legendary `#D9FF66` `[LEGACY]` | DSD-10759; values `TODO`. |
| QuestCard modifier | `xui-quest-card--{status}` (index) | `xui-quest-card__status--{status}` (CSS) | CSS. |

## 12. Open TODOs

1. Rarity token hex values (Figma `tag-label/rarity`, XUITSD-109).
2. Desktop column count, door aspect ratio, grand tile span: need the Figma file J8B83IdCvU5ujKUruhXopA.
3. Mobile gutter value.
4. Door-open "Sparkle" effect spec (DSD-11794).
5. Countdown announce interval for screen readers.
6. Whether x.la offers light mode.
