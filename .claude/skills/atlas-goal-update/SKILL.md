---
name: atlas-goal-update
description: Post a status update to an Atlassian Atlas goal via the Goals GraphQL API. Use when the user asks to update an Atlas goal (URL pattern home.atlassian.com/.../goal/XXX-NNN), post a goal check-in, or run a scheduled goal update.
---

# Atlas Goal Update

Atlas goals (the strategic-planning side of Atlassian, formerly Townsquare) are **not** Jira issues. They live on a separate GraphQL endpoint and ignore the Jira REST API. This skill posts a goal update (status + summary + optional score / target date) using the `goals_createUpdate` mutation.

## Required environment

| Variable | Example | Notes |
|----------|---------|-------|
| `ATLASSIAN_EMAIL` | `you@xsolla.com` | Account email for Basic auth |
| `ATLASSIAN_API_TOKEN` | `ATATT3x…` | Create at id.atlassian.com/manage-profile/security/api-tokens |
| `ATLASSIAN_SITE` | `xsolla.atlassian.net` | Site subdomain (no scheme) |
| `ATLAS_GOAL_KEY` | `XSOLLA-8731` | Goal key from the Atlas URL |

Endpoint: `https://${ATLASSIAN_SITE}/gateway/api/graphql`
Auth header: `Authorization: Basic $(printf '%s:%s' "$ATLASSIAN_EMAIL" "$ATLASSIAN_API_TOKEN" | base64 -w0)`

## Workflow

1. **Resolve goal ARI from key.** `goals_createUpdate` needs the ARI form `ari:cloud:townsquare:{siteId}:goal/{uuid}`, not the human key. Use `goals_search`:

   ```graphql
   query ResolveGoal($q: String!) {
     goals_search(first: 1, input: { search: $q }) @optIn(to: "Townsquare") {
       edges { node { id key name state { value } latestUpdate { newScore status { value } } } }
     }
   }
   ```

   Variables: `{ "q": "XSOLLA-8731" }`. The `id` field on the returned node is the ARI.

2. **Research what changed since the last update.** Read `latestUpdate.creationDate` from the search result and look at:
   - Commits / PRs merged in the linked repo since that date (`git log --since=...`).
   - Linked Jira issues — use the `mcp__github__*` tools for PRs and the Atlassian MCP `searchJiraIssuesUsingJql` for issues. JQL hint: `"Atlas Goal" = XSOLLA-8731 AND updated >= -14d` (field name may vary).
   - The goal's own metric targets via `goals_byId` if it has any.

3. **Draft the update.** Three fields matter:
   - `status` — one of `pending`, `on_track`, `at_risk`, `off_track`, `done`, `cancelled` (Atlas enum, lowercase). Pick based on signals: missed milestones → `at_risk`/`off_track`; shipped scope → `on_track`; goal complete → `done`.
   - `summary` — ADF (Atlassian Document Format) JSON. Keep it tight: what shipped, what's blocked, what's next. 2–4 short paragraphs max.
   - `score` (optional) — 0–100 progress estimate. Only include if the goal tracks numeric progress.
   - `targetDate` (optional) — only set if the date is genuinely moving.

4. **Post the update.** Use `scripts/post-atlas-update.sh` (see this skill's directory) or call the mutation directly:

   ```graphql
   mutation PostUpdate($input: goals_CreateUpdateInput!) {
     goals_createUpdate(input: $input) @optIn(to: "Townsquare") {
       success
       errors { message }
       update { id url creationDate updateType summary newScore }
     }
   }
   ```

5. **Verify.** Check `success: true` and surface the returned `update.url` so the user can open it.

## ADF summary template

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "<one-line headline>" }] },
    { "type": "paragraph", "content": [
      { "type": "text", "text": "Shipped: ", "marks": [{ "type": "strong" }] },
      { "type": "text", "text": "<what landed since last update>" }
    ]},
    { "type": "paragraph", "content": [
      { "type": "text", "text": "Next: ", "marks": [{ "type": "strong" }] },
      { "type": "text", "text": "<what's planned for the next two weeks>" }
    ]}
  ]
}
```

## Gotchas

- The `@optIn(to: "Townsquare")` directive is required — the goals fields are still flagged experimental. Omitting it returns an empty response.
- API tokens with **scopes** must include the Townsquare scopes (see [community thread on missing scopes](https://community.developer.atlassian.com/t/scoped-tokens-missing-townsquare-scopes/98232)). Classic (unscoped) tokens work without configuration.
- `goals_search` matches name, tags, and key — searching for the bare key (`XSOLLA-8731`) is the reliable lookup path.
- ARIs are **site-scoped**; you can't use the same ARI across Atlassian orgs.
- Don't post a duplicate update if `latestUpdate.creationDate` is within the last few hours — biweekly cron retries can double-post.

## References

- [Goals GraphQL API intro](https://developer.atlassian.com/platform/goals/goals-graphql-api/introduction/)
- [Using the Goals GraphQL API](https://developer.atlassian.com/platform/goals/goals-graphql-api/using-graphql-api/)
- [Search queries for Goals](https://developer.atlassian.com/platform/goals/goals-graphql-api/search-queries/)
- [Understanding ARIs](https://developer.atlassian.com/platform/teamwork-graph/understanding-aris/)
