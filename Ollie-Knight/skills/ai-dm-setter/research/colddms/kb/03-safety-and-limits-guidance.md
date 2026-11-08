# ColdDMs safety guidance, limits and defaults

Source: static read of the web app bundle in `research/colddms/source/webapp/`. No API calls, no login. File names are given without their hash. Quoted copy is verbatim, except that long dashes in the source are written as a spaced hyphen (" - ").

Headline finding: the web app contains very little written safety advice. The whole "safety system" visible to a user is (a) a recommended ceiling of 50 messages per account per day, (b) message variations, (c) sending spread randomly inside a working hours window, (d) keeping one real Chrome profile per account open, and (e) the newer, feature flagged Account Setup and Account Warmup flow with a ramping daily cap. Everything else (delays between sends, ramp numbers, pause thresholds) is enforced silently by the backend and the extension.

---

## A. Every piece of safety or deliverability advice, verbatim

### A1. Daily message volume

| Where | Verbatim copy | Evidence |
|---|---|---|
| Get started, step 3 | "Set **messages per day** (we recommend **50 or less** per account)" | `setupSteps` |
| Campaign form, under the slider when max ≤ 50 | "✓ within the safe range (≤50)" | `CustomStepper` (`CampaignForm`), also `WorkflowCampaignBuilderPage` |
| Campaign form, red banner when max > 50 | "We don't recommend sending more than 50 messages per day" with button "I understand" | `CustomStepper`, `WorkflowCampaignBuilderPage` |
| Campaign form caption | "The number of messages sent by each Instagram account daily." | `CustomStepper` |
| Workflow overview | "Actual sending may be lower when Account Warmup or other account limits apply." | `WorkflowCampaignBuilderPage` |
| Warmup, sending limits | "The most DMs this account can safely send today, per its current warmup ramp." | `AccountWarmupPage` (`DmRampPanel`) |
| Warmup, sending limits | "The configured maximum this account's ramp will ever reach." | `AccountWarmupPage` |
| Warmup, sending limits | "Today's safe range: up to N DMs" | `warmupDisplay` |
| Campaign status | "Every assigned account has reached its daily message cap." | `campaignOperationalStatus` |

Notes:

- The slider allows 0 to 100 per account per day. Above 50 only triggers a dismissible warning; it does not block.
- Default for a new campaign is a range of 35 to 45 per day, which sits under the recommended ceiling.
- The limit is per Instagram account, not per campaign or per user. Plan cards advertise "Unlimited messages".
- The refund guarantee requires "send min. 1k messages in the month", which at 35 to 45 per day needs roughly 23 to 29 sending days on one account, or more than one account.

### A2. Message variations

| Where | Verbatim copy | Evidence |
|---|---|---|
| Get started, step 3 | "Create **message templates with variations**. Good variations are important for account health!" | `setupSteps` |
| Get started, step 3 tip | "Using variations helps improve response rates and keeps your account safe." | `setupSteps` |
| Sequence step chip | "1 variation - add more for safety" | `CustomStepper` |
| Editor error | "At least five messages at a sequence are required" (cannot delete below 5 variants) | `CustomStepper` |
| Editor error | "Only 10 variants are allowed" | `CustomStepper` |

Notes:

- The classic editor forces 5 to 10 variants on every step (first message and each follow up) and every variant must be filled in. This is the single strongest safety control in the product.
- The workflow builder does not force 5; it starts with 1 variant and allows up to 10.
- No spintax. Variation is whole message variants only, plus personalisation variables.

### A3. Timing and schedule

| Where | Verbatim copy | Evidence |
|---|---|---|
| Campaign form | "We'll randomly send messages during these times - in your timezone (TZ)." | `CustomStepper` |
| Workflow settings | "We'll randomly send messages during these times." | `WorkflowCampaignBuilderPage` |
| Settings, timezone | "Working-hours windows evaluate in this timezone, campaigns send only when it's inside their window here." | `ProfileSection` |
| Campaign status | "Sending resumes at HH:00 in your timezone." | `campaignOperationalStatus` |

Notes: default window 08:00 to 22:00. There is no advice about weekends, time of day, or matching the prospect's timezone. Gaps between individual messages are not shown or configurable; an internal testing flag `no_delay` proves delays exist server side.

### A4. Follow ups

| Where | Verbatim copy | Evidence |
|---|---|---|
| Get started, step 3 | "Schedule **follow-up messages** if desired" | `setupSteps` |
| Workflow builder, system rule badge | "Remaining follow-ups stop automatically when this prospect replies. This isn't configurable per workflow - it's how ColdDMs sending always behaves." | `WorkflowCampaignBuilderPage` |
| Account move dialog | "In-flight follow-ups from "Campaign" still send - only new first messages stop." | `launchBlockedMessage` |

Up to 9 follow ups, 1 to 30 days apart (default 1 day; workflow builder default wait 2 days). No advice on how many follow ups are safe.

### A5. Browser, extension and device

| Where | Verbatim copy | Evidence |
|---|---|---|
| Get started, step 1 warning | "Your browser needs to stay open for automation to work." | `setupSteps` |
| Get started, step 4 | "Keep your computer **running and connected to the internet**" | `setupSteps` |
| Extension page | "Get it from the Chrome Web Store, in the browser you'll keep open for sending." | `ExtensionPage` |
| Extension page | "Sign in to Instagram in that browser (click "save login info"), then click the extension icon and press START. Keep the browser open - that's what sends." | `ExtensionPage` |
| Extension page | "Keep this browser open. Sending stops when Chrome closes or the laptop sleeps - the dashboard strip will show the profile as offline." | `ExtensionPage` |
| Sign up page | "Sends from your own browser - no password shared" | `SignUpPage` |
| Troubleshooting | "Stop the extension", "Logout Instagram", "Login Instagram (click "save login info"!)", "Start the extension", "Refresh this page after 15-30 seconds" | `ExtensionPage` |
| Stopped or logged out account | "Log in to Instagram in this profile, then press Start in the extension." | `deviceStatus` |
| Logged out error | "The account was logged out of Instagram - sign in again in its Chrome profile." | `errorCopy` |
| Reply handling | "Switch to this account's Chrome profile to enter the conversation" | `ResponsesTable`, `MessagesPage` |
| Extension error | "Another Instagram tab interfered." | `errorCopy` |

Notes: the model is one Chrome profile per Instagram account, on the user's own machine and IP. Not one word about proxies, VPNs, antidetect browsers, mobile devices or IP hygiene anywhere in the bundle (searched: proxy, proxies, VPN, antidetect, Multilogin, AdsPower, Dolphin, GoLogin, aged; zero hits). The `additional_tab_error` implies the user should not use Instagram in another tab of the same profile while the extension is working.

### A6. Account preparation and warmup (feature flagged)

| Where | Verbatim copy | Evidence |
|---|---|---|
| Workflows page | "Get accounts ready, warm them up safely, and run campaigns -- all in one place." | `WorkflowsPage` |
| Account Setup | "Prepare a connected Instagram account before it starts Warmup." | `AccountSetupPage` |
| Account Setup photos | "Use authentic, varied photos. Avoid duplicate or generic-looking images." | `AccountSetupPage` |
| Account Setup photos | "Add between 9 and 12 original, account-specific photos." | `AccountSetupPage` |
| Setup review (staff) | "Review submitted Instagram account profiles before warmup begins." | `SetupReviewsPage` |
| Warmup | "One focused action at a time -- ColdDMs reveals the next step automatically." | `AccountWarmupPage` |
| Warmup gate | "Account Setup must be approved before warmup begins." | `AccountWarmupPage` |
| Warmup action | "Delete old posts" / "I've deleted this account's old posts on Instagram" | `AccountWarmupPage` |
| Warmup action | "Add new posts" / "How many posts did you add today?" (1 to 5) | `AccountWarmupPage` |
| Warmup waiting | "You're done for now. There is no next step to select. ColdDMs will reveal a new action automatically when the account is ready." | `AccountWarmupPage` |
| Warmup pause | "Warmup is paused because this account needs attention. It will resume automatically once the account is healthy again." | `warmupDisplay` |
| Warmup history labels | "Account setup approved", "First login confirmed", "Warmup step started", "Old posts deleted", "New posts added", "Daily message cap increased" | `AccountWarmupPage` |

What this tells users to do: give the account a real looking name (max 30 characters), a bio (max 150 characters) and 9 to 12 original photos; have the profile approved by a ColdDMs reviewer; delete the account's old posts; add new posts gradually (1 to 5 per day is the accepted input range); and let the daily DM cap ramp automatically from a low start to a ceiling. The start value, the ceiling, the number of days and the action instruction text are all server side.

The cancel survey offers to supply accounts ("We have suppliers. Text us and we'll connect you at discounted rates"), and the warmup starts with "Delete old posts", which together suggest the flow is designed for bought or repurposed accounts. There is no written guidance on account age.

### A7. Health states, pauses and what to do

| Where | Verbatim copy | Evidence |
|---|---|---|
| Account state `temporarily_paused` | "Paused by Instagram limits" + "Sending resumes on its own when the pause ends. If this keeps happening:" + "Log in to Instagram in this profile, then press Start in the extension." | `deviceStatus` |
| Account state `attention_required` | "Instagram wants a check on this account" + "This one needs you. To fix it:" + reconnect step | `deviceStatus` |
| Stopped account | "Stopped X ago - (reason)" + "How to reconnect:" | `deviceStatus` |
| Error `banned_error` | "Instagram is blocking this account from messaging - it may be temporarily restricted." | `errorCopy` |
| Repeated errors | "2nd hit today - repeated errors pause the account" (ordinal changes) | `errorCopy` |
| Unreachable prospect | "This person can't receive DMs - their account may be private, deactivated, or blocking messages." | `errorCopy` |
| Dashboard | "Sending is on hold until an assigned account is healthy again." | `IndexPage` |
| Email alerts | "You won't get reply or paused-account alerts until it is." (email confirmed) | `SettingsPage` |

Notes: the system auto pauses an account on Instagram limits and on repeated extension errors, and auto resumes after a pause ends. There is no advice text such as "rest the account for N days" or "reduce volume after a block". The pause durations and thresholds are server side.

### A8. Lead quality and list hygiene

| Where | Verbatim copy | Evidence |
|---|---|---|
| Get started, step 2 tip | "We recommend having at least 1000 targets for an effective campaign." | `setupSteps` |
| Campaign wizard, unverified list | "This list isn't fully validated yet. Some accounts may no longer exist, which can lower your response rate." | `NewCampaignPage` |
| Find Leads | "Use targeted, niche hashtags for better results." | `FindLeadsPage` |
| Find Leads | "For best results, use direct links to specific Instagram posts." | `FindLeadsPage` |
| Find Leads | "Use specific industry terms or interests for targeted leads." | `FindLeadsPage` |
| Find Leads | "We currently do not support verified accounts being scraped. If you target a verified account, a very limited number of leads will be collected from it." | `FindLeadsPage` |
| Follower sourced list | "Instagram limits the amount of users we can get for this account. That is why our service will get new targets very slowly. We recommend you add another user as the source of targets." | `ListsComponent` |
| Cross campaign dedupe | "Another campaign or account of yours has already messaged this person. This campaign can still message them from an account that hasn't." | `ListsComponent` |
| Placeholders | "Some prospects will get a blank" / "You can set a default value on the placeholder instead, so everyone gets something." | `PlaceholderWarnings` |

### A9. Message writing advice

There is none beyond "use variations". Specifically absent from the bundle (string searched): any guidance on message length, opening lines, links in the first message, emojis, questions, calls to action, images, voice notes, or spam trigger words. The only content rule is in the Terms of Service ("you may not post any content that ... includes spam; targets minors; impersonates or misrepresents your affiliation ..."). The reply box caps manual inbox replies at 1000 characters; no length limit is enforced in the campaign editor on the client.

Links: nothing blocks or warns about a URL in a message. Messages are plain text, so a link can be typed, and there is no tracking or shortening.

A tutorial video is embedded in several places (`https://www.youtube.com/embed/Yh8V_a01CVY`); its spoken content may contain more advice and was not analysed.

### A10. Legal risk statements (`TermsOfServicePage`)

- "ColdDMs is not affiliated with Instagram or Meta in any way. Instagram may block or restrict your Instagram profile based on activities you do with or without ColdDMs. ColdDMs has no control over, and assumes no responsibility for, this."
- "By signing up for ColdDMs and linking your Instagram account you acknowledge this risk and therefore ColdDMs is not responsible or accountable for any blocks or restrictions. The use of ColdDMs is therefore solely a risk taken by the user."
- "ColdDMs is the safest tool and can be used from all parts of the world at any time."
- "We highly suggest you read the terms and privacy policy of Instagram and act in accordance with these terms."
- "We reserve the right to suspend or terminate subscriptions or block users that violate these Terms of Service, the law or the terms of service of Instagram."
- "The subscription fees are fully earned upon payment and are not subject to any refund, credit or offset, pro-rata or otherwise, upon cancellation."

Marketing claim on plan cards: "Safe algorithms".

---

## B. All numeric limits and defaults in one table

| Area | Item | Value | Type | Evidence |
|---|---|---|---|---|
| Campaign | Messages per day slider | 0 to 100, step 1 | UI range | `CustomStepper` `min:0,max:100` |
| Campaign | Messages per day default (new campaign) | 35 to 45 (a min and max range) | default | `NewCampaignPage` `messages_per_day:{min:35,max:45}` |
| Campaign | Recommended ceiling | 50 per account per day | advice | `setupSteps`, `CustomStepper` |
| Campaign | Edit page placeholder before load | 50 to 70 | internal placeholder | `CampaignPage` |
| Campaign | Working hours slider | 0 to 24, step 1 hour | UI range | `CustomStepper` `min:0,max:24` |
| Campaign | Working hours default | 08:00 to 22:00 | default | `NewCampaignPage` `working_hours:{min:8,max:22}` |
| Campaign | Timezone | account level, from browser at sign up (fallback Europe/London) | default | `SignUpPage`, `ProfileSection` |
| Sequence | Steps per sequence | 1 to 10 (1 first message + up to 9 follow ups) | hard limit | `CustomStepper` "Only 10 messages are allowed" |
| Sequence | Variants per step (classic editor) | 5 to 10; new step starts with 5 blanks | hard limit | `CustomStepper` |
| Sequence | Delay between steps | 1 to 30 days, step 1, default 1 | UI range | `CustomStepper` `min:1,max:30` |
| Sequence | Variant verdict threshold | 10 sends before "Best performer" / "Weakest" | logic | `launchBlockedMessage` `Be=10` |
| Workflow | Messages per workflow | max 10 | hard limit | `workflowCampaigns` `h=10` |
| Workflow | Variants per message | 1 to 10 | hard limit | `workflowCampaigns` `x=10` |
| Workflow | Wait block | default 2 days, min 1 | default | `workflowCampaigns` `config:{days:2}` |
| Workflow | Audience blocks | exactly 1 | hard limit | `blocks` |
| Launch preview | First send estimate | now + 5 min, rounded up to 5 min | logic | `launchPreview` |
| Account | Campaigns per account | 1 at a time | rule | `launchBlockedMessage` |
| Account | ColdDMs users per Instagram account | 1 | rule | `CampaignPage` |
| Account Setup | Name | required, max 30 characters | validation | `accountSetup` |
| Account Setup | Bio | required, max 150 characters | validation | `accountSetup` |
| Account Setup | Photos | 9 to 12; JPEG, PNG, WEBP | validation | `accountSetup`, `AccountSetupPage` |
| Warmup | Posts added per day input | 1 to 5, default 1 | validation | `AccountWarmupPage` |
| Warmup | Daily cap start, ramp steps, ceiling, days | not in bundle (`dm_range.current_cap`, `ceiling`) | server side | `AccountWarmupPage` |
| Find Leads | Leads per search | 100 to 10,000, step 100, default 1,000 | UI range | `FindLeadsPage` |
| Find Leads | Sources per search | max 40 lines | hard limit | `FindLeadsPage` `ts=40` |
| Find Leads | Queue alert | 3 hours | logic | `FindLeadsPage` `Mo=3` |
| Find Leads | Default time estimate | 60 minutes | default | `FindLeadsPage` |
| Find Leads | Tour sample follower filter | 1,000 to 20,000 | example | `FindLeadsPage` |
| Lists | Usernames per add | max 100,000 ("Maximum 100k usernames") | hard limit | `ListsComponent` |
| Lists | Upload chunk | 10,000 per request | logic | `ListsComponent`, `CreateList` |
| Lists | Custom fields per list | max 30 | hard limit | `FileUpload` `st=30` |
| Lists | Username format | 3 to 30 chars, `^[\w](?!.*?\.{2})[\w.]{1,28}[\w]$` | validation | `CreateList` |
| Lists | Recommended list size | at least 1,000 targets | advice | `setupSteps` |
| Lists | Runway colours | red ≤ 3 days, amber ≤ 7 days | logic | `listRunway` |
| Lists | Retry failed leads | max 10,000 usernames per retry | hard limit | `ListsComponent` |
| Inbox | Reply length | max 1,000 characters | validation | `UnifiedInboxPage` |
| Inbox | Quick replies | 6 slots, browser local only | limit | `UnifiedInboxPage` |
| Inbox | Page size / polling | 50 conversations; every 30 seconds | logic | `UnifiedInboxPage` |
| Inbox | Tag colours | 8 | UI | `UnifiedInboxPage` |
| Accounts | Hide inactive threshold | last online more than 2 days ago | logic | `BrowsersPage` |
| Extension page | Account detection | "Usually within 30 seconds"; refresh after 15 to 30 seconds | copy | `ExtensionPage` |
| Onboarding | Step time estimates | 2, 3, 5, 1 minutes (11 total) | copy | `setupSteps` |
| Plans | Trial | 3 days | plan | `SignUpPage`, `IndexPage` |
| Plans | Pro | $99 per month, 1 account | plan | `SubscriptionPage` |
| Plans | Scale | 2 to 33 accounts; $174 (2) to $980 (33) per month; marginal $75, $55, $38, $33, then $25 (6th to 29th), $20 (30th to 39th), $15 (40th to 50th) | plan | `SubscriptionPage` `scalePrices` |
| Plans | Unlimited | $999 per month, unlimited accounts | plan | `SubscriptionPage` |
| Guarantee | Refund condition | 1 client in 30 days, min 1,000 messages sent in the month | copy | `NewCampaignPage`, `FindLeadsPage` |
| Settings | Name length | max 200 | validation | `ProfileSection` |
| API | Form upload timeout | 60 seconds | client | `index.js` |

---

## C. Safety controls that exist but are hidden from the user

| Control | How we know | What is unknown |
|---|---|---|
| Delay between individual sends | Testing flag `options.no_delay` / `testing.disable_messages_limit` exposes a "Disable limit" toggle (`CampaignPage`, `CampaignForm`); device status shows "Next message in X" from `status.next_date` | Min and max gap, randomisation method |
| Daily count chosen inside the min to max range | `messages_per_day` is `{min,max}`; UI treats `max` as the cap | How the daily number is picked |
| Warmup ramp of the daily cap | `dm_range.{current_cap, sent_today, ceiling}`, history event "Daily message cap increased", `campaigns/effective-cap` returning `effective_limit`, `campaign_limit`, `warmup_limit` | Start value, step size, ceiling, duration |
| Auto pause on Instagram limits | `account_status.state` = `temporarily_paused`, copy "Sending resumes on its own when the pause ends." | Pause length, trigger |
| Auto pause on repeated errors | "repeated errors pause the account" | Error count threshold |
| Stop events | `account.stopped_event.{reason,date}` | Full list of reasons (server text) |
| Stop follow ups on reply | "SYSTEM RULE" badge | How quickly replies are detected (`check_response` frequency) |
| Same sender dedupe | `messaged_by: "elsewhere"` copy | Exact matching rules |
| Variant rotation | Variants stored per step, per variant stats | Rotation algorithm (random or round robin) |
| Unreachable and missing accounts skipped | Target status "Failed - account not found / unreachable" | Whether failed sends count toward the daily cap |

---

## D. Practical reading for our own build

- ColdDMs' stated safe operating point: at most 50 first messages plus follow ups per account per day (default 35 to 45), at least 5 message variants per step, sends randomised inside a 14 hour window, one logged in Chrome profile per account on the owner's machine.
- Their newer direction is profile quality gating by a human reviewer plus a server controlled ramp of the daily cap, which signals that fixed caps alone were not enough to keep accounts alive.
- They publish no guidance at all on message content, links, proxies or account age, and their terms push all restriction risk to the user.

## Addendum 2026-10-11: guided tour text

The first snapshot missed the lazy chunk `campaignTour.js`. The weekly update scan picked it up. It holds the in-app guided tour for campaign creation and repeats the same ceiling as the rest of the app: "we recommend 50 or less" messages per day. Nothing in it changes the limits recorded above.
