# ColdDMs API surface (inferred from the web app bundle)

Source: static read of `research/colddms/source/webapp/`. No request was sent to api.colddms.com. Request fields are exact (copied from the client classes). Response fields are only those the front end reads, so they are partial. Long dashes in quoted copy are written as a spaced hyphen.

## 1. Transport

| Item | Value | Evidence |
|---|---|---|
| Base URL | `https://api.colddms.com` | `index.js` class `Mp`, `prefixUrl` |
| Client library | `ky` (fetch wrapper) | `index.js` |
| Method | `POST` with JSON body for everything except one `GET` (`conversations/{thread_id}`) | client classes |
| Auth | Session cookie, `credentials:"include"`. No bearer token or API key in the web app. | `index.js` |
| Static header | `client: 4092eff6498563d78beabc088c3690d3` on every call | `index.js` |
| Uploads | `multipart/form-data` via `postForm`, timeout 60 s | `index.js` |
| Downloads | `POST` returning a blob, saved as `result.csv` | `index.js` `download()` |
| Captcha | Cloudflare Turnstile token in `captcha` on sign in, sign up, forgot password | `TurnstileWidget` |

Response envelope (`index.js` class `Kn`):

```
{ "success": true|false, "message": "<error text when success is false>", "response": { ... } }
```

`data` in the client is `response`. The error string "No authorization" means the session is missing (the UI redirects to `/sign-in`; `AuthRaceRetry` retries once after 800 ms).

Some mutating endpoints return soft gates inside a successful response: `warnings: [{token, blank, total}]` (resend with `confirm:true`), `blocked: [...]` (placeholders that block a list removal) and `blocked.launch: ["no_lists"|"no_accounts"]`.

## 2. Endpoint table

### Users and auth (`index.js`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `users/get` | `{}` | Returns `user` (see section 4) |
| `users/sign-up` | `email, password, captcha, name, timezone, referral_id, coupon` | |
| `users/sign-in` | `email, password, captcha, timezone` | |
| `users/logout` | `{}` | |
| `users/verification` | `code` | |
| `users/forgot-password` | `email, captcha` | |
| `users/check-reset-password` | `code` | |
| `users/reset-password` | `code, password` | |
| `users/set-password` | `password` | |
| `users/update` | any of `timezone, password, current_password, name` | |
| `users/delete-me` | `{}` | "Your data is kept" |
| `users/confirm-email` | `{}` | Sends or confirms the verification email |
| `users/set-temp-auth-code` | `code` | Used by `/extension-id/:code` to pair the extension |
| `users/summary` | `{}` | Returns `summary` |

### Accounts and instances

| Endpoint | Request fields | Notes |
|---|---|---|
| `accounts/get` | none | Returns `accounts[]` |
| `accounts/set-campaign` | `campaign_id, accounts:[{account_id}], confirm_moves` | Moves accounts between campaigns; `confirm_moves:true` allows taking an account from another campaign |
| `instances/list` | `options:{hide_old}` | Returns instances (Chrome profiles) with nested `account` |
| `instances/edit` | `id, name, color` | `color` is a Quasar palette name: red, black, pink, purple, cyan, blue, teal, green, lime, amber, orange, brown, grey |

### Campaigns (`Campaigns`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `campaigns/create` | `name, description, enabled, lists, options` | `lists:[{id, follow:true}]`, `options:{working_hours:{min,max}, messages_per_day:{min,max}}`. Returns `campaign` |
| `campaigns/edit` | `id, name, description, enabled, lists, options, confirm` | Partial updates allowed. `options.no_delay` only for testing accounts. May return `warnings`, `blocked`, `blocked.launch` |
| `campaigns/delete` | `id` | |
| `campaigns/get` | `id` | Returns `campaign` |
| `campaigns/list` | `{}` | Returns `campaigns[]` |
| `campaigns/get-responses` | `skip, limit, campaign_id, sort, unread` | |
| `campaigns/get-responses-count` | `campaign_id, unread` | |
| `campaigns/mark-read` | `task_id, unread` | |
| `campaigns/download-failed-leads` | `campaign_id` | CSV download |
| `campaigns/retry-failed-leads` | `campaign_id, list_id, usernames` | Max 10,000 usernames (client check) |
| `campaigns/effective-cap` | `campaign_id` | Returns `effective_limit, campaign_limit, warmup_limit` |

### Sequences (`launchBlockedMessage`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `sequences/create` | `campaign_id, sequences, confirm` | `sequences:[{delay, enabled, messages:[{type:"text", text}]}]`. Returns `sequence`, maybe `warnings` |
| `sequences/edit` | `id, sequences, enabled, confirm` | |
| `sequences/delete` | `id` | |
| `sequences/list` | `campaign_id` | Returns `sequences[]`; messages carry per variant stats (`sent`, `responses` as `{today, all}`) |

### Lists and targets (`Lists`, `Targets`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `lists/create` | `campaign_id, is_campaign, name, source, enabled, username` | `source`: `list`, `followers`, `following`, `likes` |
| `lists/edit` | `id, name, enabled` | |
| `lists/delete` | `id` | |
| `lists/list` | `campaign_id, with_target_counts` | Returns `lists[]` |
| `lists/enrichment/retry` | `id` | Retry verification |
| `lists/enrichment/cancel` | `id` | |
| `targets/add` | `list_id, targets, source:{type}` | `targets` is an array of usernames or objects `{username, <custom keys>}`; `source.type`: `raw`, `csv`, `json`, `parser`. Max 10,000 per call (client chunking) |
| `targets/delete` | `id` | |
| `targets/list` | `list_id, skip, limit, campaign_id?, search?` | |
| `targets/count` | `list_id, search?` | |
| `targets/download` | `list_id` | CSV download |
| `targets/fields` | `campaign_id` | Returns `fields[]` with `key, label` and coverage counts for custom placeholders |
| `targets/preview` | `campaign_id, text` | Renders a message for a sample prospect |

### Scraping tasks (`FindLeadsPage`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `scraping-tasks/account` | `accounts, amount, collectType, additionalInfo, filters` | `collectType`: `followers` or `following` |
| `scraping-tasks/post` | `posts, amount, additionalInfo, filters` | Post URLs |
| `scraping-tasks/hashtag` | `hashtags, amount, additionalInfo, filters` | Leading `#` stripped by the client |
| `scraping-tasks/keyword` | `keywords, amount, additionalInfo, filters` | |
| `scraping-tasks/mentions` | `accounts, amount, additionalInfo, filters` | |
| `scraping-tasks/list` | `{}` | |
| `scraping-tasks/delete` | `taskId` | Also used to cancel |
| `scraping-tasks/mark-downloaded` | `taskId` | |
| `scraping-tasks/download` | `taskId, format` | `format:"csv"`, blob response |
| `scraping-tasks/enrichment/retry` | `id` | |
| `scraping-tasks/enrichment/cancel` | `id` | |

`amount`: 100 to 10,000. Source arrays: max 40 items. `additionalInfo`: object of booleans keyed `followers, following, country, city, address, description, number of posts, name, telephone` (all sent as `false` by the current UI). `filters`: array of

```
{ type:"followersCount"|"followingCount", minValue?, maxValue? }
{ type:"lastPostBefore", value:"<days as string>" }
{ type:"bioKeywords", keywords:[...], isWhitelist:bool, isExactMatch:bool }
```

### Tasks (messages) (`Tasks`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `tasks/list` | `skip, limit, filter, sort` | `filter:{campaign_id, account_id, unread, response, follow_ups, error_filter, date_range, username}`; `sort:{type, direction}` |
| `tasks/download` | `filter, sort` | CSV export |
| `tasks/stop-follow-up` | `task_id` | |
| `tasks/get-chain` | `task_id` | Timeline of a lead's messages |

### Conversations and tags (`relativeTime`, `UnifiedInboxPage`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `conversations/list` | `filter, pagination` | `filter:{campaign_id?, account_instagram_username?, tag_id?, unread?}`; `pagination:{limit:50, cursor?}`. Returns `conversations[], hasMore, nextCursor` |
| `conversations/get-updates` | `since` (ISO date) | Polled every 30 s |
| `conversations/unread-count` | `{}` | Returns `unread`, `total` |
| `conversations/mark-read` | `target_username, sender_username` | |
| `GET conversations/{thread_id}` | path param | |
| `conversations/send` | `target_username, sender_username, message` | Queues a manual DM for the extension |
| `conversations/set-tag` | `conversation_id, tag_id` | |
| `tags/list` | none | |
| `tags/create` | `name, color` | |
| `tags/update` | `id, name, color` | |
| `tags/delete` | `id` | |

### CRM (`CRM`)

| Endpoint | Request fields |
|---|---|
| `crm/get` | `{}` (board with columns) |
| `crm/list` | `skip, limit, column_id` |
| `crm/create-column` | `name` |
| `crm/edit-column` | `name, column_id` |
| `crm/delete-column` | `column_id` |
| `crm/move-columns` | `columns` |
| `crm/move-task` | `task_id, task_id_before, original_column_id, target_column_id` |
| `crm/move-tasks-and-delete` | `original_column_id, target_column_id` |
| `crm/locate-task` | `task_ids, thread_id` |
| `crm/add-note` | `task_id, note` |
| `crm/mark-important` | `task_id, value` |

### Account setup, review, warmup

| Endpoint | Request fields | Notes |
|---|---|---|
| `account-setups/list` | `{}` | |
| `account-setups/get` | `instagram_account_id` | |
| `account-setups/update` | `id, name, bio` | |
| `account-setups/upload-photo` | form: `id`, `photo` (file) | JPEG, PNG, WEBP |
| `account-setups/remove-photo` | `id, photo_id` | |
| `account-setups/reorder-photos` | `id, photo_ids` | |
| `account-setups/submit` | `id` | |
| `account-setups/withdraw` | `id` | |
| `account-setups/review/queue` | `state, search, limit, skip` | Reviewer capability |
| `account-setups/review/pending-count` | `{}` | |
| `account-setups/review/get` | `id` | |
| `account-setups/review/approve` | `id, note, internal_note` | |
| `account-setups/review/request-changes` | `id, reason, internal_note` | |
| `account-setups/review/reject` | `id, reason, internal_note` | |
| `account-warmups/list` | `{}` | |
| `account-warmups/get` | `instagram_account_id` | |
| `account-warmups/complete-action` | `id, acknowledged, posts_added_today` | |
| `account-warmups/pause` | `id` | |
| `account-warmups/resume` | `id` | |
| `account-warmups/link-campaign` | `id, campaign_id` | |
| `account-warmups/unlink-campaign` | `id, campaign_id` | |

### Workflow campaigns (`workflowCampaigns`)

| Endpoint | Request fields | Notes |
|---|---|---|
| `workflow-campaigns/create` | `name` | |
| `workflow-campaigns/list` | `{}` | |
| `workflow-campaigns/get` | `id` | |
| `workflow-campaigns/edit` | `id, name, status, steps, accounts, sending_rules` | `steps:[{id, type, config}]`; `sending_rules:{messages_per_day:{min,max}, working_hours:{min,max}}` |
| `workflow-campaigns/delete` | `id` | Draft only |
| `workflow-campaigns/prepare` | `id` | Prepares the audience (state "Preparing...") |
| `workflow-campaigns/launch` | `id, campaign_id` | Links the compiled classic campaign |
| `workflow-campaigns/convert-preview` | `campaign_id` | Returns `compatibility`, warnings, notices, `sending_rules`, steps |
| `workflow-campaigns/convert` | `campaign_id` | |

Step configs: `audience` `{list_ids:[...]}` (legacy `list_id`), `message` `{texts:[...]}` (legacy `text`), `wait` `{days}`.

### Payments, notifications, ops, dev

| Endpoint | Request fields | Notes |
|---|---|---|
| `payments/get-payment` | `type, count` | `type`: `pro`, `scale`, `unlimited`; returns checkout `url` |
| `payments/enter-portal` | `{}` | Returns billing portal `url` |
| `payments/check-upgrade-plan` | `count, type` | Returns prorated `total` in cents |
| `payments/upgrade-plan` | `count, type` | Default `type:"scale"` |
| `notifications/list` | `limit, skip` | |
| `notifications/unread-count` | `{}` | |
| `notifications/mark-read` | `id` | |
| `notifications/mark-all-read` | `{}` | |
| `ops/client-event` | `kind, message` | Internal alerts: `churn_survey`, `find_leads_error` |
| `dev/account-simulator/create` | `{}` | Needs `dev_capabilities.account_simulator` |
| `dev/account-simulator/start` | `id` | |
| `dev/account-simulator/stop` | `id` | |
| `dev/account-simulator/reset` | `id` | |
| `dev/account-simulator/delete` | `id` | |

Total: 127 endpoints referenced by the web app. Endpoints used only by the Chrome extension (task polling, result reporting, pings) are not in this bundle.

## 3. Enums

| Enum | Values | Evidence |
|---|---|---|
| Plan (`account_type_calculated`) | `free`, `pro`, `scale`, `unlimited` | `MainLayout`, `SubscriptionPage` |
| Campaign operational state (client computed) | `draft`, `setup_incomplete`, `needs_reassignment`, `paused`, `needs_targets`, `account_attention`, `daily_limit_reached`, `outside_working_hours`, `active` | `campaignOperationalStatus` |
| Launch block reasons | `no_lists`, `no_accounts` | `NewCampaignPage` |
| Device (instance) status (client computed) | `stopped`, `warning`, `offline`, `not_connected`, `working`, `waiting`, `idle`, `simulated_online` | `deviceStatus` |
| Account health (`account_status.state`) | `healthy`, `temporarily_paused`, `attention_required` | `deviceStatus`, `accountHealth` |
| Extension task (`status.task`) | `send_message`, `send_next_message`, `check_response`, `parsing`, `wait` | `deviceStatus` |
| Instance host type | `extension` (only one defined) | `deviceStatus` |
| Extension error (`error_reason`) | `tab_open_error`, `banned_error`, `open_direct_page_error`, `open_search_popup_error`, `user_search_error`, `user_click_error`, `entering_message_error`, `check_message_error`, `check_response_from_react_api_error`, `check_response_error`, `open_search_menu_error`, `search_user_click_error`, `open_followers_popup_error`, `parsing_error`, `close_modal_error`, `user_is_unreachable`, `instagram_reload_error`, `additional_tab_error`, `auth_error` | `errorCopy` |
| Message type | `text` | `CustomStepper`, `compiler` |
| List source | `list`, `followers`, `following`, `likes` | `ListsComponent`, `CreateList` |
| Target add source type | `raw`, `csv`, `json`, `parser` | `CreateList`, `FindLeadsPage` |
| Target `messaged_by` | `elsewhere` (others not shown) | `ListsComponent` |
| List verification (`enrichment_status`) | `idle`, `in_progress`, `completed`, `partial`, `failed`, `cancelled` | `ListsComponent`, `NewCampaignPage` |
| Scraping task type | `account`, `post`, `hashtag`, `keyword`, `mentions` (also read back as `mention`) | `FindLeadsPage` |
| Scrape `collectType` | `followers`, `following` | `FindLeadsPage` |
| `scrapeStatus` / `filterStatus` | `pending`, `queue`, `in progress`, `completed`, `failed`, `cancelled` | `FindLeadsPage` |
| Scrape phase (client computed) | `queued`, `scraping`, `filtering`, `completed` (Ready), `downloaded`, `failed`, `cancelled`, `unknown` | `FindLeadsPage` |
| Filter type | `followersCount`, `followingCount`, `lastPostBefore`, `bioKeywords` | `FindLeadsPage` |
| Task filter `unread` | `any` (plus read/unread values not enumerated in UI) | `MessagesPage` |
| Task filter `response` | `any`, `include`, `exclude` | `MessagesPage` |
| Task filter `follow_ups` | `any` plus two values for "Follow ups" and "First messages" (literals not captured) | `MessagesPage` |
| Task filter `error_filter` | `null` (All), `success`, `error` | `MessagesPage` |
| Task sort type | `by_task_date`, `by_response_date`; direction `asc`, `desc` | `MessagesPage`, `ResponsesTable` |
| Message origin kind (inbox) | `first_dm`, `follow_up` (with `follow_up_index`), `manual`; plus `variation` number | `UnifiedInboxPage` |
| Inbox message status | `Processing`, `Sending`, `Sent`, `Failed`; direction `sent` / `received` | `UnifiedInboxPage` |
| Tag types | none; free form `{name, color}`; special filter value `untagged` | `UnifiedInboxPage` |
| Account setup state | `draft`, `pending_review`, `changes_requested`, `approved`, `rejected` | `accountSetup` |
| Setup review history event | `submitted`, `resubmitted`, `withdrawn`, `approved`, `changes_requested`, `rejected` | `accountSetupReview` |
| Setup checklist row | `complete`, `warning`, `missing` | `accountSetupReview` |
| Warmup health (`account_health`) | `connected`, `stable`, `paused`, `action_required` | `warmupDisplay` |
| Warmup action type | `delete_posts`, `add_posts` | `AccountWarmupPage` |
| Warmup `phase_visible` | `action_available` (others not shown) | `warmupDisplay` |
| Warmup `paused_reason` | `manual`, `account_unhealthy` | `warmupDisplay` |
| Warmup `pause_causes` keys | `manual`, `health`, `system` | `AccountWarmupPage` |
| Warmup history event | (keys behind labels) setup approved, first login confirmed, step started, posts deleted, posts added, cap increased, `paused:manual`, `paused:account_unhealthy`, `resumed`, `resumed:account_healthy` | `AccountWarmupPage` |
| Workflow journey stage status | `completed`, `current`, `available`, `blocked`, `disabled` | `WorkflowsPage` |
| Workflow campaign status | `draft`, `launched` | `WorkflowCampaignsPage` |
| Workflow step type | `audience`, `message`, `wait` (`condition` is coming soon) | `workflowCampaigns`, `blocks` |
| Workflow block state | `available`, `coming_soon`, `launched_read_only`, `already_added`, `invalid_position`, `unknown` | `blocks` |
| Conversion compatibility | `full`, `partial`, `unsupported` | `ConversionPreviewDialog` |
| Notification type | derived: `campaign_no_targets`, `enrichment_failed`, `email_unverified`; persisted resource types: `conversation`, `account`, `parser_task`, `list`, `campaign`, `account_warmup` | `MainLayout` |
| Features | `workflow_campaigns`, `account_setup`, `account_warmup` | `index.js` |
| Capabilities | `account_setup_review`; dev: `account_simulator` | `index.js` |
| Cancel reasons | `no_leads`, `no_results`, `confusing`, `missing_features`, `account_problems`, `need_account`, `too_expensive`, `other` | `ManageSubscriptionModal` |
| Ops event kind | `churn_survey`, `find_leads_error` | `ManageSubscriptionModal`, `FindLeadsPage` |

## 4. Object shapes seen by the front end (partial)

```
user: {
  id, email, name, register_date, email_verified, timezone,
  account_type_calculated, max_working_accounts,
  payment: { is_trial, trial_used, paid_until },
  instagram_accounts: [], ban: {},
  options: { testing: { disable_messages_limit: { enabled } } },
  features: {}, capabilities: {}, dev_capabilities: { account_simulator }
}

summary: { accounts:{count, unique_usernames}, campaigns:{count, active},
           messages:{today, total}, targets:{total}, last_message:{date} }

campaign: {
  id, name, description, enabled,
  lists: [ { id, follow } ],
  options: { working_hours:{min,max}, messages_per_day:{min,max}, no_delay? },
  notifications: { no_targets: { enabled } },
  stats: { messages_sent:{today, all}, responses:{today, all} }
}

sequence: { id, sequences: [ { delay, enabled, messages: [ { type:"text", text, sent?, responses? } ] } ] }

account: {
  id, username, campaign_id, messages_today, messages_limit,
  account_status: { state },
  stopped_event: { reason, date },
  status: { is_in_process, task, target, next_date, additional_text }
}

instance: { id, name, color, online, last_ping, current, host_type, is_dev_simulated, account }

list: { id, name, source, enabled, count, is_campaign, enrichment_status,
        targets_total, targets_finished, targets_blocked, targets_remaining }

target: { id, username, blocked, error_reason, finished, conversation_id, messaged_by, followersCount, <custom fields> }

task (message row): { id, username, sent_from, campaign_id, original, task_date,
                      is_error, error_reason, response, last_response_check, conversation_id }

conversation: { id, thread_id, target_instagram_username, account_instagram_username,
                campaign_id, campaign_name, unread, tag:{id,name,color},
                last_instagram_message_timestamp_ms,
                messages: [ { text, status, kind, follow_up_index, variation } ] }

scraping task: { id, name, type, scrapeStatus, filterStatus, scrapedCount, filteredCount,
                 createdAt, startTime, lastUpdated, estimatedTimeMinutes, hasFilterPhase, filters }

account setup: { id, state, name, bio, photos:[{id, order, status, url}],
                 instagram_username, review notes, history:[{event, date}] }

warmup: { id, paused, paused_reason, pause_causes:{manual,health,system}, account_health,
          phase_visible, current_action:{type, instructions},
          dm_range:{current_cap, sent_today, ceiling},
          history:[{event, at}], linked_campaigns:[{id,name}] }

workflow_campaign: { id, name, status, steps:[{id,type,config}], accounts:[ids],
                     sending_rules:{messages_per_day, working_hours},
                     campaign_id, source_campaign_id }

effective cap: { effective_limit, campaign_limit, warmup_limit }
```

## 5. Not visible from the web bundle

- The extension's own endpoints and polling protocol.
- Full response schemas, error code lists and rate limits of the API.
- Any public or documented API for customers (none is referenced; there is no API key screen).
- Webhooks or integrations (no Zapier, CRM or webhook strings found).
