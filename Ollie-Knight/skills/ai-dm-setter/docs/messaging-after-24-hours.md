# Unit after-24h: the official API route for messaging after 24 hours

Date checked: 19 November 2026. All web sources are Meta's own developer pages unless marked. Each claim is tagged fact (with source), inference or speculation.

## 1. What was changed

File: `web/app/connect/page.tsx` (the only file edited).

- New component `After24h({ dashId })`, defined just above `Step`. A folded card titled "Messaging after 24 hours", same style as the "Set up from scratch" guide card (`details.card`, `H` sub headings, `ExtLink`).
- Rendered in `ConnectPage` directly above the Chrome helper card: `<After24h dashId={v.meta.dashId} />`. It shows for every workspace, connected or not, so it is right for a new customer.
- Sections inside: The short version; What Meta allows, one by one; What does not exist; How to apply for Human Agent (9 steps with links, two of them built from the saved Meta app ID when there is one); Meta's own pages (5 links); date checked line.
- "Good to know" block (`rules` in `InboxSetup`): the two bullets "The 24 hour rule" and "Human Agent" now point to the new section. The old 24 hour bullet told owners to reply in Instagram or switch on the Chrome helper, which contradicts the owner's new rule 1.

No version numbers changed. No other file touched.

## 2. How it was tested

- `npx tsc --noEmit` in `web/`: exit 0 (fact, command output).
- `grep -c "Messaging after 24 hours" app/connect/page.tsx`: 3 matches (fact).
- No em or en dashes in the file (fact, grep returned nothing).
- Not rendered in a browser: the brief forbids next dev and next build. Layout is unverified by eye (it reuses classes already on the page).

## 3. Every official route, for this account type

Account type assumed: Instagram API with Instagram Login (graph.instagram.com), app Live, Standard Access, no App Review yet.

### 3.1 Standard messaging window (24 hours)
- Allows: any message, automated or by a person, after the lead writes. Fact: "Only after an Instagram user has sent your app user's Instagram professional account a message can your app send a message"; "For most user actions, it lasts 24 hours." Source: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- Limits: text under 1,000 characters (fact, https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message.md). No group chats (fact, messaging-api page).
- Owner must do: nothing beyond connecting. Standard Access covers "Instagram professional accounts you own or manage" (fact, same messaging-api page).
- Cost: free (inference: no fee is mentioned on any page read).
- Codebase: supported. `sendMessage` web/lib/meta.ts:102, `deliver` web/lib/engine.ts:340, window check `windowState` web/lib/pipeline.ts:166.

### 3.2 Human Agent tag (up to 7 days)
- Allows: a person's reply up to 7 days after the lead's last message. Fact: lets a business "respond to user messages on Instagram/Messenger manually outside the 24-hour standard messaging window"; "This tag extends the 24-hour response window to 7 days". Source: https://developers.facebook.com/docs/features-reference/human-agent
- Exact name: the feature is called "Human Agent" and is listed under Instagram API with Instagram Login next to the four instagram_business permissions (fact, https://developers.facebook.com/docs/instagram-platform/app-review). The features page calls the tag `human_agent` in lower case (fact, same features-reference page).
- Requirements: fact, features-reference page: "requires successful completion of the App Review process before your app can access live data"; "only available with business verification"; "You may also need to sign additional contracts".
- Person only: fact, Meta words it as "manually respond" and asks for a recording "that shows a human agent responding to a message" (https://developers.facebook.com/documentation/business-messaging/instagram-messaging/app-review/apps-for-your-own-business). Inference: AI or automatic messages must not use the tag. No page read states the ban in those exact words.
- What Meta wants in the submission (fact, same apps-for-your-own-business page): request it only if you have a custom inbox whose agents need up to 7 days; "Explain why it can take someone up to 7 days to reply to a direct message instead of 24 hours"; a screen recording of a human agent replying, of the same app that is submitted. General App Review asks (fact, https://developers.facebook.com/docs/instagram-platform/app-review): a description of use, an end to end screencast per permission or feature, step by step test instructions, a privacy policy URL, at least 1 successful API call for certain permissions, and any permission the feature depends on in the same submission.
- Where to submit: fact, "App Review > Requests", "Request Permissions or Features" (https://developers.facebook.com/documentation/business-messaging/instagram-messaging/app-review).
- Business verification: fact, started in the app at Settings, Basic, Verification, Start Verification, finished in the business portfolio; document list at https://www.facebook.com/business/help/1095661473946872 (source: https://developers.facebook.com/docs/development/release/business-verification).
- Typical time: no data found for an official App Review time on Meta's pages. Third party and forum reports only: Meta's 2022 blog gave about 5 business days for access verification (https://developers.facebook.com/blog/post/2022/06/02/access-verification-process-for-tech-provider-apps/); 2026 forum threads report 2 to 8 weeks for business verification and App Review stuck past 10 to 13 days (https://communityforums.atmeta.com/, https://developers.facebook.com/community/threads/3459359287566790/). Treat as anecdote. The page says "allow a few weeks".
- Cost: no fee mentioned on any page read (inference: free).
- Codebase: partly supported, never tested live.
  - Fact: `humanAgentApproved()` reads env `META_HUMAN_AGENT === "approved"` (web/lib/engine.ts:325).
  - Fact: `sendMessage(..., humanAgent)` adds `messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT"` (web/lib/meta.ts:108).
  - Fact: `deliver` refuses any non owner sender outside the window (engine.ts:362), so the AI never uses the tag. This matches Meta's person only wording.
  - Gap 1 (fact): `sendVia` returns "meta" whenever the switch is on, with no 7 day check (engine.ts:317). A chat quiet for 8 days or more is sent to Meta, which will refuse it, instead of falling to the Business Suite route.
  - Gap 2 (unverified): tag casing. Meta's features page writes `human_agent`; the code sends `HUMAN_AGENT`. The Instagram send reference pages did not render for me, so I could not confirm which casing graph.instagram.com accepts.
  - Gap 3 (fact): the switch is a host wide env var, not a workspace setting. On a white label install with several customers, one approval would switch it on for all. Each customer's own Meta app needs its own approval.

### 3.3 Private replies (comment to DM)
- Allows: one direct message to a person who commented on the account's post or reel. Fact: "Only one message can be sent to the commenter"; "The message must be sent within 7 days of the comment"; "Follow-up messages can only be sent if the recipient responds, and must be sent within 24 hours of the response"; for Live, only during the broadcast. Source: https://developers.facebook.com/docs/instagram-platform/private-replies
- Permissions with Instagram Login: `instagram_business_basic` and `instagram_business_manage_comments` (fact, same page).
- Owner must do: subscribe the comments webhook field (already in the set up guide, step 6) and set keywords in Outreach.
- Cost: free (inference).
- Codebase: supported. `sendPrivateReply` web/lib/meta.ts:136; `onComment` web/app/api/meta/webhook/route.ts:75; rate guard `privateReplyAllowed` web/lib/outreach.ts:599; scope in `IG_SCOPES` meta.ts:18.
- Note: this is the only official way to DM someone who has never messaged the account, and it needs their comment first.

### 3.4 Click to message ads (Click to Direct)
- Allows: a longer window. Fact: when a person's first message follows a Click to Direct ad, "the window may last up to 7 days from that message". Sources: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api and https://developers.facebook.com/docs/messenger-platform/policy/policy-overview
- Limits: only for that first ad driven message. "may last up to" is Meta's wording; exact conditions were not found (no data found for the precise rule).
- Owner must do: run ads with the Instagram Direct destination in Ads Manager.
- Cost: ad spend. No per message fee found.
- Codebase: partly. The webhook labels the chat "Ad click" when `referral.source === "ADS"` (webhook/route.ts:129). The window is still a flat 24 hours (`windowState`, pipeline.ts:166), so the extra days are not used. Inference: a per conversation window end (7 days when origin is Ad click) would unlock it, sent as a normal message with no tag. Unverified against a live ad.

### 3.5 ig.me links, story replies, ice breakers
- These do not extend anything. They are ways the lead writes first, which opens the 24 hours (fact: ig.me links and ice breakers are listed Instagram messaging features, https://developers.facebook.com/documentation/business-messaging/instagram-messaging/llms.txt).
- Codebase: ig.me link referrals handled (`onLink`, webhook/route.ts:57 and :117); story replies labelled (route.ts:129). Ice breakers: no data found in the files I was allowed to read.

### 3.6 Marketing Messages (recurring notifications, opt in)
- Fact: Meta's page says it "allows a Facebook Page or Instagram Professional Account" to message opted in people outside the window; opt in requests only inside the window; for Instagram up to 10 opt in requests per user per 7 days. Same page: "Marketing messages (also known as Recurring Notifications) on Messenger will be deprecated on February 10, 2026"; from September 1, 2025 access "limited to existing Partners and end-clients", "No new integrations will be allowed". Requirement listed: `pages_messaging` with Facebook Login and a Page access token. Source: https://developers.facebook.com/docs/messenger-platform/marketing-messages
- Inference: not open to this app. It needs Facebook Login with a Page, this app uses Instagram Login, and new integrations are closed.
- Unconfirmed: whether the Instagram side is still live for existing partners today. The Instagram specific page (https://developers.facebook.com/documentation/business-messaging/instagram-messaging/marketing-messages) did not render.
- Codebase: not supported. `messaging_optins` is not subscribed (meta.ts:82).

## 4. What does NOT exist for Instagram (official)
- App initiated first message to someone with no prior message, comment, ad click or link open (fact, messaging-api page quote in 3.1).
- Any route past 7 days from the lead's last message (inference from 3.2 and 3.4: 7 days is the longest window any page gives).
- One time notification: "One-time Notification is not available for IG Messaging API" (fact, policy-overview page).
- Sponsored messages: "Sponsored messages are not available for IG Messaging API" (fact, same page).
- Other message tags: fact, "Some message tags are available only for Messenger Platform and not IG Messaging API" (policy-overview); fact, from April 27, 2026 requests with CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE or POST_PURCHASE_UPDATE get error 100 (https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages). Inference: Human Agent is the only tag usable on Instagram. The full tag table page did not render, so this is not confirmed line by line.
- Promotional content under any tag: "Message Tags may not be used to send promotional content" (fact, same send-messages page).

## 5. Other duties Meta lists (not asked, but relevant to a product sold to others)
- Fact: "Apps that use the Instagram Messaging APIs must have an escalation path to a human agent" and automated chats must disclose automation where the law requires (https://developers.facebook.com/documentation/business-messaging/instagram-messaging/overview.md). The app has the Needs human label and a disclosure setting (engine.ts:262, :346).
- Fact: serving accounts the app owner does not own needs Advanced Access through App Review (instagram-platform/app-review). The product model here is one Meta app per customer, which stays on Standard Access (inference).

## 6. What the lead must do
1. Decide on Gap 1: add a 7 day ceiling to the Human Agent path in `sendVia` (engine.ts:317), so older chats go to the Business Suite route. Not my file.
2. Decide on Gap 2: confirm the tag casing against a live approved app before relying on it. Cannot be tested until Meta approves the feature.
3. Decide on Gap 3: move the Human Agent switch from env to a workspace setting, then change step 9 of the new section, which names `META_HUMAN_AGENT` on the host.
4. Stale copy still on the connect page that I left alone because it describes other units' work: the Chrome helper card title and intro (page.tsx, "for chats older than 24 hours and first messages" and "the helper types the message in your own Chrome"), the "Sending from this browser" text, and FullGuide step 7 item 3 ("Reply to a chat older than 24 hours. It goes out through the helper"). Rewrite once bsuite-sender and outreach-rules land.
5. The new section says "reply yourself in the Meta Business Suite inbox" and does not promise that the helper sends there. Add one line when bsuite-sender is live.
6. Optional product gain: use the 7 day ad window (3.4).
7. Deploy is the lead's call. Nothing was deployed.

## 7. Unverified
- The App Review link built from the app ID (`/apps/<id>/app-review/permissions/`) follows the dashboard's usual pattern but was not opened (needs a Meta login). The step text also gives the menu path.
- Whether Human Agent formally depends on Advanced Access to `instagram_business_manage_messages`. The page tells the owner to add it if Meta asks.
- Whether Meta approves Human Agent for an app that serves one own account on Standard Access. Meta's own business guide describes this case, so it is likely (inference).
- Review time, tag casing, live Instagram status of Marketing Messages, exact ad window rule: see above.
- Pages that returned only navigation (no body): messenger-platform message-tags, Send API reference, App Review FAQs, Instagram marketing-messages.
