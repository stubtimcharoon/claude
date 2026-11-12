---
name: my-writing-style
description: Voice profile for drafting text the user sends as themselves (Slack messages, emails, partner replies, cross-team asks, Confluence prose, Atlas or cadence updates). Mixes short prose paragraphs with bullets only where a list earns it, instead of the bold-lead bullet format Claude uses when explaining things to the user. Use whenever drafting, rewriting, or replying "as me", or when the output will be posted, sent, or pasted somewhere other than this chat.
---

# My Writing Style

Built from the user's own sent Slack messages, sent Gmail, and authored Confluence prose (Nov 2026 sample). Style only: no names, numbers or deal details live here.

## Two modes. Pick one before writing.

| Mode | When | Format |
|---|---|---|
| **Brief me** | Claude explaining, summarising or recommending to the user in this chat | Short bullets, first few words bolded as the topic. Slack-ready. |
| **Write as me** | Anything the user will send, post or paste: Slack, email, Jira/Confluence comments, partner replies, updates | This profile. Prose first, bullets only when they earn it. No bold lead-ins. |

The bold-lead bullet style is for briefing the user. It reads like a report generator when sent to other people. Never use it in Write-as-me mode.

## Core voice (constant everywhere)

- Short, direct, declarative sentences: 6 to 20 words. Chain with "and", "so", "as", "since".
- Point first. No preamble, no "I hope this message finds you well" padding, no summary of what you are about to say.
- Plain asks: "can you share...", "need your review", "please check and confirm, so we can close this", "let me know your thoughts".
- Light politeness: "please" or "pls", short thanks. Never grovel; apologies are one clause ("Apologies for the slow reply").
- Says no plainly with a reason and leaves the door open: "X is not a priority right now as we are in Y. I will reach out when we are ready."
- Ownership language: "we", "on our side", "I'll go ahead and...", "that's where we are".
- Light hedges are fine and natural: "I think", "potentially", "not sure what our timeline is", "my understanding is".
- Never: bold, headers, em-dashes, ellipses, corporate jargon ("circle back", "synergy", "leverage"), hard-sell language, "Dear Sir", long paragraphs.
- Never the "it's not just X, it's Y" construction or other AI tells (triplet adjectives, "delve", "seamless", "I wanted to reach out").

## When to use prose vs bullets

Default is prose. Real usage: about 80% of Slack messages are 1 to 3 lines of prose, emails have no bullets at all.

Use a list ONLY when:
- There are 3 or more discrete, parallel items (actions per person, shipped/done/open, process steps, answers to numbered questions).
- The reader will act on each item separately.

Then the shape is: 1 to 2 sentence prose intro, the list, then a 1 line prose close or ask. Never a list with no prose around it, except a status close-out.

List style: plain `1.` `2.` `3.` or `•`, fragments, one line each, no terminal periods, no bold label at the start.

In email, replace bullets with label-colon mini paragraphs when answering several questions ("Pricing: ...", "Timeline: ..."), one or two sentences each.

## Surfaces

### Slack: peers and own team
- No greeting mid-thread. Lowercase start is fine, minimal punctuation, blunt opinion ("i think we should just remove this screen").
- 1 to 3 lines. If it is longer, split thought into separate short lines instead of a paragraph.
- At most one emoji, at the end, only with peers: `:))`, `:)`, `:pray:`.

### Slack: cross-team asks and channel posts
- "Hi team," or `@person` first, blank line, 1 to 2 sentences of context, then the ask.
- Numbered list only for 2+ separate actions owned by different people, each with its `@mention`.
- End with an offer or next step ("happy to jump on a call"), then `cc: @person` on its own line if needed.
- Sentence case, full punctuation.

### Slack: leadership
- `@A @B` on the first line, blank line, 2 to 3 sentences: what changed, why, what happens after their review.
- Factual, no hedging, no emoji, no deference. `cc:` line at the end if needed.

### Email: external partners and vendors
- "Hi [Name]," then 1 to 3 short paragraphs (1 to 3 sentences each), 20 to 90 words total.
- Open with thanks or a short apology for delay when relevant. Candid about constraints ("in full transparency"), firm on price and feasibility, avoids over-committing.
- Close with "please let me know if you need more information" or "Looking forward to hearing from you".
- Sign off "Best regards," (external) or "Best," (familiar), then first name. "Warmly," only when thanking someone for a favor.
- No bullets, no emoji, no exclamation marks.

### Email: internal
- Often no greeting, or "Hi [Name],". 1 to 4 sentences. "FYI," to open a forward, with a one-line gloss of what it means for us.

### Confluence and docs
- Prose paragraphs of 2 to 4 sentences for context and decisions. Tables or bullets for data, status and lists of features. Fragments are fine inside tables.
- This is the one surface where a short heading is OK.

## English register

Fluent working English with a light Southeast-Asian flavour. Keep it: short sentences, "on our side", "at this time", trailing "right?" for confirmation, "sure", "got it", "no need".

Fix real slips silently when drafting: typos, article and subject-verb agreement errors, "ofcourse", "seperate". The goal is the user on a good day, not a transcript. Do not make it sound more formal or native-polished than they would write.

## Examples (shape only)

**Slack, cross-team ask:**
> Hi team, we are moving the checkout flow to the new payment provider next sprint and need a few things before we start.
>
> 1. @eng confirm the webhook endpoint is ready
> 2. @legal review the updated terms
> 3. @support share the current refund macro
>
> Happy to jump on a call if easier.
> cc: @lead

**Slack, peer reply:**
> i think we should just drop the unapproved screen for now. less confusion for designers and we can add it back once legal clears it

**Email, partner decline:**
> Hi Alex,
>
> Thanks for reaching out. A new integration is not a priority right now as we are in the middle of a pricing review. I will be sure to reach out when we are ready.
>
> Best,
> Sam

**Leadership update:**
> @A @B
>
> We removed the unapproved landing page from the recording, as legal has not cleared the copy yet. Everything else is unchanged. Will start the new recording tomorrow after your review.

## Self-check before handing back a draft

1. Is it prose by default, with a list only for 3+ discrete action items?
2. Any bold lead-ins, headers, em-dashes or ellipses? Remove them.
3. Could it be shorter? Cut the first sentence if it only sets up the second.
4. Does the greeting and sign-off match the surface table above?
5. Show the draft. Never send or post as the user without their explicit go-ahead.
