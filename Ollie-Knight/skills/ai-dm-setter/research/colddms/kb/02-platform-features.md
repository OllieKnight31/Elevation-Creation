# ColdDMs platform features (static analysis of the web app bundle)

Source: `research/colddms/source/webapp/` (132 minified JS files, Vue 3 + Quasar + Pinia, HTTP client `ky`). Nothing was called on api.colddms.com and no sign in was attempted. Everything below is read from front end code and embedded UI copy.

Conventions used in this file:

- Evidence is given as `FileName` plus a quoted string or identifier. Hashes in file names are dropped (for example `NewCampaignPage` means `NewCampaignPage.020b12bc.js`).
- Quoted UI copy is verbatim, with one change: the source uses long dashes in many strings, and they are written here as a plain hyphen with spaces (" - ").
- "Server side" means the value or rule is decided by the backend and is not visible in the bundle.
- `index.js` in the folder is the main bundle; chunks import it as `index.132db58e.js`. `index.08aba306.js` is only moment-timezone data.

Contents

1. Site map
2. Onboarding and get started
3. Campaigns, sequences, variants, personalisation
4. Workflows: account setup, setup reviews, account warmup, workflow campaigns
5. Lead sourcing: Find Leads, lists, targets, CSV import
6. Inbox, tags, quick replies, CRM pipeline, messages table, analytics
7. Accounts page (browsers / instances), statuses, extension
8. Plans, pricing, billing, terms and privacy
9. (see `03-safety-and-limits-guidance.md`)
10. (see `04-api-surface.md`)
11. Dev and internal features

---

## 1. Site map

All routes are children of `MainLayout` (evidence: `index.js`, route table, `path:"..."` entries). Unknown paths go to `ErrorNotFound`.

| Route | Chunk | What the page does | Gate |
|---|---|---|---|
| `/` | `IndexPage` | Dashboard. Header line with today's sent, replies, reply rate (and all time rate), count of active campaigns. "Needs you" card listing things blocking sending. "Recent replies" card. Collapsible campaigns table. Shows `GetStartedContent` during setup. For free users: button "Start 3 Day Free Trial". | login |
| `/sign-in` | `SignInPage` | "Welcome again", Email, Password, Cloudflare Turnstile captcha, "Login", links "New here? Start your free trial" and "Forgot password?". Sends browser timezone. After login goes to `/get-started`. | public |
| `/sign-up` | `SignUpPage` | "Get clients from Instagram - on autopilot." Fields Email, Password, Name, captcha; checkbox "I have read and agree to the Privacy Policy and Terms of Service"; button "Start 3-day free trial". Accepts `referral_id` and `coupon`. | public |
| `/forgot-password`, `/reset-password/:code` | `ForgotPasswordPage`, `ResetPasswordPage` | Password reset by emailed code. | public |
| `/confirm-email/:code` | `ConfirmEmailPage` | "Your email has been verified". | public |
| `/extension-id/:code` | `CodeAuthPage` | Hands a temporary auth code to the backend so the Chrome extension can attach to the logged in user (`users/set-temp-auth-code`). | login |
| `/logout` | `LogoutPage` | Logs out and clears onboarding store. | |
| `/privacy-policy`, `/terms-of-service` | `PrivacyPolicyPage`, `TermsOfServicePage` | Legal text (see section 8). | public |
| `/get-started` | `GetStartedPage` + `GetStartedContent` | 4 step setup checklist with progress, tutorial video, "Skip setup" link. | login |
| `/extension` | `ExtensionPage` | "Connect the extension": 3 step connect flow, live account detection, troubleshooting. | login |
| `/browsers` | `BrowsersPage` | Titled "Accounts", subtitle "Where your Instagram accounts are running". One card per Chrome profile (instance) with status, rename, colour. | login |
| `/campaigns` | `CampaignsPage` + `CampaignsTable` | Campaign list: Campaign, Status, Sent, Replies, Lists, Accounts, Open. Supports `?filter=drafts`. | login |
| `/new_campaign` | `NewCampaignPage` | 5 step campaign wizard. `?campaign_id=` resumes a draft, `?tour=1` starts the guided tour. | login |
| `/campaigns/:id` | `CampaignPage` | Campaign detail with tabs Settings, Targets, Sequences, Accounts, Replies (hash routed: `#settings`, `#targets`, `#sequences`, `#accounts`, `#responses`). Enable toggle, Save, Delete, "Convert to workflow". | login |
| `/workflows` | `WorkflowsPage` | "Workflows" overview: per account journey Account Setup, Account Warmup, Campaign Ready. | login |
| `/workflows/account-setup` | `AccountSetupPage` | Profile name, bio, 9 to 12 photos, submit for review. | feature `account_setup` |
| `/workflows/account-warmup`, `/workflows/account-warmup/:instagramAccountId` | `AccountWarmupPage` | One action at a time warmup, sending limits ramp, linked campaigns. | feature `account_warmup` |
| `/workflow-campaigns` | `WorkflowCampaignsPage` | List of visual workflow campaigns; create, convert an existing campaign, delete drafts. | feature `workflow_campaigns` |
| `/workflow-campaigns/new`, `/workflow-campaigns/:id` | `WorkflowCampaignBuilderPage` | Visual builder canvas (START, blocks, END). | feature `workflow_campaigns` |
| `/setup-reviews`, `/setup-reviews/:setupId` | `SetupReviewsPage`, `SetupReviewDetailPage` | Staff side review queue for account setups. | capability `account_setup_review` |
| `/targets` | `ListsPage` + `ListsComponent` + `CreateList` | Titled "Targets". Target lists, list creation, add targets, runway, verification state. | login |
| `/find-leads` | `FindLeadsPage` | Lead scraper: 5 source types, filters, task progress, create list from results. | login (trial needed to run) |
| `/inbox` | `UnifiedInboxPage` | "Inbox" (Unified Inbox, Beta). `?conversation=` deep link. | login |
| `/pipeline` | `PipelinePage` | Tab shell. Redirects to last used view (localStorage `pipeline_view`, default `board`). | login |
| `/pipeline/board` | `CRMPage` | Kanban CRM board. | login |
| `/pipeline/table` | `MessagesPage` | Messages table: every send task with filters and export. | login |
| `/messages` | redirect | Redirects to `/pipeline/table`. | |
| `/crm` | redirect | Redirects to `/pipeline/board`. | |
| `/settings` | `SettingsPage` | Redirects to `/settings/profile`. Sub routes `profile`, `security`, `billing`, `danger`. | login |
| `/subscription` | redirect | Redirects to `/settings/billing`. | |
| `/subscription-plans` | `SubscriptionPage` | Plan cards Pro, Scale, Unlimited. | login |

Feature gating: routes carry `meta:{feature:"workflow_campaigns"|"account_setup"|"account_warmup"}` or `meta:{capability:"account_setup_review"}`. The user object has `features`, `capabilities`, `dev_capabilities` maps (`index.js`, store `user`: `hasFeature`, `hasCapability`, `canSimulateAccounts`, `canReviewAccountSetups`). So Workflows, Account Setup, Account Warmup and Workflow Campaigns are per account feature flags that may or may not be on for a given license.

Left navigation (`MainLayout`), grouped:

- Workspace: Dashboard, Campaigns (expandable, lists each campaign plus "New campaign"; a campaign with no targets shows a red "No targets" marker), Workflows (expandable: Account Setup, Account Warmup; only if the features are on), Targets, Find Leads.
- Engagement: Inbox, Pipeline.
- Infrastructure: Accounts (`/browsers`), Extension.
- Operations: Setup Reviews (only with the reviewer capability).
- Settings, Terms Of Service link, "Need help?" menu with "Campaign setup guide", Telegram (`https://t.me/colddms`), WhatsApp (`https://api.whatsapp.com/send?phone=18122620321`), Email (`mailto:contact@coldDMs.com`).
- Header: plan badge (FREE, TRIAL, PRO, SCALE, UNLIMITED), user email, Logout, a "Setup · N of 4" progress pill linking to `/get-started`, and a notification bell.

Notification bell (`MainLayout`, `notifications/*`): sections "Current issues" and "Earlier", "Mark all as read", empty state "You're all caught up" / "No issues need your attention right now." Derived (client computed) notifications:

- `campaign_no_targets`: "Campaign needs leads" / "${name} has no targets available." action "View campaign".
- `enrichment_failed`: "Lead processing failed" / "Enrichment for "${name}" requires attention." action "View list".
- `email_unverified`: "Verify your email" / "Confirm your email address to keep your account verified." action "Verify email".

Persisted notifications link by resource type: `conversation` to `/inbox?conversation=ID`, `account` to `/browsers`, `parser_task` to `/find-leads`, `list` to `/targets`, `campaign` to `/campaigns/ID`, `account_warmup` to `/workflows/account-warmup/ID`.

---

## 2. Onboarding and get started

### 2.1 Sign up (`SignUpPage`)

- Headline "Get clients from Instagram - on autopilot." with three bullets: "Your first campaign sending in ~10 minutes", "Sends from your own browser - no password shared", "3-day free trial".
- Note under the form: "After signup we ask you to confirm your email before anything else - paused-account and reply alerts go there."
- After signup dialog: "One thing first - verify your email" / "We sent a link to ${email}. Verifying unlocks reply and paused-account alerts, so you'll know when leads answer." button "Continue to setup" goes to `/new_campaign`.
- Validation message: "Accept privacy policy first".
- Default timezone fallback in code: `Europe/London`.

### 2.2 Trial start dialog (`NewCampaignPage.showTrialDialog`, `FindLeadsPage`)

Title: "Welcome to ColdDMs!"

Body (campaign page): "Try it for 3 days, completely free" then "We also guarantee you sign at least one client in the first 30 days or refund you completely (send min. 1k messages in the month)". Button "Start free trial".

Body (Find Leads variant): "Get your leads and try ColdDMs for 3 days, completely free" plus the same guarantee line. Button "START FREE TRIAL".

Starting the trial calls `payments/get-payment` with `type:"pro"` and redirects to the returned checkout URL. So the trial is a Pro plan trial that needs a payment method through the hosted checkout (inferred from the redirect; the checkout page itself is not in the bundle).

After checkout a welcome dialog shows: "Welcome on board" / "We highly recommend texting us for a smooth onboarding experience." with Telegram and WhatsApp buttons, then "Enjoy your trial! Here's a tutorial on how to use our service." with an embedded YouTube video `https://www.youtube.com/embed/Yh8V_a01CVY`. A Google Ads conversion event fires (`AW-16645432847/X5beCMCdsMgZEI_MlIE-`).

### 2.3 Get started checklist (`setupSteps`, `GetStartedContent`, `OnboardingStore`)

Header: "Let's get your first DMs out". Progress: "N of 4 done - about M minutes to go." Each step has a time estimate, sub steps, a callout, a call to action, a manual "I've already done this" link, and (step 3 only) a "Show me how" button. Locked steps read "unlocks after step N". Link at the bottom: "Skip setup - I know what I'm doing". FAQ section contains only the tutorial video. On completion: "All set!" / "You're all set to get clients from Instagram with ColdDMs!" / "Need help along the way? Contact our support team anytime." button "Go to dashboard".

Step 1, "Connect your Instagram account" (2 min). Auto completes when at least one account is connected.

> "First, you'll need to install our Chrome extension and connect your Instagram account:"
> 1. "Visit the Chrome Web Store to install our extension" (link `https://chromewebstore.google.com/detail/colddms/ffcepcgicipeaajceijngacfelhpgofe`)
> 2. "Install the extension and click on the **extension icon** in your browser"
> 3. "You should see your email and a big **"START"** button"
>
> Warning callout: "Your browser needs to stay open for automation to work."
>
> Button: "Install extension"

Step 2, "Create target lists" (3 min). Auto completes when at least one list exists.

> "Next, you need to create a list of people to message:"
> 1. "Go to the **"Targets"** page"
> 2. "Add usernames by importing from **CSV** or pasting them directly"
> 3. "Click **"Create List"** to create a new target list"
> 4. "Or use **"Find Leads"** to discover potential targets automatically"
>
> Tip callout: "We recommend having at least 1000 targets for an effective campaign."
>
> Button: "Create targets" (`/targets`)

Step 3, "Set up a campaign" (5 min). Auto completes when at least one campaign exists. Has the guided tour.

> "Now it's time to set up your messaging campaign. Don't worry, you can edit this later!"
> 1. "Go to the **"Campaigns"** page"
> 2. "Click **"New Campaign"** to create a new campaign"
> 3. "Give your campaign a **name**, a **description** (not visible to customers) and set **working hours**"
> 4. "Set **messages per day** (we recommend **50 or less** per account)"
> 5. "Assign the **target list** you created earlier"
> 6. "Create **message templates with variations**. Good variations are important for account health!"
> 7. "Schedule **follow-up messages** if desired"
> 8. "**Assign your account** for your new campaign (this doesn't start sending messages)"
>
> Tip callout: "Using variations helps improve response rates and keeps your account safe."
>
> Button: "Create campaign" (`/new_campaign`)

Step 4, "Start sending messages" (1 min). Auto completes when any account has a `campaign_id`.

> "You're almost ready to start messaging!"
> 1. "Open the extension and click on the **"Start"** button"
> 2. "Check the **"Messages"** tab to monitor activity"
> 3. "Keep your computer **running and connected to the internet**"
>
> Tip callout: "You can manage replies in the unified Inbox once people start responding!"
>
> Button: "Open Messages" (`/pipeline/table`)

Trial or plan limit banner on this page (`GetStartedContent`, function `X`): "Your trial sends from at most N account(s). You've connected M - the extra account(s) won't send until you upgrade." (or "Your plan sends from at most ..."). Button "Upgrade" to `/subscription-plans`. Driven by `max_working_accounts` on the user.

Campaign demo dialog (`CampaignDemoDialog`): "Creating your first campaign", an animated GIF `/demos/campaign-setup-demo.gif` ("Walkthrough of creating a campaign: settings, targets, messages, accounts"), buttons "Close" and "Try it guided" (opens `/new_campaign?tour=1`).

Guided tour: `NewCampaignPage` lazy loads `assets/campaignTour.60d4688d.js`, which is NOT in the saved folder. Tour stage ids are `stage-1` to `stage-5` and the anchor ids are `campaign-form`, `campaign-name`, `campaign-description`, `campaign-hours`, `campaign-mpd`, `campaign-targets`, `campaign-create-list`, `campaign-pick-list`, `campaign-sequences`, `campaign-variants`, `campaign-followups`, `campaign-accounts`, `campaign-done`, `campaign-continue`. The tour step text itself could not be read.

### 2.4 Extension page (`ExtensionPage`)

Title "Connect the extension", subtitle "Three steps and your Instagram account starts appearing in ColdDMs."

1. "Install the extension" - "Get it from the Chrome Web Store, in the browser you'll keep open for sending." Button "Install from Chrome Web Store". Chip "Done" when detected.
2. "Start it" - "Sign in to Instagram in that browser (click "save login info"), then click the extension icon and press START. Keep the browser open - that's what sends." Chip states: "Waiting for START…" or "Extension not running - open Chrome and press START".
3. "Your account appears here" - "Usually within 30 seconds - this page updates itself." Connected accounts show as chips `@username`. Then buttons "Create your campaign" and "Manage Chrome profiles".

Card: "Keep this browser open." / "Sending stops when Chrome closes or the laptop sleeps - the dashboard strip will show the profile as offline."

Signed out note: "@name is signed out of Instagram - sign back in (save login info) in its Chrome profile and press START".

Expander "Not seeing your account? Troubleshooting steps":

1. "Stop the extension"
2. "Logout Instagram"
3. "Login Instagram (click "save login info"!)"
4. "Start the extension"
5. "Refresh this page after 15-30 seconds"

### 2.5 What onboarding does NOT say

Searched every app chunk for: proxy, proxies, VPN, aged, antidetect, Multilogin, AdsPower, Dolphin, GoLogin. Zero matches. The only infrastructure model in the product is "one Chrome profile per Instagram account, extension running, browser kept open". The cancel survey mentions account supply ("I need an IG account" answered with "We have suppliers. Text us and we'll connect you at discounted rates"), which is the only reference to bought accounts.

---

## 3. Campaigns

### 3.1 Campaign wizard (`NewCampaignPage`, 5 steps)

Page title "New campaign" (or "Continue setup" with a "Draft" badge when resuming). Sub text: "Launch unlocks only when every link holds - you can save a draft at any step." A "Save as draft" button exists on every step. The four wizard step names are "Select campaign settings", "Targets", "Sequences", "Instagram accounts", then "Review & launch".

Step 1, Select campaign settings (`CampaignForm` inside `CustomStepper` chunk)

| Field | Control | Range | Default | Notes |
|---|---|---|---|---|
| Name | text | required ("Name is required") | empty | |
| Description | textarea | optional | empty | Onboarding copy: "not visible to customers" |
| Working Hours | range slider | 0 to 24, step 1 hour | 8:00 to 22:00 (`working_hours:{min:8,max:22}`) | Caption: "We'll randomly send messages during these times - in your timezone (TZ)." |
| Messages Per Day | range slider (min and max handles) | 0 to 100, step 1 | 35 to 45 (`messages_per_day:{min:35,max:45}`) | Caption: "The number of messages sent by each Instagram account daily." |
| Disable limit | toggle | boolean | hidden | Only rendered when `no_limit` is a boolean, which only happens when the user has `options.testing.disable_messages_limit.enabled` or the campaign already has `options.no_delay`. Internal testing switch (see section 11). |

Messages per day hints: when the max handle is 50 or lower, a green line "✓ within the safe range (≤50)". When the max handle is above 50, a red banner: "We don't recommend sending more than 50 messages per day" with an "I understand" button that hides it. The banner does not block saving.

The messages per day value is a range, not a single number. The daily cap used everywhere in the UI is the `max` value (`messages_per_day.max`); the backend presumably picks a per day number between min and max (inferred, not visible).

Working hours are evaluated in the account owner timezone set in Settings (Profile): "Working-hours windows evaluate in this timezone, campaigns send only when it's inside their window here." The check is `hour < min || hour >= max` means outside (`campaignOperationalStatus`, function `m`). There is no per day of week schedule, no per campaign timezone and no weekend switch in the UI.

Step 2, Targets

- "Create new list" form (`CreateList`) or "Or pick existing" table (`ListSelectComponent`: Name, Type, Count; caption "Lists - Lists of target users that messages will be sent to.").
- Runway line: "N days of sending at X/day" computed as ceil(total remaining targets / messages_per_day.max).
- Warning if a selected list has `enrichment_status !== "completed"`: "This list isn't fully validated yet. Some accounts may no longer exist, which can lower your response rate."
- Lists are attached as `lists:[{id, follow:true}]`. The `follow` flag is always sent as `true` by the UI and has no visible control. For lists whose source is an Instagram account, the tooltip says "ColdDMs will automatically add new targets to the list. You can do it manually too.", so `follow` most likely means "keep following the source for new targets" (inferred). It is not an Instagram follow action.

Step 3, Sequences (`CustomStepper`) - see 3.3.

Step 4, Instagram accounts (`AccountsPickerComponent` in `launchBlockedMessage`)

- Table "Select which Instagram accounts to use." Columns: Account, Chrome profile, Status, Currently on.
- An account sends for one campaign at a time. Picking an account that is on another campaign opens "Move @user to this campaign?" with: "An Instagram account sends for one campaign at a time. Moving it here means:" then bullets "${Other campaign} stops sending - it will show Needs reassignment (or Setup incomplete) until you give it another account.", "This campaign resumes sending with @user" (or "This campaign will use @user once it launches") with a suffix such as " - N remaining targets, in-window (or outside the send window right now), X DMs/day available.", and "In-flight follow-ups from "Other campaign" still send - only new first messages stop." Buttons "Cancel" / "Move account".
- Note on step 5: "Save as draft keeps @x on its current campaign - accounts move only when you launch."
- Warning on the campaign page: "The following Instagram account is linked to another ColdDMs account and can't be added - please contact support." (an Instagram account can only belong to one ColdDMs user).

Step 5, Review & launch

- Shows the "campaign chain" (see 3.2) and a "If you launch now:" preview line, for example: "the first DM goes out around 14:35 today from @user (45/45 left today). "Other campaign" stops and will read Needs reassignment. ≈22 days of runway."
- Preview logic (`launchPreview`): if now is inside working hours, first send is about now + 5 minutes rounded up to the next 5 minute mark; if before the window, `~HH:00 today`; if after, `~HH:00 tomorrow`; if the best account has 0 left today, tomorrow. Best account is the healthy one with the most remaining quota (`cap - messages_today`). Runway is ceil(remaining targets / (healthy accounts × cap)).
- If no assigned account is healthy: "No assigned account can send right now - nothing goes out until one is fixed."
- Messages: "Everything checks out - launch when you are ready." or "Fix the highlighted link above, then launch." or "Couldn't check your Instagram accounts, so launching is on hold." with "Retry".
- Launch does: `accounts/set-campaign` with `confirm_moves:true`, then `campaigns/edit {id, enabled:true}`. The server can answer `blocked.launch` with reasons `no_lists` ("Launch blocked: the campaign has no target list. Pick one in step 2.") or `no_accounts` ("Launch blocked: no Instagram account is assigned. Pick one in step 4."). On failure the account moves are rolled back.
- Success toast "Campaign launched".

Validation at step 3: every variant of every step must have text ("Message is required").

### 3.2 Campaign chain and operational status

Chain ("What this campaign needs to send", `CampaignChain`): four nodes, each ok, broken or neutral.

| Node | Broken when | Text |
|---|---|---|
| Target list | no list | "No list attached" / "Nothing to send until a target list is attached." |
| Target list | no targets left | "No prospects left" / "Every prospect in the attached list(s) has been messaged." |
| Sequence | no message text | "No messages yet" / "The campaign has nothing to say to a prospect." OK text shows "N steps, M variations" and "Follow-ups at +N d". |
| Instagram account | none | "None assigned" / "Nothing can send until an Instagram account is assigned." |
| Instagram account | all unhealthy | "N assigned account(s) need(s) attention." OK text shows "sent/cap today". |
| Send window | never broken | "HH:00 - HH:00 · X/day" or "Any time"; detail "In window now" or "Outside window - resumes at HH:00". |

Summary line: "The chain is broken at the X - (fix)." or "Chain complete - ready to launch." or "Chain complete - this campaign resumes on the next task cycle."

Operational status badge (`campaignOperationalStatus`, enum `S`), evaluated in this order:

| State | Label | Meaning / description text |
|---|---|---|
| `draft` | Draft | Not enabled and never sent. "Setup not finished - continue where you left off." Action "Continue setup". |
| `setup_incomplete` | Setup incomplete | Enabled but missing list or account. "Needs a target list and an Instagram account." / "No Instagram account is assigned yet." / "No target list is attached yet." |
| `needs_reassignment` | Needs reassignment | Enabled, has lists, has sent before, now has no account. "Was sending before. Reassign an Instagram account to resume." |
| `paused` | Paused | Not enabled but has sent before. "Sending is paused for this campaign." |
| `needs_targets` | Needs targets | `notifications.no_targets.enabled` is set by the server. "No remaining prospects to message in the attached list(s)." |
| `account_attention` | Account attention | Every assigned account is unhealthy. "N assigned account(s) need(s) attention." Action "Review accounts". |
| `outside_working_hours` | Outside working hours | "Sending resumes at HH:00 in your timezone." |
| `daily_limit_reached` | Daily limit reached | Every healthy account has `messages_today >= messages_per_day.max`. "Every assigned account has reached its daily message cap." |
| `active` | Active | "Configured, healthy, and able to send." |

### 3.3 Sequences, follow ups and A/B variants (`CustomStepper`)

Data model sent to `sequences/create` and `sequences/edit`:

```
sequences: [
  { delay: 1, enabled: true, messages: [ {type:"text", text:"..."}, ... ] },   // step 1 = first message
  { delay: N, enabled: true, messages: [ ... ] }                               // follow-up N
]
```

- One sequence record per campaign (`sequences/list` returns an array; the UI uses `sequences[0]`).
- Steps: 1 first message plus up to 9 follow ups, 10 steps total. Error: "Only 10 messages are allowed". Labels use ordinals "First message", "First follow-up" up to "Ninth".
- Minimum 1 step: "At least one message  is required".
- Delay between steps: slider "Delay between messages in days", min 1, max 30, step 1, default 1. Shown only on follow ups (the first step has no delay control). No hour or minute level delays.
- Variants per step: a new step is created with 5 empty variants. Maximum 10: "Only 10 variants are allowed". Deleting is refused below 5: "At least five messages at a sequence are required". So in the classic campaign editor every step must have 5 to 10 variants, and every variant must be non empty to save.
- Step summary chips: "N variations", "N sent · N replies · X% reply", and a warning style chip " 1 variation - add more for safety " when a step has only one.
- Message type: only `type:"text"` exists anywhere in the bundle. No image, voice note, reel, link preview or file controls. No spintax parser or `{a|b}` syntax. Variation is achieved only through whole message variants, which the backend rotates (rotation rule is server side).
- "Variant performance" table on step 1 (once there are sends): columns Variant, Sent, Replies, Reply rate, plus a verdict badge. Logic (`launchBlockedMessage`, `Be=10`): variants with fewer than 10 sends are "Too early (under 10 sends)"; among the rest, if at least two and rates differ, the top is "Best performer" and the bottom is "Weakest - pause it?".
- Stop on reply is a fixed system rule, not a setting. Workflow builder badge "SYSTEM RULE": "Remaining follow-ups stop automatically when this prospect replies. This isn't configurable per workflow - it's how ColdDMs sending always behaves." A single lead's follow ups can also be stopped by hand from the Messages table (`tasks/stop-follow-up`).

### 3.4 Personalisation variables

Classic campaign editor chips (`CustomStepper`):

- "Built-in:" `{{firstName}}`, `{{username}}`, `{{name}}`
- "From your CSV:" `{{custom.KEY}}` for each custom column imported with the attached lists. Each chip shows coverage, for example "blank for 12 of 300 prospects".
- Default value syntax: `{{custom.KEY|default text}}`. Dialog "Default value" / "Shown when a prospect has no "Label" - blank for X of Y prospects." Chip action "Insert with a default value" / "set default value".
- "Not in this campaign's lists:" dead tokens (a `{{custom.x}}` used in the text but not provided by any attached list) are flagged.
- Empty state: "No custom fields yet - import a CSV with extra columns to add {{custom.key}} placeholders."
- Key format: `^[a-z0-9_]+$`.

Workflow builder variables (`WorkflowCampaignBuilderPage`, "Personalization"): `{{firstName}}` First name, `{{lastName}}` Last name, `{{fullName}}` Full name, `{{username}}` Username, `{{name}}` Name, plus `{{custom.key}}`. Tokens starting `enrich.` or `ai.` produce "{{x}} isn't supported yet." which shows that enrichment and AI variables are planned but not live. Bad custom names produce "{{x}} has an invalid placeholder name."

Preview: "Preview as sample prospect" calls `targets/preview {campaign_id, text}`. Dialog "Message preview": "Custom values are real (sample: @user); built-in variables (firstName, name, username) are shown as examples." or "No prospects in this campaign's lists yet - custom values are shown empty."

Save time warnings (`PlaceholderWarnings`): the server returns `warnings` and the UI asks "Some prospects will get a blank" / "{{token}} will be blank for X of Y prospects." / "You can set a default value on the placeholder instead, so everyone gets something." Buttons "Go back" / "Save anyway" (resend with `confirm:true`). Removing a list that a sequence depends on is blocked: "Can't remove this list yet" / "Your message sequence still uses placeholders that only this list provides. Remove them from your sequence first, then remove the list."

How `firstName` is derived (from Instagram full name or username) is server side.

### 3.5 Campaign detail page (`CampaignPage`)

- Header: status badge, "Enabled" toggle (toasts "Campaign enabled" / "Campaign paused"), red "no targets" marker.
- Stats tiles (`StatsCampaignComponent`): "Messages Sent", "Replies", "Reply Rate" (replies / sent, one decimal).
- Tabs: Settings (same form as wizard step 1, buttons Save and Delete), Targets (attached lists with `ListsComponent`), Sequences, Accounts, Replies (`ResponsesTable`: Name, Sent From, Last Reply, Reply Date, "Mark as read", "Open conversation"; opening links to `https://www.instagram.com/direct/t/{conversation_id}/` with the hint "Switch to this account's Chrome profile to enter the conversation").
- Delete confirmation: "You will lose all stats, responses and data for this campaign. Are you sure? This action cannot be undone".
- "Convert to workflow" / "Open workflow" button (see 4.4).
- Failed leads: `campaigns/download-failed-leads` and a "Retry Failed Leads" modal (`RetryFailedLeadsModal`): paste usernames or upload a CSV and choose the username column, pick the target list, "Maximum 10,000 usernames per retry", result "Reset X of Y targets for retry".
- Before data loads the form holds placeholder values `working_hours 8 to 22` and `messages_per_day 50 to 70`; these are overwritten by the saved campaign and are not the creation defaults.

### 3.6 Things the campaign UI does not have

Checked by string search over all chunks: no follow before message, no like, no story view, no comment, no skip rules (for example skip private, skip verified, skip if already in conversation), no blacklist of usernames, no per message delay or typing speed setting, no per account limit override, no schedule by weekday. Delay between individual sends is not configurable; the copy only says messages are sent randomly inside working hours. Dedupe across campaigns exists but is automatic (see 5.4).

---

## 4. Workflows

"Workflows" is a newer, feature flagged layer: "Get accounts ready, warm them up safely, and run campaigns -- all in one place." (`WorkflowsPage`). Per account journey with three stages: Account Setup, Account Warmup, Campaign Ready. Stage statuses: `completed` (Completed), `current` (Current), `available` (Available), `blocked` (Blocked), `disabled` (Unavailable, "This step isn't enabled for this account."). Account row labels: "Needs attention", "Action available", "Progressing", "Not started", "All set", "In progress", "Not available".

Stage descriptions (`WorkflowsPage`):

- Setup: "Finish the profile details and photos, then submit for review." / "Profile approved -- Account Warmup is available." / "Not started yet."
- Warmup: "Warmup will begin once setup is approved." / "An action is available for this account right now." / "This account needs attention before warmup can continue." / "Warmup is complete and the account has a campaign." / "Waiting on an earlier step."
- Campaign: "Complete setup and warmup before this account can join a campaign." / "This account is ready to join a workflow campaign." / "Not yet associated with a workflow campaign." / "This account is sending on a launched workflow campaign."

The account panel shows "Today's safe range" (the warmup `dm_range.current_cap`). Empty state: "No connected accounts yet" / "Connect an Instagram account first to start a Workflow."

### 4.1 Account Setup (`AccountSetupPage`, `accountSetup`)

Subtitle: "Prepare a connected Instagram account before it starts Warmup."

| Item | Rule | Message |
|---|---|---|
| "Name to use" | required, max 30 characters | "Name is required" / "Name must be 30 characters or fewer" |
| "Bio" | required, max 150 characters (counter shown) | "Bio is required" / "Bio must be 150 characters or fewer" |
| Photos | 9 to 12, JPEG, PNG or WEBP, drag to reorder | "Add at least 9 photos (n/9)" / "Remove photos -- maximum is 12 (n/12)" / "Only JPEG, PNG or WEBP photos are supported" |

Photo guidance: "Use authentic, varied photos. Avoid duplicate or generic-looking images." and "Add between 9 and 12 original, account-specific photos." A "Live preview" card (`ProfilePreview`) mocks the Instagram profile with name, bio ("Your bio will appear here.") and the photo grid.

Submit checklist "Ready to submit?": "Name is valid", "Bio is valid", "9-12 photos added". Review screen: "Review your account setup" / "Check your profile details and photos before sending them for review."

States (`accountSetup`, `accountSetupReview`):

| State | Label | Customer facing text |
|---|---|---|
| `draft` | Draft | "Fill in the profile details and add your photos, then submit for review." |
| `pending_review` | Pending review | "Your submission is waiting for review. If you notice something that needs changing, you can withdraw it and edit your submission." |
| `changes_requested` | Changes requested | "Update the details below based on the reviewer's note, then resubmit." (shows "Reviewer feedback") |
| `approved` | Approved | "Your account setup has been approved. Account Warmup is now available." Button "Continue to Account Warmup". |
| `rejected` | Rejected | "This account setup was rejected and cannot be resubmitted." |

Dialogs: "Submit account setup for review?" / "Your setup will become read-only while it is being reviewed. You can withdraw it to make changes until a reviewer completes the review." and "Resubmit account setup?" / "Your updated setup will be returned to the review queue." and "Edit submitted setup?" / "Your setup will be removed from the review queue so you can make changes. You'll need to submit it again when you're ready." (buttons "Edit submission" / "Keep in review"). Toasts: "Submitted for review", "Resubmitted for review", "Setup withdrawn - you can make changes now".

Important observation: the name, bio and photos are uploaded to ColdDMs, reviewed by a human, and then (in warmup) the user is told to delete old posts and add new posts. Nothing in the web bundle shows ColdDMs writing the profile to Instagram itself; whether the extension applies the name, bio and photos automatically or the user does it by hand could not be determined.

### 4.2 Setup Reviews (staff tool, `SetupReviewsPage`, `SetupReviewDetailPage`)

Visible only with capability `account_setup_review`. Message when missing: "You do not have permission to review account setups." This is the ColdDMs team's own moderation queue shipped inside the customer bundle.

- Queue: "Account Setup Reviews" / "Review submitted Instagram account profiles before warmup begins." Metric tiles "Pending review", "Changes requested", "Approved today", "Rejected". Tabs Pending, Changes requested, Approved, Rejected, All. Search "Search by username or account name...". Row tags "Resubmitted", "Development simulation".
- Detail: "Setup checklist" with three rows: "Profile identity" ("Name and at least one photo are required."), "Bio" (n characters), "Photos" (n photos, 9-12 required). Each row is Complete, Warning or Missing. Photo grid with lightbox.
- "Review decision" panel: Current state, Submitted, Submission ("First submission" or "Resubmission"), "Previous reviewer feedback", field "Feedback for customer" ("The customer will see this text."), field "Internal notes (reviewer-only)" ("Reviewer-only - never shown to the customer."), buttons "Approve setup", "Request changes", "Reject".
- Dialogs: "Approve this account setup?" / "Approval will unlock Account Warmup for this account." ; "Request changes" / "What needs to be updated?" / "Explain exactly what the customer should change before resubmitting." ; "Reject this account setup?" / "Use Reject when this setup should not proceed in its current account/workflow context. For correctable profile changes, use Request changes instead." / "Reason for rejection".
- Review history events: Submitted, Resubmitted, Withdrawn by customer, Approved by Reviewer, Changes requested by Reviewer, Rejected by Reviewer.

The review criteria themselves (what makes a bio or photo set pass) are human judgement and not encoded in the bundle.

### 4.3 Account Warmup (`AccountWarmupPage`, `warmupDisplay`)

Subtitle: "One focused action at a time -- ColdDMs reveals the next step automatically." Prerequisite: "Warmup hasn't started for this account" / "Account Setup must be approved before warmup begins."

The warmup schedule (number of days, ramp steps, numbers) is NOT in the front end. The server returns one warmup object per account and the UI renders it. What the bundle reveals about its shape:

```
warmup: {
  id, paused, paused_reason ("manual" | "account_unhealthy" | ...),
  pause_causes: { manual, health, system },
  account_health: "connected" | "stable" | "paused" | "action_required",
  phase_visible: "action_available" | ...,
  current_action: { type: "delete_posts" | "add_posts", instructions: "<server text>" },
  dm_range: { current_cap, sent_today, ceiling },
  history: [ { event, at } ],
  linked_campaigns: [ { id, name, ... } ]
}
```

Manual actions (the only two action types):

| Type | Heading | Confirm control | Payload |
|---|---|---|---|
| `delete_posts` | "Delete old posts" | Checkbox "I've deleted this account's old posts on Instagram", button "Confirm deletion" | `complete-action {id, acknowledged:true}` |
| `add_posts` | "Add new posts" | Number input "How many posts did you add today?" valid 1 to 5 (default 1), button "Confirm" | `complete-action {id, posts_added_today:n}` |

The instruction paragraph for each action comes from the server (`action.instructions`) and is not in the bundle.

Waiting state: "You're done for now." / "There is no next step to select. ColdDMs will reveal a new action automatically when the account is ready."

History event labels ("Completed so far"): "Account setup approved", "First login confirmed", "Warmup step started", "Old posts deleted", "New posts added", "Daily message cap increased", "Warmup paused" (`paused:manual`), "Warmup paused (account needs attention)" (`paused:account_unhealthy`), "Warmup resumed", "Warmup resumed automatically" (`resumed:account_healthy`).

This order of labels implies the ramp: setup approved, first login confirmed, delete old posts, add new posts over several days (1 to 5 per day), with "Daily message cap increased" events as the cap ramps toward the ceiling. Exact day counts and cap values are server side.

"Sending limits" panel (`DmRampPanel`):

- "Effective today" - tooltip "The most DMs this account can safely send today, per its current warmup ramp." (`dm_range.current_cap`)
- "Sent today" - tooltip "How many DMs this account has already sent today." (`dm_range.sent_today`)
- "Ceiling" - tooltip "The configured maximum this account's ramp will ever reach." (`dm_range.ceiling`)
- Status line "Automatic ramp is active" or "Automatic ramp is paused", and "Today's safe range: up to N DMs".
- Header chip "Effective daily limit: N".

Health badge (`warmupDisplay`): `connected` Connected (neutral), `stable` Stable (success), `paused` Paused (warning), `action_required` Action required (danger). Page status: "Needs attention", "Action available", "Progressing", "Unavailable".

Pause and resume: buttons "Pause" / "Resume". Pause cause rows: "Manual pause", "Account health hold", "System hold". Texts: "Warmup is paused because this account needs attention. It will resume automatically once the account is healthy again." ; "Warmup is paused. Resume when you're ready to continue." ; "This account needs attention before warmup can continue." ; "Resuming clears your manual pause, but sending stays paused until (account health | a system hold | account health and a system hold | another issue) resolves."

Link to campaigns: "Linked campaigns" panel, select "Link a campaign" + "Link", "Unlink NAME", empty "No campaigns linked yet." (`account-warmups/link-campaign`, `unlink-campaign`). So a warming account can already be linked to a campaign and send, capped by its warmup `current_cap`.

### 4.4 Effective cap (how the real daily limit is computed)

`campaigns/effective-cap {campaign_id}` returns `{effective_limit, campaign_limit, warmup_limit}` (`WorkflowCampaignBuilderPage`, `WorkflowOverviewPanel`). Display:

- "Effective today: N/day"
- "Campaign limit: N/day" (the campaign's messages per day)
- "Warmup limit: N/day" (only when a number, meaning a warmup ramp applies)
- Fallback disclaimer when the call has no number: "Actual sending may be lower when Account Warmup or other account limits apply."

The arithmetic is server side. From the three fields and the copy, the effective limit is the campaign limit reduced by the warmup limit (most likely the lower of the two per account). That is an inference.

### 4.5 Workflow Campaigns (visual builder)

List page (`WorkflowCampaignsPage`): "Workflow Campaigns" / "Build visual Instagram outreach automations -- separate from the classic Campaigns menu." Tiles Total, Active, Draft. Filters All, Draft, Launched; sort "Recently updated" or "Name (A-Z)". Cards show Accounts, Messages, Daily limit (N/day), a mini step strip (Targets, message, Nd waits). Buttons "Create workflow campaign", "Convert existing campaign" ("Choose a campaign to build a workflow from."). Delete: "Delete "NAME"? This only removes the draft - it never affects a linked campaign."

Builder (`WorkflowCampaignBuilderPage`, `workflowCampaigns`, `blocks`, `compiler`):

- Canvas with START and END, zoom, fit, pan. Four selectable "Add Block" layouts: "Right panel", "Left library", "Floating", "Bottom tray".
- Left rail sections: Overview, Workflow, Accounts (settings), Replies.
- Block types (`blocks`):

| Type | Label | Description | Status |
|---|---|---|---|
| `audience` | Instagram Targets | "Choose who this workflow will contact" | live, exactly one ("Instagram Targets already added - exactly one is allowed") |
| `initial_message` (type `message`) | Initial DM | "Send the first message" | live ("Initial DM already added") |
| `followup_message` (type `message`) | Follow-up DM | "Send another message" | live ("Add an Initial DM before a follow-up") |
| `wait` | Wait | "Wait before the next step" | live, default 2 days (`config:{days:2}`), min 1 ("Set a wait of at least 1 day") |
| `condition` | Condition | "Branch based on a condition" | "Coming soon" |

- Order rule: audience, message, then alternating wait and message. "Can't go here - would break the send order". Max 10 messages (`M=10`): "A workflow can have at most 10 messages - remove some to launch". Max 10 variants per message (`b=10`): "A message can have at most 10 variants - remove some to launch". Unlike the classic editor there is no 5 variant minimum; a message block starts with one text.
- Validation issues: "Targets required", "Select at least one target list", "At least one message is required", "Message is empty", "One or more variants are empty", "Add a wait between messages", "Add a follow-up message after this wait, or remove it", "Select at least one Instagram account", "Configure sending schedule". Toolbar: "Workflow incomplete - N items need attention" with "Fix", or "Ready to launch".
- Targets panel note: "Only existing lists you've already built (via Find Leads, Targets, or Create target list above) can be used - new scraping isn't started from here."
- Settings panel: "Send from" (account picker), "Sending rules": "Working hours" ("We'll randomly send messages during these times."), "Messages per day" ("The number of messages sent by each Instagram account daily.") with the same safe range line and the same over 50 warning.
- Launch review dialog: Targets "~N prospects (lists)", Sequence, Sending from (@accounts, "N paused/blocked"), Daily limit "N messages/day", "If you launch now:" preview, button "Launch Workflow".
- Launching "compiles" the draft into an ordinary campaign (`compiler`: steps become `sequences[{delay, enabled, messages[{type:"text"}]}]`, lists become `[{id, follow:true}]`, sending rules become `options.messages_per_day` and `options.working_hours`). Replies panel text: "Launching compiles this draft into a live campaign - replies to its messages will show up here." After launch: "Workflow launched - editing disabled".
- Statuses: `draft`, `launched` (labels Draft, Ready, Active). Audience node states: `in_progress` "Preparing...", "Ready", "Needs setup".
- Conversion of a classic campaign (`ConversionPreviewDialog`): compatibility `full` "Fully compatible", `partial` "Partially compatible" (requires ticking "I understand what won't carry over"), `unsupported` "Can't convert this campaign". "Already converted" / "This campaign already has a workflow."

---

## 5. Lead sourcing

### 5.1 Find Leads (`FindLeadsPage`)

Entry: "Find leads" / "How do you want to find leads?" with five source cards: "From accounts", "From posts", "From hashtags", "From keywords", "From mentions". Side panel "Your searches" ("Running searches first, then your most recent ones.").

Banner: "Important: We currently do not support verified accounts being scraped. If you target a verified account, a very limited number of leads will be collected from it. We're working on a solution."

Free users must start the trial before running a scrape (code comment string "User needs to start trial before using the scraper").

| Source | Title and copy | Inputs | API |
|---|---|---|---|
| Account | "Find Leads from an Account" / "Get leads by analyzing followers or following from specific Instagram accounts." Tip "You can enter multiple accounts to process them in bulk." | "Instagram accounts" textarea ("Enter usernames or Instagram account links, one per line"), "Collect leads that are:" Followers or Following | `scraping-tasks/account {accounts, amount, collectType:"followers"|"following", additionalInfo, filters}` |
| Post | "Find Leads from Posts" / "Extract leads from post likes or comments." Tip "For best results, use direct links to specific Instagram posts." | "Instagram posts" ("Enter post URLs, one per line"); the only collect option in the UI is "Collect leads from likes" | `scraping-tasks/post {posts, amount, additionalInfo, filters}` |
| Hashtag | "Find Leads from Hashtags" / "Discover leads from posts using specific hashtags." Tip "Use targeted, niche hashtags for better results." | "Hashtags" ("Enter hashtags, one per line (with or without the # symbol)") | `scraping-tasks/hashtag {hashtags, ...}` |
| Keyword | "Find Leads from Keywords" / "Discover leads based on keywords in their profiles or posts." Tip "The system will search for these keywords in users' bios, posts, and captions. Use specific industry terms or interests for targeted leads." | "Keywords" ("Enter keywords, one per line"). Tour sample: marketing, entrepreneur, startup, business coach, digital nomad | `scraping-tasks/keyword {keywords, ...}` |
| Mentions | "Find Leads from Mentions" / "Collect leads that are mentioned in posts or comments." Tip "This tool scans posts from the accounts you specify and collects all users who were mentioned. Great for finding collaborations and industry connections." | "Source accounts" ("Enter accounts to scan for mentions, one per line") | `scraping-tasks/mentions {accounts, ...}` |

Common limits (all five forms):

- "Number of leads to collect:" slider and number box, min 100, max 10,000, step 100, default 1,000.
- Maximum 40 source lines per search (`ts=40`): counter "n / 40 accounts" and error "n / 40 accounts - remove k to run this search".
- Note: "We'll scrape the requested number of leads and then apply any filters you select. The final number of leads may be lower depending on how strict your filters are."
- A finished task must be handled before a new one: "Create List Required" / "Please create a list with the leads before starting a new task." (hashtag tasks: "Download Required" / "Please download the results before starting a new task."). Expired results can be skipped: "We couldn't retrieve the results for this task - they may have expired. You can skip it and start a new search."

Post comments: the copy says "post likes or comments" but the only toggle string present is "Collect leads from likes" and the payload has no collect type field for posts, so commenter scraping does not appear to be live.

Second step, filters (`AdditionalInfoComponent`): "Add filters for better results". "Filters:" list, "No filters set.", button "Add", help line "Not sure what information you need? Text us and we'll help for free." (Telegram, WhatsApp, Email).

| Filter type (value) | Label | Inputs | Sent as |
|---|---|---|---|
| `followersCount` | Number of followers | Min, Max (at least one: "Please enter at least one value") | `{type, minValue?, maxValue?}` |
| `followingCount` | Number of following | Min, Max | `{type, minValue?, maxValue?}` |
| `lastPostBefore` | Last post uploaded before | Date ("Please select a date") | `{type, value:"<days between today and the date>"}`; displayed as "Last post: N days ago or more" |
| `bioKeywords` | Keywords in bio | keywords one per line; toggle "Include keywords" ("When ON: Include profiles with these keywords (whitelist) / When OFF: Exclude profiles with these keywords (blacklist)"); toggle "Exact match" ("When ON: Match exact keywords only / When OFF: Also match similar words") | `{type, keywords:[...], isWhitelist, isExactMatch}` |

Each filter type can be added once. Tour defaults: followers 1,000 to 20,000 and bio keywords "growth, entrepreneur, business" (whitelist, exact).

`additionalInfo`: the component defines a list of optional data fields (Followers, Following, Country, City, Address, Description, Number of posts, Name, Telephone) but the submit code sets every one to `false` and there is no visible checkbox for them, so no extra enrichment fields can currently be requested from the UI. No per lead price or credit cost appears anywhere in the bundle.

Task lifecycle and statuses:

- `scrapeStatus`: `pending`, `queue`, `in progress`, `completed`, `failed`, `cancelled`.
- `filterStatus`: `pending`, `queue`, `in progress`, `completed`, `failed`, `cancelled`.
- Phase badges: Queued, Scraping, Filtering, Ready, Downloaded, Failed, Cancelled, Unknown.
- Progress copy: "Initializing scrape process...", "Queued with the search provider - usually starts within the hour", "Collecting leads...", "Scraping completed!", "Scrape process failed", "Scrape process cancelled", "Initializing filter process...", "Task queued - waiting to begin filtering...", "Filtering and collecting additional data...", "Filtering completed!", "Filter process failed", "Filter process cancelled".
- Queue notes: "Waiting for the search provider to start - usually under an hour"; after 3 hours queued: "Still queued after N hours - our team has been alerted, no need to resubmit". "Filtering failed - your collected leads are still here". "Filtering was cancelled".
- Progress panel: "Lead processing:", "Collected leads:", "Data last updated:", "Estimated time:" (default 60 minutes), "Filters applied:". Cancel: "Are you sure you want to cancel this task?" / "Cancelling this task will stop all progress. This action cannot be undone."
- "search provider" wording shows scraping is done by a third party service on the server side, not by the user's own Instagram account or extension. (The extension does have a `parsing` task, "Collecting targets for @x", used for lists whose source is an account followers or following; see 5.2.)

Completion (`TaskCompletionComponent`): "Results summary:" with Collected, After filtering, Filtered out (percentage), Duration, Status. "Download as CSV" (`scraping-tasks/download {taskId, format:"csv"}`, file `leads-{taskId}.csv`). "Create list with scraped leads:" then "Name your new list with scraped leads" and "Create list". The CSV is parsed in the browser and the `login` / `username` column is pushed to `targets/add` with `source:{type:"parser"}`. Then "Attach to campaign" (dropdown of campaigns; errors "Can't attach to NAME - its sequence still needs X." / "its message sequence blocks the change.") or "Create a campaign for it". Warning: "This list isn't attached to any campaign yet - nothing will message it." Empty result: "No leads found:" / "The scraping process completed but no leads were found that match your criteria." / "You can start a new task with different parameters to try again."

Verification (called "enrichment" in the API): after a list is created the leads are verified in the background. States on a list (`enrichment_status`): `idle`, `in_progress` ("Verifying…", "Verifying X of Y…"), `completed` ("Verified"), `partial` ("Partially verified - n failed"), `failed` ("Verification failed"), `cancelled` ("Verification cancelled"). Actions "Retry" ("Retrying n profiles…") and "Cancel". "List creation will be available once lead verification finishes." Rows in the targets table show "N followers" or "no profile data" and a "Not verified" marker. An upgrade prompt path to `/subscription-plans` exists in this component. What exactly verification checks (existence, private, follower count) and any quota are server side.

### 5.2 Lists (`ListsPage`, `ListsComponent`, `listRunway`)

Page "Targets". Header counts "N lists · N targets", chip "N nearly exhausted", button "New list".

Table columns: List, Source, Progress (finished / total), Targets, Remaining, Runway, Used by. Counters come from `targets_total`, `targets_finished`, `targets_blocked`, `targets_remaining`.

List sources (`source` field): `followers` (followers of an account), `following`, `likes`, `list` (uploaded or pasted), plus label "Imported". A list created inside a campaign carries `is_campaign:true` and is tagged "(Campaign)". `lists/create` accepts a `username` field, which is how a follower or following sourced list is tied to an Instagram account.

Source list tooltips:

- "ColdDMs will automatically add new targets to the list. You can do it manually too."
- "We received an unknown error while attempting to scrape this account. Try another account or contact support."
- "Instagram limits the amount of users we can get for this account. That is why our service will get new targets very slowly. We recommend you add another user as the source of targets. Contact support, if you need help."

Runway (`listRunway`): tooltip "Estimated days until this list runs out of targets, at the combined daily rate of the campaigns using it (each enabled campaign's active accounts × its messages-per-day cap). Red at 3 days or less, amber at 7." Values "~N days", "Exhausted", or "not sending" with tooltip "The campaigns using this list aren't sending right now - paused, stopped, or without an active account - so there's no daily rate to project from. Runway appears once one of them starts sending." Unused lists read "Not attached to any campaign".

List actions: Add targets, Refresh, Download CSV (`targets/download`), Delete list ("Are you sure? This action cannot be undone"), enable or disable (`lists/edit {enabled}`).

### 5.3 Creating a list and importing (`CreateList`, `AddTargets`, `FileUpload` / `CsvColumnMapping`)

"Create new list": "List name" (min 1 character), input mode toggle Raw / CSV / JSON.

- Raw: textarea "One username per line".
- CSV: "Upload .csv file". Opens "Map CSV columns" dialog: "Choose the username column. Every other column becomes a custom placeholder you can use in messages as {{custom.key}}". The username column is auto guessed from a header matching `/user/i`. "Custom fields": each other column gets a key derived from its header (lower case, non alphanumerics to `_`, fallback `column_N`), can be renamed or unchecked. Errors: "Key required", "a-z, 0-9, _ only", "Duplicate key", "Two or more columns map to the same key: X. Rename or uncheck one.", "Up to 30 custom fields per list - please uncheck N." (`st=30`). "No custom fields - importing usernames only." Buttons "Clear all", "Include all", "Import". Parser is PapaParse.
- JSON: "Upload .json file"; must be an array ("File should have an array", "Incorrect array"); for arrays of objects a dialog asks "Choose the property in JSON with Instagram username".

Username validation regex (both create and add): `^[\w](?!.*?\.{2})[\w.]{1,28}[\w]$` (3 to 30 characters, letters, digits, underscore, dot, no double dots, no leading or trailing dot). Messages: "Usernames are incorrect" / "All usernames are incorrect", "List is empty", "Some account names are incorrect. Other accounts will be added in background", "Accounts will be added in background".

Limits: "Maximum 100k usernames" per add operation; uploads are chunked 10,000 targets per `targets/add` call.

Helper block under the form: "Don't have a list yet?" button "Find leads", "or text us - we'll help for free:" Telegram, WhatsApp, Email.

There is no documented fixed CSV template: any CSV with one username column works, extra columns become custom fields.

### 5.4 Targets table and dedupe (`TargetsTable` in `ListsComponent`)

Per target status badge:

| Condition | Badge | Detail |
|---|---|---|
| `blocked` with `error_reason` | "Failed - (reason)" | Reason map: `user_search_error` and `search_user_click_error` = "account not found"; `user_is_unreachable` = "account unreachable"; `banned_error` = "account restricted"; `auth_error` = "account logged out" |
| `finished` and has `conversation_id` | "Messaged · replied ✓" | |
| `finished` | "Messaged" | |
| `messaged_by === "elsewhere"` | "Messaged elsewhere" | "Another campaign or account of yours has already messaged this person. This campaign can still message them from an account that hasn't." |
| otherwise | "Not messaged" | |

Dedupe rule visible in copy: the system tracks whether any of the user's campaigns or accounts already messaged a username; the same sender account will not message the person again, but a different account still can. Within list dedupe, and whether duplicates across lists count once, are server side.

Search box "Search targets…", pagination 20 per page, "N of M targets".

---

## 6. Inbox, CRM and reporting

### 6.1 Unified Inbox (`UnifiedInboxPage`, `relativeTime` conversations client)

Title "Inbox". Views "Unread" and "All" with counts. Search "Search conversations..." (matches target username, campaign name, sender account username, message text, client side over loaded data). Filter chips: Campaign, Account, Tag (includes "Untagged"). Conversations load 50 per page with a cursor; updates are polled every 30 seconds (`conversations/get-updates {since}`).

Conversation row: target username, "via @account", campaign, "replied in X", tag. Message origin labels: "First DM", "Follow-up N", "Manual", with " · variation N" (so the inbox shows which variant produced the reply).

Thread pane: "Open on Instagram" (`https://instagram.com/{username}`), tag selector, CRM stage chip ("CRM: Column" with "Moved to X"; or "Not on the CRM board yet - the card appears there automatically after this lead's first reply."), messages with status (Processing, Sending, Sent, Failed). Reply box placeholder "Reply as @account…", max length 1000 characters, Enter sends, Shift + Enter for a new line. Replies are text only and are queued via `conversations/send {target_username, sender_username, message}`; the extension delivers them (status "Processing" until then).

"New Message" form: Campaign, "Send from Account", "Send to Username", message text. This allows a manual DM to an arbitrary username from a connected account.

Quick replies ("Preset Messages"): 6 slots, stored only in the browser (`localStorage` key `presetMessages`), opened from the lightning icon. Shortcuts shown in the dialog: "macOS: ⌥ ⌘ + 1-6", "Windows: Alt + Ctrl + 1-6". Empty state "No quick replies set" / "Click below to add some quick replies".

Tags (`tags/*`): create with a name and one of 8 colours (`#1976d2`, `#388e3c`, `#f57c00`, `#d32f2f`, `#7b1fa2`, `#0097a7`, `#fbc02d`, `#455a64`), one tag per conversation (`conversations/set-tag`), search, remove. There are no built in tag types; tags are free form.

Info modal, verbatim: "Welcome to Unified Inbox (Beta)" / "Important information about this beta feature:"

- "This is a beta feature. Conversations might be deleted from our database (but will remain on Instagram)"
- "Only recent conversations are collected for now. You can only filter through collected data i.e. old campaigns won't be available"
- "You can search through target username, sender username, campaign name and chat messages using the search box"
- "You can filter through campaigns, accounts and tags using the chips under the search box"
- "Quick replies available via the lightning icon next to the message box"
- "You can open this information modal by clicking on the information icon at the top of the page or next to the message box"
- "Keyboard shortcuts" / "Quick replies: macOS: ⌥ ⌘ + 1-5, Windows: Alt + Ctrl + 1-5" / "Navigate between chats: macOS: Ctrl + ⌥ + ←/→, Windows: Ctrl + Alt + ←/→" / "Enter: Send message (Shift + Enter for new line)"
- "Questions or feedback? We're here to help!"

(The info modal says 1-5 while the preset dialog says 1-6; there are 6 slots in code.)

### 6.2 Pipeline (`PipelinePage`)

"Pipeline" / "Board moves leads through stages; Table filters, reports, and exports. Both show the same conversations - pick whichever fits what you're doing." Tabs Board and Table.

Board (`CRMPage`, `crm/*`): Kanban of columns containing cards (one card per replied task). A card appears automatically after a lead's first reply. Column actions: "Add column", rename ("Edit the name", "Enter valid name"), move left or right, delete ("Do you want to move items from this column to another? Otherwise all items will be deleted." / "Are you sure? You will lose all items from this column"). Card actions: drag and drop, "Move to the left column", "Move to the right column", "Move on the top of the column", "Move to...", "Toggle important" (flag "Important"), "Open conversation" (`/inbox?conversation=`), notes. Card detail dialog fields: "First message date:", "Response date:", "Column:", "Sent from:", "Campaign:", "First message:", "Reply:", "Note:" (textarea, Save) and "Timeline" (the message chain from `tasks/get-chain`). Card footer "Replied X ago".

Default column names are not in the bundle (they come from `crm/get`).

Table (`MessagesPage`, `tasks/*`): columns Sent To, Sent From, Campaign, Type ("First message" or "Follow-up"), Result, Task Date, Actions. Result values: "Failed", "Sent", "Sent · replied within X", "Replied". Filters: Campaign, "Sent from", "Sent to" (username search), "Message state" (With reply / No reply / Any), "Message type" (Follow ups / First messages / Any), "Status" (Success / Error / All), date range. Actions: "Show Message", "Show Reply", "Timeline", "Check", "Open conversation", stop follow up. "Export" downloads a CSV (`tasks/download`). Failed rows show the extension error text (see section 7.4) and a note like "2nd hit today - repeated errors pause the account".

### 6.3 Metrics shown

- Dashboard: sent today, replies today, reply rate today, reply rate all time, "N of M campaigns active", unread conversations, recent replies (latest tasks with a response).
- Campaign: Messages Sent, Replies, Reply Rate; per step sent, replies, reply rate; per variant Sent, Replies, Reply rate with best or weakest verdict.
- Campaign stats shape: `stats.messages_sent.{today,all}`, `stats.responses.{today,all}`; totals are `today + all`.
- User summary (`users/summary`): `accounts.{count, unique_usernames}`, `campaigns.{count, active}`, `messages.{today,total}`, `targets.total`, `last_message`.
- No open or seen tracking, no positive reply classification, no booked call metric. A "reply" is any response detected by the extension's `check_response` task.

### 6.4 Dashboard "Needs you" card (`IndexPage`)

Rows, in priority order:

- Offline profiles: "N Chrome profile(s) is/are offline - nothing can send" with "The extension last ran in X ago." or "The extension has never run in this profile." and "Every campaign is on hold until one returns." Action "Reconnect a profile".
- Stopped account: "@user stopped - (reason)" / "“Campaign” is on hold until this account is fixed." or "Sign back in on the Accounts page to resume." Action "Review account".
- "“Name” lost its Instagram account" / "Was sending before - N sent, N replies. Reassign an account to resume."
- "“Name” is out of targets" / "... Attach a fresh list to keep it going."
- "“Name” can't send - (reason)" / "Sending is on hold until an assigned account is healthy again."
- "“Name” never finished setup" / "N campaigns never finished setup" with "Review drafts".
- Explainer when nothing sent today: "Nothing has sent today - the first row is why." Clear state: "Nothing needs you" / "N of M campaigns active - nothing to fix right now."

---

## 7. Accounts, Chrome profiles, statuses

### 7.1 Model

- An "instance" is one installation of the extension in one Chrome profile (`instances/list`, `instances/edit {id, name, color}`). The UI calls it a "Chrome profile". Default names look like "Browser #N" and are shown as "Unnamed Chrome profile" until renamed.
- Each instance has at most one Instagram `account`. Multi account use means multiple Chrome profiles, each logged in to one Instagram account with the extension started, all kept open.
- An Instagram account belongs to one ColdDMs user and sends for one campaign at a time (`accounts/set-campaign`).
- The plan limits how many accounts actually send (`max_working_accounts`); extra connected accounts stay idle.
- No proxy, device fingerprint, user agent or mobile emulation settings exist. Sending happens in the user's real browser session on the user's own IP.

### 7.2 Accounts page (`BrowsersPage`)

Title "Accounts" / "Where your Instagram accounts are running". Summary "N working · N need attention · N offline". Toggle "Hide inactive Chrome profiles" with tooltip "Hide anything last online more than 2 days ago" (sent as `options.hide_old`). Healthy running profiles can be collapsed ("N more running normally - show"). Card: title `@username`, subtitle "In Chrome profile "NAME"" or "In an unnamed Chrome profile" or "No account signed in yet", coloured stripe, menu "Rename" ("A name that helps you tell this Chrome profile from the others.") and "Change colour" (13 palette colours). Tag "This Chrome profile" marks the one the page is open in. Empty: "No accounts connected yet" / "Install the extension and sign in to Instagram - your account appears here automatically." Errors: "Couldn't reach the server, so we can't show your accounts." / "Couldn't refresh just now - showing the last update from X".

### 7.3 Device status values (`deviceStatus`, enum `D`)

Evaluated in this order:

| State | Label | When | Detail and remedy |
|---|---|---|---|
| `stopped` | Stopped (red) | `account.stopped_event.reason` is set | "Stopped X ago - (reason from server)". "How to reconnect:" "Log in to Instagram in this profile, then press Start in the extension." |
| `warning` | Needs attention (amber) | `account.status.additional_text` is set | Server text. "Sending resumes on its own when the pause ends. If this keeps happening:" + reconnect steps |
| `warning` | Needs attention (amber) | `account.account_status.state` is not `healthy` | `temporarily_paused` = "Paused by Instagram limits" ("Sending resumes on its own when the pause ends. If this keeps happening:"); `attention_required` = "Instagram wants a check on this account" ("This one needs you. To fix it:"); any other state is shown with underscores replaced by spaces |
| `offline` | Offline (grey) | `instance.online` is false | "The extension isn't running in this Chrome profile - last seen X" or "This Chrome profile has never connected" |
| `working` | Working (green) | `status.is_in_process` | "Sending a DM to @x", "Sending a follow-up to @x", "Checking for a reply from @x", "Collecting targets for @x", "Running task: X", each with " · n/limit today" |
| `waiting` | Waiting (green) | `status.task === "wait"` | "Next message in X", "Ready to send the next message", "Waiting for its next task" |
| `simulated_online` | Simulated online (purple) | dev simulated instance | "Development only - no Instagram actions will be sent" |
| `idle` | Idle (grey) | connected, nothing scheduled | "No task scheduled" / "No activity reported" |
| `not_connected` | Not connected (grey) | instance without account | "No account is signed in to this Chrome profile yet" |

Account health enum (`accountHealth`): `account_status.state` values seen are `healthy`, `temporarily_paused`, `attention_required`. An account "can send" when the state is healthy (or absent) and there is no `stopped_event.reason`.

Extension task names: `send_message`, `send_next_message`, `check_response`, `parsing`, `wait`. Account fields used: `messages_today`, `messages_limit`, `status.next_date`, `status.target`.

### 7.4 Extension error codes (`errorCopy`)

| Code | Text |
|---|---|
| `tab_open_error` | "The extension couldn't open an Instagram tab." |
| `banned_error` | "Instagram is blocking this account from messaging - it may be temporarily restricted." |
| `open_direct_page_error` | "Instagram's Direct inbox didn't load." |
| `open_search_popup_error` | "Instagram's search window didn't open." |
| `user_search_error` | "Couldn't find this person in Instagram's search." |
| `user_click_error` | "Instagram's DM button wasn't where the bot expected." |
| `entering_message_error` | "The message couldn't be typed into the chat box." |
| `check_message_error` | "Couldn't confirm the message was actually sent." |
| `check_response_from_react_api_error` | "Couldn't read the conversation to check for a reply." |
| `check_response_error` | "Couldn't check the conversation for a reply." |
| `open_search_menu_error` | "Instagram's search menu didn't open." |
| `search_user_click_error` | "Couldn't select this person from Instagram's search results." |
| `open_followers_popup_error` | "The followers list didn't open." |
| `parsing_error` | "Collecting profiles from Instagram failed part-way." |
| `close_modal_error` | "A leftover Instagram popup got in the way." |
| `user_is_unreachable` | "This person can't receive DMs - their account may be private, deactivated, or blocking messages." |
| `instagram_reload_error` | "Instagram didn't finish reloading." |
| `additional_tab_error` | "Another Instagram tab interfered." |
| `auth_error` | "The account was logged out of Instagram - sign in again in its Chrome profile." |
| other | "The extension hit an unexpected error (code)." |

Repeat rule shown to users: "2nd (3rd, ...) hit today - repeated errors pause the account". The threshold that triggers the pause is server side.

These codes describe how the extension works: it opens an Instagram web tab, opens Direct, opens the search popup, searches the username, clicks the result, types the message into the chat box, verifies it was sent, and later re-reads the conversation for replies. It drives the normal Instagram web UI rather than a private API (inferred from the error names).

---

## 8. Plans, billing, legal

### 8.1 Plans (`SubscriptionPage`, `BillingSection`, `MainLayout`)

Plan enum (`account_type_calculated`): `free`, `pro`, `scale`, `unlimited`. Header badges: FREE (only when the trial is already used), TRIAL (pro with `payment.is_trial`), PRO, SCALE, UNLIMITED.

| Plan | Price | Accounts | Feature bullets on the card |
|---|---|---|---|
| Trial | 3 days free | same as Pro (1), trial can also be on Scale | Started from the dashboard button "Start 3 Day Free Trial" |
| Pro | $99 per month | "1 Instagram account" | "Support 24/7", "Safe algorithms", "Unlimited messages" |
| Scale | tiered, see below | "Up to 33 accounts" (slider 2 to 33) | "Support 24/7", "Safe algorithms", "Unlimited messages", "Multiple accounts" |
| Unlimited | $999 per month | "Unlimited accounts" | "Support 24/7", "Safe algorithms", "Unlimited messages", "Premium support" |

"Unlimited messages" means the plan does not meter message volume; the per account daily behaviour is governed by the campaign cap and warmup.

Scale pricing table in code (`scalePrices`, marginal price per account position):

| Account position | Price for that account |
|---|---|
| 1st | $99 |
| 2nd | $75 |
| 3rd | $55 |
| 4th | $38 |
| 5th | $33 |
| 6th to 29th | $25 each |
| 30th to 39th | $20 each |
| 40th to 50th | $15 each (table goes to 50 but the slider stops at 33) |

Resulting monthly totals: 2 accounts $174, 3 $229, 4 $267, 5 $300, 6 $325, 10 $425, 15 $550, 20 $675, 25 $800, 29 $900, 30 $920, 33 $980. A red badge shows the saving against N × $99 (for example 10 accounts is 57% off, 33 accounts is 70% off).

"FITS YOUR USAGE" chip logic: 1 connected account suggests Pro, 2 to 33 Scale, more than 33 Unlimited.

Upgrade flow: free users go to hosted checkout (`payments/get-payment {type, count}` returns a URL). Existing subscribers get a proration dialog: "We will charge you a part of the Scale (or Unlimited) tier's price based on how much time is left in your current month." (`payments/check-upgrade-plan` returns `total` in cents, then `payments/upgrade-plan`). Toasts "It may take some time to finish payment process.", "Successfully upgraded to unlimited plan.", "Error. Contact support." Buttons "Keep Pro after trial", "Keep Scale after trial". Billing portal via `payments/enter-portal` ("Download invoices"). The payment processor is not named in the bundle.

Settings, Billing (`BillingSection`): "ColdDMs PLAN · N accounts", rows Plan, Accounts ("Instagram accounts your plan allows."), "Paid until" (date or "No active subscription."), "Manage your subscription" / "Change your plan, download invoices or cancel." Free: "You are on the free plan." link "See available plans".

### 8.2 Refund and guarantee

- Trial dialog guarantee: "We also guarantee you sign at least one client in the first 30 days or refund you completely (send min. 1k messages in the month)".
- Terms of Service: "The subscription fees are fully earned upon payment and are not subject to any refund, credit or offset, pro-rata or otherwise, upon cancellation."

So the only refund route is the 30 day one client guarantee, conditional on at least 1,000 messages sent in the month; the terms themselves say no refunds.

### 8.3 Cancellation flow (`ManageSubscriptionModal`)

"Manage subscription" / "What would you like to do?" with "Download invoices" and "Cancel subscription". Then "We're sorry to see you go" / "Why do you want to cancel?" with retention offers per reason:

| Reason (code) | Offer headline | Offer text |
|---|---|---|
| "I don't have leads to send to" (`no_leads`) | "We'll find leads for you!" | "We have a built-in scraper that will find you your ideal customers and load them into your campaign automatically! Just click 'Find Leads' below!" or, if unused lists exist, "Actually - you already have N list(s) with N leads that no campaign is messaging. Attach it and they start going out." |
| "I'm not getting results" (`no_results`) | "We'll help you get better results" | "We'll help improve your offer for free to get better results" |
| "Confused/can't setup" (`confusing`) | "Let us help you get set up" | "Text us! We will help you 1 on 1 for free" |
| "Tool is missing features" (`missing_features`) | "Let's add what you need" | "Let's chat - we're keen to add any features our users need" |
| "Problems with IG account" (`account_problems`) | "We'll help fix your account" | "N of your M accounts can't send right now - most fixes take a minute." or "Text us - we will help fix it ASAP" |
| "I need an IG account" (`need_account`) | "We can get you an account" | "We have suppliers. Text us and we'll connect you at discounted rates" |
| "Too expensive" (`too_expensive`) | "Let's make a deal" | "Want a discount? We'll make a deal. Text us" |
| "Other" (`other`) | "We'd love to help" | "Please let us know more about your situation" (free text required) |

Also "Or maybe watching our tutorial could help?" with the video. Buttons "Keep my subscription", "Still want to cancel", "Cancel anyway". Each step sends an internal ops event (`ops/client-event`, kind `churn_survey`) containing the user email, plan, paid until, trial flag and usage summary.

### 8.4 Settings

- Profile (`ProfileSection`): Name (max 200), Email (read only, "Unconfirmed" badge), Timezone (searchable list of IANA zones with offset; tooltip "Working-hours windows evaluate in this timezone, campaigns send only when it's inside their window here.").
- Email banner: "Email is not confirmed" / "You won't get reply or paused-account alerts until it is." button "Confirm email", then "Check your email for the verification link". So email alerts exist for replies and for paused accounts.
- Security: "Change password" with Current password, New password, Confirm new password. Errors "The two passwords do not match.", "The new password must be different from the current one." No 2FA and no API key section.
- Danger zone: "Delete account" / "Stops all sending immediately and closes your account." Confirm text "Your access ends immediately and cannot be restored. Your data is kept, and any active subscription is cancelled straight away."

Note "Your data is kept" on account deletion.

### 8.5 Terms of Service, risk relevant clauses (`TermsOfServicePage`, verbatim)

- Subscriptions: "The subscription period is monthly. After the first month, the subscription will continue on a monthly basis until the subscription is cancelled by you or us. It can be cancelled at any given moment and can be renewed immediately after."
- Authorisation: "If you use the product as a private person, you are required and you declare to be at least 18 years old and have legal capacity to enter the into this contract."
- Fees: "ColdDMs may change the amount of the subscription fee at any time. You will be informed in advance of a price change, and you will be given the choice to cancel your subscription or continue using the product with the new price of the subscription."
- Use of the product: "We highly suggest you read the terms and privacy policy of Instagram and act in accordance with these terms. You may use the product, as long as you comply with these Terms of Service, the law and the terms of service of Instagram. Insofar as not specified therein, you may not post any content that, inter alia: infringes on the rights of any third party; is offensive, threatening, unlawful, deceptive, inaccurate, or harmful; includes personal or confidential information belonging to others; includes spam; targets minors; impersonates or misrepresents your affiliation with another person or entity. We reserve the right to suspend or terminate subscriptions or block users that violate these Terms of Service, the law or the terms of service of Instagram."
- Disclaimer: "ColdDMs is not affiliated with Instagram or Meta in any way. Instagram may block or restrict your Instagram profile based on activities you do with or without ColdDMs. ColdDMs has no control over, and assumes no responsibility for, this. ColdDMs disclaims all warranties and conditions of merchantability, fitness for a particular purpose, or non-infringement. By signing up for ColdDMs and linking your Instagram account you acknowledge this risk and therefore ColdDMs is not responsible or accountable for any blocks or restrictions. The use of ColdDMs is therefore solely a risk taken by the user. ColdDMs is the safest tool and can be used from all parts of the world at any time. However, ColdDMs does not take responsibility for the product being interrupted or unavailable at times. ColdDMs will inform its users in case of maintenance of the website and/or the product unless it is an emergency."
- Limitation of liability: "Your only remedy with respect to any breach by us of any term in these Terms of Service, our privacy policy, violation of any right or law, or dissatisfaction with the product, is to terminate your subscription and discontinue using the product."
- Indemnification: the user indemnifies ColdDMs for claims "related to your actions, information, content or any other use of our product by you".
- Governing law: "the laws of the US".

Contradiction worth noting: the terms require compliance with Instagram's terms of service and forbid "spam", while the product automates cold DMs through the Instagram web UI, which Instagram's own terms prohibit. All block and ban risk is placed on the user.

### 8.6 Privacy Policy (`PrivacyPolicyPage`)

Generic template text. Sections: Introduction, Consent, Information we collect (name, company name, address, email, phone on registration or contact), How we use your information (operate, improve, analyse, develop, communicate including marketing, send emails, prevent fraud), Log Files (IP, browser type, ISP, timestamps, referring pages), Cookies and Web Beacons, Advertising Partners Privacy Policies, Third Party Privacy Policies, CCPA Privacy Rights, GDPR Data Protection Rights (access, rectification, erasure, restrict, object, portability; one month to respond), Children's Information (no knowing collection under 13).

Gaps: the policy says nothing about Instagram data. It does not mention the Instagram usernames in lists, scraped profile data, the content of DMs and replies stored in the inbox, profile photos uploaded in Account Setup, the extension's access to the logged in Instagram session, data retention, sub processors or the scraping provider.

---

## 11. Dev and internal features visible in the bundle

| Feature | Evidence | What it reveals |
|---|---|---|
| Account simulator | `BrowsersPage`: `dev/account-simulator/create`, `start`, `stop`, `reset`, `delete`; gate `dev_capabilities.account_simulator` | Panel "Development testing": "Connect a simulated account to test setup, warmup, campaigns, and interface behavior. No Instagram actions will be sent." Buttons "Create simulated account", "Simulate online", "Stop simulation", "Reset test account", "Delete test account" ("This permanently removes the simulated browser and account. This can't be undone."). Simulated instances have `is_dev_simulated`, status `simulated_online`, setup ids starting `dev-sim-`, tags "Development simulation" / "Simulated account". Shows that setup, warmup and campaign flows are still being developed and tested by staff inside production. |
| Setup review queue | `SetupReviewsPage`, capability `account_setup_review` | Staff moderation tool for customer profiles (section 4.2). Confirms a human review step with internal notes hidden from customers. |
| Disable limit / no delay | `CampaignPage`, `CampaignForm`: `store.options.testing.disable_messages_limit.enabled`, `campaign.options.no_delay` | A testing flag exposes a "Disable limit" toggle that sets `options.no_delay`. Confirms the backend normally enforces both a daily cap and delays between sends, and that both can be switched off for internal accounts. |
| Ops events | `OpsEvents`: `ops/client-event {kind, message}` | Client pushes internal alerts: `churn_survey` (cancel flow with user email and usage) and `find_leads_error` ("List Creation Failed from Parser Task" with user email, id, plan, task context). Likely piped to a team chat. |
| Feature flags | `index.js` user store: `features`, `capabilities`, `dev_capabilities`, `options` | Workflows, Account Setup, Account Warmup, Workflow Campaigns are flagged per user. |
| Coming soon blocks | `blocks`: `condition` "Branch based on a condition" = "Coming soon"; `WorkflowCampaignBuilderPage`: `{{enrich.*}}` and `{{ai.*}}` "isn't supported yet." | Roadmap: conditional branching, enrichment variables, AI generated variables. |
| Host type abstraction | `deviceStatus`: map `I={extension:{noun:"Chrome profile",...}}` keyed by `instance.host_type` | The instance model allows host types other than the extension (for example a cloud or desktop runner) but only `extension` is defined today. |
| Client header | `index.js`: `headers:{client:"4092eff6498563d78beabc088c3690d3"}` | Static client id sent with every API call; auth is cookie based (`credentials:"include"`). |
| Debug logging | `FindLeadsPage`: console logs "=== SUBMIT FUNCTION CALLED ===", "Parser Response Debug:", "List Creation Error - Full Debug Log:" | Find Leads list creation is a known fragile area. |
| Tracking | `NewCampaignPage`: Google Ads conversion `AW-16645432847/X5beCMCdsMgZEI_MlIE-` on trial start; Cloudflare Turnstile on auth forms | |
| Internal naming | Scraping tasks are "parser tasks" (`parser_task`, `source:{type:"parser"}`); lead verification is "enrichment"; a send is a "task"; a Chrome profile is an "instance"; working accounts limit is `max_working_accounts`; user has a `ban` object | Useful vocabulary when reading API responses. |
