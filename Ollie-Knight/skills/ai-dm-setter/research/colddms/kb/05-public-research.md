# 05. Public research: ColdDMs, Instagram limits, competitors, Meta risk, law, legitimate alternatives

Research date: 2026-10-11, updated 2026-10-19 from the weekly Meta page scan (Messenger Platform changelog, Instagram Platform overview). Method: web search, public page fetches, the publicly served JavaScript of app.colddms.com (no login), the public Chrome Web Store package, and public YouTube auto captions. Nothing was signed up for, logged in to, or submitted.

Style note: where a source quote contained a long dash, it has been replaced with a comma or colon. Wording is otherwise verbatim inside quotation marks.

## Reliability key

| Tag | Meaning |
|---|---|
| [OFFICIAL] | Meta, Instagram, ICO, FTC or other primary document |
| [PRIMARY-ARTIFACT] | Read directly from ColdDMs' own public files (site, app bundle, extension package, video captions) |
| [VENDOR] | Claim made by a company selling a tool (ColdDMs or a competitor). Commercial bias assumed |
| [COMPETITOR] | Claim about ColdDMs made by a rival vendor. Bias against ColdDMs assumed |
| [ANECDOTE] | User review, forum post or testimonial |
| [NEWS] | Trade or mainstream press |
| [LEGAL-COMMENTARY] | Law firm or legal blog |
| [UNVERIFIED] | Could not be confirmed at a primary source |

---

## 1. ColdDMs itself

### 1.1 Identity and footprint

| Fact | Value | Source | Tag |
|---|---|---|---|
| Product | Instagram cold DM automation, web app plus Chrome extension | https://www.colddms.com/ | [VENDOR] |
| Developer name on store | ColdDMs.com | https://chromewebstore.google.com/detail/ffcepcgicipeaajceijngacfelhpgofe | [OFFICIAL store listing] |
| Developer address on store | 19416 Abigail Way, Pflugerville, TX 78660-4533 US | same | [OFFICIAL store listing] |
| Contact | contact@coldDMs.com, Telegram https://t.me/colddms, WhatsApp https://wa.me/message/WCV5J2AOOMHMI1 | https://www.colddms.com/ | [VENDOR] |
| Founder | "Carson" named in two landing page testimonials and in a partner testimonial | https://www.colddms.com/ and https://coldaccs.com/ | [ANECDOTE] |
| Current video front person | "Jemon Thomas" (named in a video description; auto captions render it "G Montanus") | https://www.youtube.com/watch?v=V1sCq1iahlk | [PRIMARY-ARTIFACT] |
| Legal entity | Not stated anywhere public. Terms say only "ColdDMs.com" and governing law "the laws of the US" | https://app.colddms.com/terms-of-service | [PRIMARY-ARTIFACT] |
| Affiliation disclaimer | "ColdDMs is not affiliated, associated, authorized, endorsed by, or in any way officially connected with Meta (Instagram)" | https://www.colddms.com/ | [VENDOR] |
| Affiliate tooling | Landing page and app load a Rewardful script (r.wdfl.co/rw.js). This implies an affiliate or referral programme exists; no public affiliate page was found | page source of https://www.colddms.com/ | [PRIMARY-ARTIFACT], inference |

Naming trap: "ColdDMs Pro" (colddmspro.com, app.colddmspro.com, docs at https://colddms-pro.gitbook.io/colddms, strategy calls at cal.com/silicondunes) is a different product. A third party comparison lists the two separately (https://coldabry.com/blog/best-instagram-cold-dm-tools/). Its playbook is recorded in section 1.9 for comparison only and must not be attributed to Carson's ColdDMs.

### 1.2 Landing page claims (https://www.colddms.com/) [VENDOR]

- Headline: "Grow Your Business FAST With Automated Cold DMs". Sub claim: "Get at least one client in 30 days or we'll refund you."
- Lead sources: "Find and filter leads for your outreach campaigns from accounts, posts, hashtags, keywords and mentions." Also "Fetch targeted leads from an account's followers, following, likes, comments, etc."
- Sequences: "Add up to 10 steps to your message sequences." "A/B test up to 15 message variants per-step. Up to 10 follow-ups. Automatically stop the sequence when someone replies."
- Personalisation tokens: "firstName, name & username".
- Safety: "Safe Design. We built it the right way. Our Chrome extension does safe and responsible emulation."
- Inbox: "The Best Unibox - No FB Business Account Needed".
- Social proof line: "1000s of Users Making $$$ With ColdDMs".

Pricing as published:

| Plan | Price | Volume claim | Accounts | Other |
|---|---|---|---|---|
| Pro | $99/mo | "Up to 100 messages per day(Instagram limits)" | 1 IG account | "Guaranteed client in first month or refund (send min. 1k+ messages)" |
| Scale | "$174+/mo" | "1000s of messages per day" | "Get a price based on how many accounts you need" | |
| Enterprise | $999/mo | "10000s of messages per day" | "Unlimited accounts" | "24/7 expert consulting" |

All plans: 3 day free trial.

FAQ, verbatim:

- "Will my Instagram account get banned for this? Our tool runs on your device and is no more dangerous than manually sending messages yourself. It all depends on the content of your messages. In general, it is SAFE."
- "What are the terms of the new client promise? If you send at least 1000 messages in the first 30 days and don't sign a new client, we will refund you 100% of your subscription cost. No questions asked. 1st month of Pro plan only."
- "Do I need to use my own account? There is always some risk with any type of social automation. It is typically fine, but if you are worried, you can always buy an aged account with pre-existing followers for cheap."
- "Do I need to have my computer open for it to run? Yes, because it is a Chrome extension. This is the safest way to automate your messaging and protect your accounts."

Contradiction to note: the refund promise on the landing page conflicts with the Terms, which say fees "are not subject to any refund, credit or offset, pro-rata or otherwise, upon cancellation" (section 1.5).

### 1.3 Chrome Web Store listing [OFFICIAL store listing unless tagged]

| Field | Value | Source |
|---|---|---|
| Users | 1,000 (store bucket) | https://chromewebstore.google.com/detail/ffcepcgicipeaajceijngacfelhpgofe |
| Rating | 5.0 from 91 ratings (Extpose shows 4.96 from 91) | store, and https://extpose.com/ext/ffcepcgicipeaajceijngacfelhpgofe |
| Version | 6.14.8 | store |
| Last updated | 25 September 2026 | store |
| Size | 702 KiB | store |
| Listing status | "Unlisted", with in app purchases | https://extpose.com/ext/ffcepcgicipeaajceijngacfelhpgofe [third party tracker] |
| Store description claim | Works "within Instagram's guidelines" | store [VENDOR] |
| Privacy disclosure | Handles "personal communications" and "website content" | store |
| Version history | Only the current version is publicly visible. No public changelog found | Extpose |

Discrepancies:
- Landing page says "5.0 star rating with 74 Chrome Store reviews"; the store shows 91 ratings.
- Carson's testimonial on a supplier site says "+3000 users" (https://coldaccs.com/); the store shows the 1,000 user bucket. Store counts are active installs, so both can be true if "users" means sign ups, but the gap is worth knowing.

Permissions, read directly from the public package manifest (version 6.14.8) [PRIMARY-ARTIFACT]:

- permissions: storage, alarms, cookies, pageCapture, webRequest, system.cpu, system.memory
- host_permissions: `*://*.instagram.com/*`, `*://*.colddms.com/*`
- content scripts on all instagram.com frames at document_start: `assets/InjectVisibility.js`, `assets/HackReact.js`; at document_end: `assets/content.js`
- web_accessible_resources: everything, exposed to instagram.com

Mechanism observations from the same public package [PRIMARY-ARTIFACT]:

- `HackVisibility.js` is injected into the Instagram page. It forces `document.visibilityState` to "visible", `document.hidden` to false, `document.hasFocus()` to true, and swallows `visibilitychange`, `blur`, `pagehide` and `mouseleave` events. Effect: Instagram's web client believes the tab is focused and visible while it runs in the background.
- `HackReact.js` injects a bundled `ReactDev.js` (a React devtools style hook) at document start, which lets the extension reach into Instagram's React component tree.
- The app's error copy confirms UI driving rather than private API calls: "Instagram's DM button wasn't where the bot expected.", "The message couldn't be typed into the chat box.", "Instagram's search window didn't open.", "Couldn't select this person from Instagram's search results."
- Net: this is browser extension UI emulation on the user's own session, IP and cookies. It is not a private mobile API bot and not a cloud phone farm. The `cookies` permission means the extension can read Instagram session cookies.

### 1.4 Chrome Web Store reviews (https://chromewebstore.google.com/detail/colddms/ffcepcgicipeaajceijngacfelhpgofe/reviews) [ANECDOTE]

All ten visible reviews are 5 star. No developer replies visible.

| Reviewer | Date | Text |
|---|---|---|
| Derrick Dix | 19 Feb 2026 | "Great platform, good support, everything built in all in one from lead scraping to automations that make sure your account doesn't get restricted". The same review as read aloud in a ColdDMs video adds: "Other platforms I've tried got my account restricted with two messages sent. With them, I've never had that problem. The price is 1,000% worth it." |
| Finley Price | 3 Jan 2026 | "This is game changing! Next level service. Customer service is insane too. I'll be honest, i ran into a tiny bug as I started, messaged them directly and it was fixed within 2 minutes." |
| Vuk Kovacevic | 2 Oct 2025 | "I closed a client by using this platform for 3 days" |
| Aman Kaushik | 5 Sep 2025 | "awesome results, got a client on second day itself" |
| Ardit | 5 Aug 2025 | "great tool would recommend" |
| Joy Works | 5 Aug 2025 | "love it tool basically pays for itself got a client same week +roi 10/10" |
| Younis Yasin | 4 Aug 2025 | "Great app" |
| Csaba Balogh | 1 Aug 2025 | "Within days, I signed 4 new clients...Clean interface, high deliverability, and automation that actually works" |
| Olivier | 19 Jul 2025 | "This software has made me a lot of money. There's also nothing like it on the market" |
| Beth Berkey | 16 Jul 2025 | "This is saving me HOURS...responses never fall through the cracks. Customer support is fast, helpful" |

Negative or sceptical signals:
- Extpose's summary of the review set mentions one reviewer complaining of "too many leads" (a joke style positive) and "Another expressed skepticism about review authenticity." The sceptical review text itself could not be retrieved. (https://extpose.com/ext/ffcepcgicipeaajceijngacfelhpgofe) [ANECDOTE, partially UNVERIFIED]
- Review clustering: five of the ten visible reviews are dated between 1 and 5 August 2025. That pattern is consistent with a review request campaign. It proves nothing on its own.
- No review mentions a ban, an action block, a refund, reply rates or daily volume.

### 1.5 Terms of Service (https://app.colddms.com/terms-of-service) [PRIMARY-ARTIFACT]

The page is a JavaScript app; text below was read from the publicly served page bundle. Verbatim extracts:

- Subscriptions: "The subscription period is monthly... It can be cancelled at any given moment and can be renewed immediately after."
- Refunds: "The subscription fees are fully earned upon payment and are not subject to any refund, credit or offset, pro-rata or otherwise, upon cancellation. ColdDMs may change the amount of the subscription fee at any time."
- Use of the product: "We highly suggest you read the terms and privacy policy of Instagram and act in accordance with these terms. You may use the product, as long as you comply with these Terms of Service, the law and the terms of service of Instagram." Prohibited content "includes spam". "We reserve the right to suspend or terminate subscriptions or block users that violate these Terms of Service, the law or the terms of service of Instagram."
- Disclaimer: "ColdDMs is not affiliated with Instagram or Meta in any way. Instagram may block or restrict your Instagram profile based on activities you do with or without ColdDMs. ColdDMs has no control over, and assumes no responsibility for, this." "By signing up for ColdDMs and linking your Instagram account you acknowledge this risk and therefore ColdDMs is not responsible or accountable for any blocks or restrictions. The use of ColdDMs is therefore solely a risk taken by the user. ColdDMs is the safest tool and can be used from all parts of the world at any time."
- Liability: "Your only remedy with respect to any breach by us... is to terminate your subscription and discontinue using the product."
- Indemnity: the user indemnifies ColdDMs against claims "related to your actions, information, content or any other use of our product by you".
- Governing law: "the laws of the US". No state, no entity name, no arbitration clause, no effective date.

Reading: the Terms require the customer to comply with Instagram's terms while the product's core function (automated access and automated collection) is prohibited by those terms (section 2.8). All ban risk and all third party claims are pushed to the customer.

### 1.6 Privacy Policy (https://app.colddms.com/privacy-policy) [PRIMARY-ARTIFACT]

- Generic template text (log files, cookies, advertising partners, CCPA, GDPR rights, children).
- Collects on registration: "name, company name, address, email address, and telephone number".
- It does not mention Instagram session cookies, scraped lead data, message content, inbox content, sub processors, hosting location, retention, or a named data controller. The store listing separately discloses that the extension handles "personal communications" and "website content".
- For a UK or EU business this is a gap: scraped prospect data and DM content are personal data, and the policy gives no processor terms or transfer mechanism. [analysis]

### 1.7 What the public app bundle reveals about the product's own safety model [PRIMARY-ARTIFACT]

Source: user facing strings in the JavaScript served without login from https://app.colddms.com/assets/. These are product copy, not marketing.

Workflow stages:
1. Account Setup with human review. "Fill in the profile details and add your photos, then submit for review." "Use authentic, varied photos. Avoid duplicate or generic-looking images." States: pending review, approved ("Your account setup has been approved. Account Warmup is now available."), rejected with reviewer feedback.
2. Account Warmup with an automatic ramp. "Account Setup must be approved before warmup begins." "Automatic ramp is active" or "Automatic ramp is paused". "Today's safe range: up to ${current_cap} DMs". Events: "Daily message cap increased", "Warmup paused (account needs attention)", "Warmup resumed automatically". A checklist item references deleting old posts on Instagram, which matches the aged account playbook in section 1.8.
3. Campaigns. "Every assigned account has reached its daily message cap." "We recommend having at least 1000 targets for an effective campaign." "Using variations helps improve response rates and keeps your account safe."
4. Health states: "Paused by Instagram limits", "Instagram wants a check on this account", "Instagram is blocking this account from messaging: it may be temporarily restricted.", "The account was logged out of Instagram: sign in again in its Chrome profile."
5. Multi account model: a "Browsers" page and the phrase "this Chrome profile" indicate one Chrome profile per Instagram account.
6. Operational requirement: "Your browser needs to stay open for automation to work." "Keep your computer running and connected to the internet".

The actual warmup numbers (starting cap, ramp step, ceiling) are served from the backend after login and are not public. This is the key item to read from inside the licensed account.

### 1.8 ColdDMs recommended playbook (verbatim where possible)

Daily volume:
- Product ceiling on Pro: "Up to 100 messages per day(Instagram limits)". [VENDOR] https://www.colddms.com/
- Testimonial: "Fire it up, send 70 messages a day, let the deal come through!" (Benjamin Moore). [ANECDOTE] https://www.colddms.com/
- Guarantee threshold: "send min. 1k+ messages" in 30 days, which is about 34 per day. [VENDOR]
- Target list size: "at least 1000 targets". [PRIMARY-ARTIFACT]

Account buying advice:
- "if you are worried, you can always buy an aged account with pre-existing followers for cheap." [VENDOR] https://www.colddms.com/
- Supplier link: ColdAccs lists ColdDMs as a "Trusted Partner" and quotes Carson: "We own an instagram sending tool called Colddms.com with +3000 users and ColdAccs been our trusted supplier for more than one year now. 100% recommended". Aged Instagram accounts from 8.00 EUR. [VENDOR] https://coldaccs.com/
- Buying or selling accounts breaches Instagram's Terms and Meta's spam policy (section 2.8).

Warmup schedule for bought accounts (the supplier ColdDMs endorses, not ColdDMs' own words): "first login > wait two days> delete old posts > wait 24 hours > add new posts > wait 24 hours > start dming 1-3 dms per day for 5 days > ramp it up by 2 each 3 days until you reach 30-35 dms per day". Proxy advice from the same supplier: static residential proxies from Webshare.io. [VENDOR] https://coldaccs.com/
- Note the internal disagreement: the endorsed supplier tops out at 30 to 35 DMs per day; ColdDMs' own plan advertises up to 100.

Thirty day onboarding plan, from the "ColdDMs Tutorial: Complete Instagram Outreach Setup & Onboarding Guide" video (published 15 Sep 2026, auto captions) [PRIMARY-ARTIFACT] https://www.youtube.com/watch?v=K6NUoJduF3s
- "Week one, foundation. Don't worry about volume yet." Connect account, define ICP, build first list, first campaign, "Develop a few message variations".
- "Week two, launch and learn." "Don't judge your entire cold DMs experience from the first few days."
- "Week three, optimize."
- "Week four, scale what works." "Don't scale something that's broken."
- On platform risk: "Instagram is a third-party platform. That means there are things neither you nor Cold DMs completely control. Instagram can change limits. It can change platform behavior. Accounts may encounter restrictions or additional verification." "please, don't approach Instagram outbound like a race to send the maximum number of messages possible. We encourage responsible account behavior and gradual sustainable outreach."
- Profile advice: "Have a real profile, a clear bio, content, activity".
- Five mistakes: chasing volume immediately; changing everything after two days; "using extremely generic messages"; ignoring replies; struggling alone.
- 72 hour activation checklist: complete profile, connect Instagram, "define one clear ICP. not five. One.", build list, create campaign, create variations, review before launch.
- Mentions a "customer success manager" and a "ColdDM's community". No public community URL (Skool, Discord, Telegram group) was found.

Message scripts, from "Fix Your Cold DMs (Before You Lose Leads)" (https://www.youtube.com/watch?v=Ezk68z1osGc) [PRIMARY-ARTIFACT]
- First DM structure: "Observation, relevance, simple question, low pressure, next step."
- Example opener: "Hey Sarah, I saw that you help firsttime founders improve their offers. Are you currently getting most of your clients through content, referrals, or outbound conversations?"
- Alternative: "Hey Sarah, noticed you've been consistently sharing client growth content. Quick question. Do you have a system for starting conversations with ideal prospects? Or is Instagram mainly an inbound channel for you?"
- "Use a simple three message sequence." Message one: "Hey Sarah, are you currently relying primarily on content and referrals or are you also using outbound Instagram conversations?" Follow up one: "The reason I asked is that many founders create consistently but don't have a repeatable way to reach the right prospects. I noticed one simple outreach angle that may fit your offer. Happy to share it here if useful." Follow up two: "I'll close the loop after this. If building a more consistent Instagram pipeline becomes a priority, I'd be happy to share the campaign structure I had in mind."
- Cadence: the only spacing mentioned is following up "3 days later". No published day by day cadence.
- Rules: "Stop automated follow-ups when someone responds and move the conversation into a human exchange." "keep the personalization honest."
- Hypothetical funnel, explicitly "not a cold DM's performance claim": 100 qualified prospects, 20 replies, 8 qualified conversations, 4 calls, 2 clients.
- Six metrics: qualified prospects added, initial DMs sent, follow ups completed, total replies, qualified conversations, clients won.

Other scripts:
- "3 Minutes with ColdDMs, Ep 2" (https://www.youtube.com/watch?v=udCqo9PmrEI): "Your first cold DM has one job. Get the person to reply." Example: "John, quick question. Are most of your new clients coming through referrals right now, or are you doing outbound as well?" Advice: "try removing the CTA. Replace it with a simple relevant question".
- "Why Your Cold DMs Get Low Reply Rates" (https://www.youtube.com/watch?v=q7kHfWxPCj0): target 300 well chosen accounts over "scraping 10,000 random business accounts". Example: "Saw you're expanding the sales team. Curious, are your reps using Instagram for outbound yet or mainly email and LinkedIn?"
- "Why Your DMs Get Ignored (And How to Fix It)" (https://www.youtube.com/watch?v=4dVcEwtinj4): five opener templates (specific observation, useful preview, timing trigger, practical resource, plus one more), described as "writing demonstrations, not screenshots of claimed client results."

No link in first DM, proxies, mobile versus desktop, or reply rate benchmarks: ColdDMs publishes nothing on these.

### 1.9 The separate "ColdDMs Pro" playbook (different vendor, for comparison) [VENDOR]

Source: https://colddms-pro.gitbook.io/colddms and https://app.colddmspro.com/
- Stack: InterServer VPS (2 CPU, 2GB RAM, 30GB SSD), AdsPower anti detect browser, one Webshare proxy per account, extension installed in each AdsPower profile.
- Volume: start "low DM volumes (e.g., 20-50/day/account)"; another page says start "50/day" and scale to "100+" as accounts mature.
- Accounts: buy aged accounts from AccsMarket; manage with HideMyAcc.
- Copy: under 50 words; sample "Would you object if we book you 10 to 20 sales calls in 30 days? If we fail, refund plus free work until success."
- Marketing claims: "10.2% Avg reply rate", "99.8% Safe accounts", "40M+ Total DMs sent". No evidence offered.

### 1.10 Third party statements about ColdDMs

| Source | Statement | Tag |
|---|---|---|
| https://coldabry.com/blog/best-instagram-cold-dm-tools/ (27 Jul 2026) | ColdDMs is "the most expensive entry point here"; about $33 per 1,000 DMs; ban risk rated "High (extension-based, no warmup)"; "no warmup or proxy layer"; the 100 per day ceiling is roughly double what "experienced operators consider safe". Same article: cold DM tooling "lives in a gray market with thin review footprints, astroturfed Reddit threads, hidden pricing" | [COMPETITOR]. The "no warmup" point is out of date: the current app has a warmup workflow (section 1.7) |
| https://dmfaster.com/colddms-alternative | Confirms $99 for one account, extension, computer must stay open, 3 day trial | [COMPETITOR] |
| https://igdm.me/alternative-to-colddms | Confirms pricing tiers; positions itself at $8.99/mo | [COMPETITOR] |
| https://creatorflow.so/vs/colddms | ColdDMs "uses a different approach than CreatorFlow's official Meta API" | [COMPETITOR] |
| https://coldaccs.com/ | Partner listing, Carson quote, "+3000 users" | [VENDOR] |

### 1.11 Channels checked

| Channel | Result |
|---|---|
| YouTube https://www.youtube.com/@ColdDMs | 48 subscribers, 19 videos, most with 20 to 180 views. Earliest visible uploads late Aug 2026. One titled "Cold DMs Aren't Dead. Bad Outreach Is. | ColdDms Is Back" (30 Sep 2026) announces "The grand reopening of cold DMS". This suggests a relaunch or a period of downtime before Sep 2026; the cause is not stated [PRIMARY-ARTIFACT, cause UNVERIFIED] |
| Telegram https://t.me/colddms | A contact account, not a public channel. No posts visible |
| Trustpilot | https://www.trustpilot.com/review/colddms.com returns 404. No profile found |
| Product Hunt, G2, Capterra | Nothing found in search |
| Reddit | Could not be searched or fetched from this environment. Not verified either way |
| BlackHatWorld | Threads on cold DMs exist; no thread naming ColdDMs was found; direct fetch blocked (403) |
| Twitter/X | Nothing found for the product or founder |
| Help docs or blog on colddms.com | None public. Onboarding is in app plus YouTube |
| Skool or Discord | None found. A "ColdDM's community" is mentioned in the onboarding video without a link |
| Coupon aggregator https://cold-dms.tenereteam.com/ | Exists; fetch blocked (403) |

### 1.12 What users say about bans, blocks, reply rates, volumes, proxies, support

- Bans and action blocks: no public user report of a ban with ColdDMs was found. The only public user statement is positive (Derrick Dix, section 1.4). Absence of complaints is weak evidence: the listing is unlisted, the user base is about 1,000 installs, and Reddit could not be checked.
- Reply rates: no user published figure. The vendor avoids stating one.
- Daily volumes that work: one testimonial says 70 per day.
- Aged accounts: vendor recommends them; supplier is ColdAccs.
- Proxies: ColdDMs says nothing publicly. The tool runs on the user's own IP.
- Support: consistently praised (Finley Price, Beth Berkey, Zac Judson, Leonardo, Jacob Zylstra). This is the strongest and most repeated positive theme.

---

## 2. How these tools evade Instagram limits, and what Instagram detects

### 2.1 Three architectures

| Architecture | How it works | Known weaknesses | Examples | Sources |
|---|---|---|---|---|
| Browser extension or desktop browser emulation | Runs inside the user's logged in instagram.com session; clicks and types in the real web UI; user's IP and cookies | Web only telemetry on an account that otherwise looks mobile; timing regularity; DOM changes break it; needs the computer on. Vendors claim it is "no more dangerous than manually sending" | ColdDMs, InstaOutreach, DM Faster, ReachOwl, DMpro's extension, IG DM Bot | ColdDMs FAQ; https://instaoutreach.com/ ("drives the real Instagram interface in your browser"); https://reachowl.com/safety [VENDOR] |
| Private API bots (reverse engineered mobile API) | A server pretends to be the official Android or iOS app | Device attestation, signature changes, `feedback_required` and `challenge_required` responses; Meta has sued vendors using this method (MGP25, Massroot8) | instagrapi based tools, legacy Jarvee style, many "cloud" tools | https://about.fb.com/news/2020/06/automation-software-lawsuits/ [OFFICIAL]; https://instagrapi.com/guides/errors/feedback-required [VENDOR docs] |
| Cloud or real phone farms | Real or virtual Android devices run the genuine app; automation taps the screen; mobile proxies or SIMs | Cost per account; cluster detection across devices; "real hardware doesn't guarantee an account outcome" | ShadowPhone, cloud phone providers | https://www.shadowphone.io/blog/best-jarvee-alternative-2026 [VENDOR, biased toward phones] |
| Anti detect browser plus proxy plus extension | One fingerprinted browser profile and one proxy per account, often on a VPS | "Mobile-app-versus-web telemetry mismatch surfaces under sustained engagement volume" | ColdDMs Pro stack (AdsPower plus Webshare) | https://www.shadowphone.io/blog/best-jarvee-alternative-2026 [VENDOR]; https://colddms-pro.gitbook.io/colddms [VENDOR] |

Why Jarvee died, per a competitor: discontinued in 2023 after "declining account survival rates as Instagram's detection caught up to the emulator-cluster architecture"; cited causes are hardware attestation (SafetyNet, App Attest), cluster detection, and action pattern analysis. [VENDOR] https://www.shadowphone.io/blog/best-jarvee-alternative-2026

### 2.2 What Instagram is known or claimed to detect

| Signal | Evidence | Tag |
|---|---|---|
| Very high frequency actions, manual or automated | Meta spam policy prohibits "Posting, sharing, engaging with content or creating accounts... either manually or automatically, at very high frequencies." | [OFFICIAL] https://transparency.meta.com/policies/community-standards/spam/ |
| Lower frequency plus repetition or inauthenticity | "We may place restrictions on accounts that are acting at lower frequencies when other indicators of Spam (e.g., posting repetitive content) or signals of inauthenticity are present." This is the official basis for identical text being a trigger | [OFFICIAL] same URL |
| Automated access as such | Instagram Terms: "You can't attempt to create accounts or access or collect information in unauthorized ways. This includes creating accounts or accessing or collecting information in an automated way... without our express permission, regardless of whether such automated access or collection is undertaken while logged-in to an Instagram account." | [OFFICIAL] https://help.instagram.com/581066165581870/ (text confirmed through search index; the page would not render to the fetcher) |
| Third party tools holding the session, and inhuman pace | Instagram's "We suspect automated behavior on your account" warning. Vendor summaries say Instagram's help pages name third party apps with your login, automated access, and activity at a pace no person keeps | [VENDOR summary of official page] https://creatorflow.so/blog/we-suspect-automated-behavior-instagram/ |
| Identical or near identical message text | Listed by most vendor guides; consistent with the official "repetitive content" line | [VENDOR] https://www.praecora.com/blog/instagram-dm-limits-2026, https://novalya.com/blog/instagram-dm-limits |
| Links in the first message | Listed as a red flag by vendors. No official statement found | [VENDOR] https://www.praecora.com/blog/instagram-dm-limits-2026 |
| Account age and history | Universal in vendor guides. No official numbers | [VENDOR] |
| Share of messages landing in Requests, decline and report rates | "a high proportion of messages ending up there is one of the clearest automation signals in existence" | [VENDOR] https://novalya.com/blog/instagram-dm-limits |
| Negative feedback on API messaging | "Your messaging or calling experience should not receive excessive negative feedback." (applies to official API apps) | [OFFICIAL] https://developers.facebook.com/devpolicy/ section 5.4 |
| Device, IP and linked account clustering | Vendor claims that enforcement spreads "through shared devices, Business Managers, and Facebook Pages". No Meta source cited | [VENDOR, UNVERIFIED] https://www.pilotdm.com/blog/instagram-account-ban-2026-what-is-happening-and-how-to-stay-safe |
| Web client automation tells | No public Meta documentation. Inferred from the countermeasures tools ship: ColdDMs overrides page visibility and focus APIs (section 1.3), which only makes sense if the web client behaves differently, or reports differently, when the tab is hidden | [PRIMARY-ARTIFACT], inference |

### 2.3 Published "safe" daily cold DM limits, and how much they disagree

Instagram publishes no daily DM limit. "Instagram publishes no daily DM limit, and there is no fixed number to go and find." [VENDOR] https://novalya.com/blog/instagram-dm-limits. "these are 'community guesses' lacking Meta documentation" [VENDOR] https://www.reachlee.co/guides/instagram-dm-limits/

| Source | New account | Established | Aged or high trust | Tag |
|---|---|---|---|---|
| InstantDM guide https://instantdm.com/blog/instagram-dm-limits-rules-2026-the-ultimate-account-safety-guide | 10 to 20 cold per day (0 to 3 months) | 30 to 50 (3 to 12 months) | 50 to 100 (1 year plus); Meta Verified 100 to 150 | [VENDOR] |
| Praecora https://www.praecora.com/blog/instagram-dm-limits-2026 | 0 in days 0 to 7; 2 to 5 in days 8 to 14; 10 to 15 in days 15 to 30 | 15 to 20 (days 31 to 60) | 20 to 30 (day 60 plus) | [VENDOR] |
| Celestia Leads (via search) https://celestialeads.com/blog/instagram-dm-automation-guide | action blocked at 15 to 25 unsolicited per day | 25 to 35 for aged healthy profiles | "about 20 per day" sustainable | [VENDOR] |
| CreatorFlow (via search) https://creatorflow.so/blog/instagram-dm-limits-how-many-messages/ | 5 to 10 cold per day before a block | 20 to 30 "but even that carries risk" | | [VENDOR, sells API tool] |
| DMpro blog (via search) https://a4.dmpro.app/instagram-dm-limit/ | 20 to 50 | | 100 to 150 | [VENDOR] |
| usecarly / elfsight (via search) https://www.usecarly.com/blog/instagram-dm-limit/ | "far lower" | | "roughly 50-100 per day" to non followers | [VENDOR] |
| Coldabry https://coldabry.com/blog/best-instagram-cold-dm-tools/ | | | about 50 is what "experienced operators consider safe" (100 is "roughly double") | [VENDOR] |
| BlackHatWorld threads (via search snippets) https://www.blackhatworld.com/seo/instagram-cold-dms-proxies-etc.1725219/ and https://www.blackhatworld.com/seo/20-automated-cold-dms-per-day.1748782/ | | "20-40 DMs per account per day, ideally split into two or three sessions"; "20 to 35 unique cold DMs per day as a stable ceiling once warmed" | Also: "almost no point to using aged accounts for mass DMs because it's only a matter of time before they get banned" | [ANECDOTE] |
| ColdAccs (ColdDMs' supplier) https://coldaccs.com/ | 1 to 3 per day for 5 days | plus 2 every 3 days | ceiling 30 to 35 | [VENDOR] |
| ColdDMs https://www.colddms.com/ | | | "Up to 100 messages per day"; testimonial 70 | [VENDOR] |
| ColdDMs Pro https://colddms-pro.gitbook.io/colddms | 20 to 50 | | 100 plus | [VENDOR] |
| InstaDM https://www.instadm.ai/ | Starter plan "75 DMs daily" | Pro "375 DMs daily" | Enterprise "Unlimited" (across accounts) | [VENDOR] |

Spread: for an aged account the published "safe" figure ranges from about 20 per day to 150 per day, a factor of roughly seven. Sources selling browser or cloud senders sit high (50 to 150). Sources selling official API tools and forum operators sit low (20 to 40). No figure is backed by Meta. The lowest cluster (20 to 35) is where the forum operators and ColdDMs' own account supplier agree.

### 2.4 Typical warmup schedules

| Source | Schedule | Tag |
|---|---|---|
| ColdAccs https://coldaccs.com/ | Log in, wait 2 days, delete old posts, wait 24h, add posts, wait 24h, 1 to 3 DMs per day for 5 days, then plus 2 every 3 days to 30 to 35 per day. That is roughly 6 to 7 weeks to reach the ceiling | [VENDOR] |
| Praecora https://www.praecora.com/blog/instagram-dm-limits-2026 | Day 1 profile only. Days 2 to 6 follows (5 to 8), likes (5 to 10), story views, comments. Day 7 one or two DMs to mutuals. Days 8 to 10: 2 to 3 cold per day. Days 11 to 14: 5. Days 15 to 21: 10. Days 22 to 30: 15. Day 30 plus: 20 | [VENDOR] |
| Novalya https://novalya.com/blog/instagram-dm-limits | Week 1 no outbound to strangers. Week 2 replies only. Week 3 five per day to followers. Week 4 10 to 15 per day | [VENDOR] |
| Reddit advice as relayed by a vendor | "warm up for 1-2 weeks before sending anything, including likes, story views, saves, and a few follows, and keep mixing normal activity in forever" | [ANECDOTE via VENDOR] https://coldabry.com/blog/best-instagram-cold-dm-tools/ |
| Aged definition (forum) | Not "aged" until "actively used from a consistent mobile IP address for at least 3 to 6 months" | [ANECDOTE] BlackHatWorld via search |

### 2.5 Error and restriction meanings

| Signal | Where seen | Meaning | Typical cooldown (sources disagree) | Sources |
|---|---|---|---|---|
| "Action Blocked" / "Try Again Later" | App and web UI | Temporary block on one action type (DM, follow, like) after velocity or spam signals | Hours to days; commonly 24 to 48h; vendors advise 48 to 72h rest | [VENDOR] https://www.praecora.com/blog/instagram-dm-limits-2026, https://novalya.com/blog/instagram-dm-limits |
| `feedback_required` | Private API response | The API level form of an action block; anti spam system wants the account to slow down | "at least 30 minutes but can extend up to 48 hours" (proxy vendors) versus "Six hours is the floor for light hits; one to three days is normal for repeat offenders" (instagrapi guide) | [VENDOR] https://proxywing.com/blog/how-to-fix-the-feedback_required-error-on-instagram-2025-guide, https://instagrapi.com/guides/errors/feedback-required |
| `challenge_required` / checkpoint | Private API response or login flow | Identity verification demanded (code by SMS or email, selfie, captcha), usually after a new device, new IP or suspicious session | Clears when the challenge is completed; repeated challenges escalate to disablement | [VENDOR] https://blog.froxy.com/en/how-to-resolve-the-instagram-challenge_required-error-best-practices-for-avoiding-it, https://www.followchain.org/challenge-required-instagram/ |
| "We restrict certain activity to protect our community" | App and web UI | Broader temporary restriction, sometimes with an end date shown | "a few hours to a few days"; "24 to 48 hours"; longer if behaviour continues. Instagram "does not publish a universal duration" | [VENDOR] https://elfsight.com/blog/instagram-error-we-restrict-certain-activity-to-protect-our-community/ |
| "We suspect automated behavior on your account" | App interstitial | Warning, not a ban; asks the user to confirm and remove tools | Dismissible; repeat warnings precede restriction | [VENDOR] https://creatorflow.so/blog/we-suspect-automated-behavior-instagram/ |
| 7 day then 30 day messaging restriction | Claimed pattern | "Real cold outreach typically triggers a 7-day messaging restriction on the first detected wave and a 30-day restriction on the second." | Not found at the page it was attributed to | [UNVERIFIED] surfaced in search synthesis only |
| API error 368, subcode 1404169 | Official Graph API | Policy block under sustained high volume sending | No published recovery time | [VENDOR] https://www.reachlee.co/guides/instagram-dm-limits/ |
| API error 100, subcode 2534037 (Instagram); error 10, subcode 2018300 (Messenger) | Official Send API | "When the setting is off, untagged Send API requests fail" with these codes. The setting is "Take control of conversations with your Business AI", which "is off by default and is independent of Take control of conversations". So the error means Meta Business AI owns the thread, not that the account is restricted. Meta's fix: "Wait for a messaging_handovers webhook event containing pass_thread_control before responding." | Not a cooldown. Lasts until Business AI passes the thread or the owner turns the setting on | [OFFICIAL] Messenger Platform changelog, top entry as of 2026-10-19 |
| ColdDMs in app states | ColdDMs UI | "Paused by Instagram limits" (auto resumes) versus "Instagram wants a check on this account" (needs the user) | Not published | [PRIMARY-ARTIFACT] |

### 2.6 Do message requests to non followers count differently?

Yes, structurally, and this is the best documented point in the whole area.

- Since August 2023 a non follower can be sent only one message until they accept, and it must be text only. "Rather than being able to send an unlimited number of DM requests to someone who doesn't follow you, you can now only send them one message". Images, video and voice notes are blocked until acceptance. [NEWS quoting Meta] https://techcrunch.com/2023/08/03/instagrams-new-feature-protects-users-from-unwanted-images-and-videos-in-dms and https://swgfl.org.uk/magazine/instagram-announces-new-ways-to-restrict-unwanted-direct-messages/
- Consequence for any sequence tool: follow up steps 2 to 10 cannot be delivered to a non follower who has not accepted the request. A 10 step sequence only functions for recipients who accept or already follow. [analysis from the official rule]
- The official Messaging API treats the Requests folder separately: "Messages in the Requests folder that have not been active for 30 days will not be returned". [OFFICIAL] https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- Recipients have "Limits" and "Hidden Words" controls that silently filter requests. [NEWS] https://www.thewhitehatter.ca/post/yes-instagram-introduces-new-features-to-enhance-user-safety-in-direct-messages
- Vendor estimates treat requests as stricter than follower DMs ("New accounts may only send 10-20 message requests per day before being flagged"). [VENDOR] https://www.usecarly.com/blog/instagram-dm-limit/

### 2.7 2025 and 2026 changes by Meta

| Date | Change | Source | Tag |
|---|---|---|---|
| Late May to Aug 2025 | Mass account suspension wave ("Thousands of US accounts suspended overnight", spreading to the UK mid June), including Meta Verified subscribers. Widely reported as AI moderation errors, not specifically a DM automation crackdown | https://sumgenius.ai/blog/instagram-dm-bot-ban-wave-2026/ | [VENDOR]; the wave itself was widely reported in press, the DM bot framing is the vendor's |
| Oct 2025 | Instagram Moderate Conversations API (block, unblock, spam folder through API). Handover Protocol discontinued for Instagram, replaced by Conversation Routing | https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog/ | [OFFICIAL] |
| 30 Jan 2026 | Page integrity information available through webhook and API | same | [OFFICIAL] |
| 3 Feb 2026 | Platform Terms and Developer Policies last updated | https://developers.facebook.com/terms/dfc_platform_terms/ and https://developers.facebook.com/devpolicy/ | [OFFICIAL] |
| 10 Feb 2026 | Recurring notifications (old Marketing Messages) on Messenger retired; replaced by the Marketing Messages API for Messenger; subscription token cooldown moved from 24h to 48h. Article does not say Instagram is affected | https://www.socialmediatoday.com/news/metas-recurring-marketing-messages-api-will-end-this-week/811668/ | [NEWS] |
| 27 Apr 2026 | Message tags CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE, POST_PURCHASE_UPDATE return error 100. Migration to Utility Templates or Marketing Messages API | Messenger Platform changelog (entry dated 27 Mar 2026) | [OFFICIAL] |
| About May 2026 | Claimed "Account Integrity" enforcement wave hitting automation tools and linked accounts. No Meta statement or press cited | https://www.pilotdm.com/blog/instagram-account-ban-2026-what-is-happening-and-how-to-stay-safe | [VENDOR, UNVERIFIED] |
| 28 Sep 2026 | Conversations started from Click to Messenger or Click to Instagram Direct ads get a messaging window of up to 7 days instead of 24 hours | Policy text confirmed at https://developers.facebook.com/devpolicy/ section 5.6.1. Date: the Messenger Platform changelog text saved 2026-10-19 shows "Sep 28, 2026" directly above this entry; https://www.spurnow.com/en/blogs/instagram-messenger-ads-7-day-messaging-window gives the same date | Policy [OFFICIAL]; date [OFFICIAL]. Reading the date line as the heading of the entry below it is inference from the page layout (the same reading dates the message tags entry 27 Mar 2026) |
| On or after 28 Sep 2026 (first seen 19 Oct 2026) | Conversation Routing docs (Messenger and Instagram) updated for threads owned by Meta Business AI. Setting "Take control of conversations with your Business AI" is off by default. While it is off, untagged Send API requests to a thread Business AI owns fail (Instagram error 100, subcode 2534037). Apps should wait for a messaging_handovers webhook with pass_thread_control before replying | https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog | Text [OFFICIAL]. The exact date is not in the saved text (it sits above the first saved line), so the range is inference. Whether tagged sends (for example HUMAN_AGENT) get through is inference from the word "untagged" and is not confirmed |
| Claimed Oct 2024 | "API DM rate cut from 5,000 to 200 per hour". The vendor that popularised this retracted it on 14 Aug 2026: "We have since been unable to find it in any Meta documentation." The 200 per hour figure is a tool side convention | https://sumgenius.ai/blog/instagram-dm-bot-ban-wave-2026/ and https://www.reachlee.co/guides/instagram-dm-limits/ | Debunked |

Lawsuits by Meta against automation and scraping vendors (no new 2025 or 2026 case against a DM automation vendor was found; the pattern below is the precedent):

| Year | Defendant | Conduct | Outcome | Source |
|---|---|---|---|---|
| 2019 to 2020 | Fake engagement sellers (New Zealand company, Nakrutka in Russia) | Bots and automation selling fake likes and followers on Instagram | Suits filed | [NEWS] https://www.socialmediatoday.com/news/facebook-launches-new-legal-action-against-fake-engagement-sellers-and-data/580135/ |
| Jun 2020 | MGP25 Cyberint Services (Spain) | Automation software "mimicking the official Instagram app in the way that it connected to our systems"; continued after cease and desist | Injunction, Madrid, Aug 2020; permanent ban | [OFFICIAL] https://about.fb.com/news/2020/06/automation-software-lawsuits/ |
| Jun 2020 | Mohammad Zaghar / Massroot8 (US) | Collected user logins, ran bots "which pretended to be an Android device connected to the official Facebook mobile app" | Injunction, San Francisco, May 2021 | [OFFICIAL] same URL. Claims under Terms and the Computer Fraud and Abuse Act |
| Oct 2020 | BrandTotal and Unimania | Chrome extensions (UpVoice, Ads Feed) scraping Facebook and Instagram | Suit filed | [NEWS] https://tech.slashdot.org/story/20/10/02/1644247/facebook-sues-two-chrome-extension-makers-for-scraping-user-data |
| Jan 2021 | "Oink and Stuff" (Portugal) | Four Chrome extensions including "Web for Instagram plus DM" that scraped profile data | Sought permanent injunction and data deletion | [NEWS] https://www.bleepingcomputer.com/news/security/facebook-sues-makers-of-malicious-chrome-extensions-for-scraping-data/ |
| Jul 2022 | Octopus Data; Ekrem Ates | Scraping for hire; automated Instagram accounts scraping 350,000 profiles | Suits filed | [NEWS] https://www.engadget.com/meta-sues-data-scraping-company-octopus-213001115.html |
| Jan 2023 | Voyager Labs | Fake accounts scraping 600,000 users | Settled Dec 2024 with permanent injunction and payment | [OFFICIAL] https://about.fb.com/news/2023/01/leading-the-fight-against-scraping-for-hire/ and [NEWS] https://therecord.media/meta-sues-surveillance-service-for-creating-fake-accounts-and-scraping-user-data |
| 2023 to 2024 | Bright Data | Sale of scraped Instagram data (logged out scraping) | Meta lost on summary judgment and dropped the case in Feb 2024. Court: Meta's terms did not bar logged out scraping of public data | [NEWS] https://techcrunch.com/2024/02/26/meta-drops-lawsuit-against-web-scraping-firm-bright-data-that-sold-millions-of-instagram-records and https://www.zyte.com/blog/california-court-meta-ruling/ |

Reading: Meta's legal targets have been vendors, with extension makers explicitly included. Logged in automation (which is what ColdDMs and our own extension would do) is on the weak side of the Bright Data line, because that ruling turned on the scraping being logged out.

### 2.8 Terms clauses on automation, scraping and account trading

| Document | Clause (verbatim) | Source | Tag |
|---|---|---|---|
| Instagram Terms of Use | "You can't attempt to create accounts or access or collect information in unauthorized ways. This includes creating accounts or accessing or collecting information in an automated way (including by engaging in Automated Data Collection as defined in the Automated Data Collection Terms) without our express permission, regardless of whether such automated access or collection is undertaken while logged-in to an Instagram account." | https://help.instagram.com/581066165581870/ | [OFFICIAL], text via search index |
| Instagram Terms of Use | "You can't attempt to buy, sell, or transfer any aspect of your account (including your username) or solicit, collect, or use login credentials or badges of other users." | same | [OFFICIAL], text via search index |
| Meta Community Standards, Spam | "Posting, sharing, engaging with content or creating accounts, Groups, Pages, Events or other assets, either manually or automatically, at very high frequencies." | https://transparency.meta.com/policies/community-standards/spam/ | [OFFICIAL] |
| same | "Attempting to or successfully selling, buying, or exchanging platform assets, such as accounts, groups, pages, etc." | same | [OFFICIAL] |
| Meta Platform Terms 1.b | "To use Platform (including to Process any Platform Data), you agree to these Platform Terms ("Terms"), as well as all other applicable terms and policies." (the linked list includes the Instagram Terms of Use) | https://developers.facebook.com/terms/dfc_platform_terms/ | [OFFICIAL] |
| Developer Policies 5.2 | "Don't contact people in Messenger or Instagram Messaging unless you...have obtained legally sufficient consent, permission, and/or opt-in." | https://developers.facebook.com/devpolicy/ | [OFFICIAL] |
| Developer Policies 1 | "Don't confuse, deceive, defraud, mislead, spam or surprise anyone." | same | [OFFICIAL] |

---

## 3. Competitors, briefly

Many of these were checked only at the vendor's own page. Treat every limit as a marketing claim.

| Tool | Mechanism | Pricing | Claimed limits | Notes | Source | Tag |
|---|---|---|---|---|---|---|
| ColdDMs | Chrome extension, own session and IP | $99, $174 plus, $999 per month | 100 per day per account | Warmup workflow, human reviewed account setup | https://www.colddms.com/ | [VENDOR] |
| ColdDMs Pro (different company) | Extension inside AdsPower on a VPS, proxy per account | Hidden, sold through strategy call | 20 to 50 per day to start, 100 plus later | "99.8% Safe accounts" claim | https://app.colddmspro.com/ | [VENDOR] |
| InstaDM (instadm.ai) | Cloud, multi login, native proxy integration | $29, $59, $129 per month billed annually; done for you tier | 75, 375, unlimited DMs daily | "48M+ DMs delivered" | https://www.instadm.ai/ | [VENDOR] |
| DMpro | Now positions as official API automation, plus a separate Chrome extension for bulk cold outreach from CSV | Free 250 conversations; Pro $15 to $19 per month; Enterprise from about $499 | Conversations metered, not DMs | Sources conflict: a competitor describes it as a managed service at $50 per month with Trustpilot 2.2 out of 5 and refund complaints; its own site describes an API product | https://www.dmpro.app/ and https://coldabry.com/blog/best-instagram-cold-dm-tools/ | [VENDOR] versus [COMPETITOR] |
| InstaOutreach | Chrome extension, own IP, no proxies | $29 per month first account, $14.50 each additional, up to 20 | Not stated on site; competitor says about 70 per day | Candid: "Automation carries risk", automate only "accounts you can afford to lose" | https://instaoutreach.com/ | [VENDOR] |
| DM Faster | Chrome extension; browser must stay open; standalone lead extractor | 99 EUR per month per sender, 10,000 lead credits | Not stated | 3 day trial | https://dmfaster.com/colddms-alternative | [VENDOR] |
| AutoReacher | Cloud | From $39 per month | About 40 per day | Reddit praise traced to "one or two accounts posting near-identical promotional copy" | https://coldabry.com/blog/best-instagram-cold-dm-tools/ | [COMPETITOR] |
| InstantFlow | Cloud | $67 per month | 60 per day | Account suspension reported | same | [COMPETITOR] |
| IGdm Pro | Desktop app (Windows, macOS, Linux), runs locally; underlying method not disclosed | $8.99, $19.99, $29.99 per month | "up to 1000 users" per bulk send; no daily guidance | Has "Account Warmup Automation"; competitor flags shared IP across accounts | https://igdm.me/ and https://igdm.me/alternative-to-colddms | [VENDOR] |
| Inflact (ex Ingramer) | Cloud, stored credentials | About $37.83 per month (Basic, annual) to $84 per month (Pro) | Auto replies "unlimited", recommends under 1,000 per day; up to 10 accounts | Follower centric; cold only by uploaded list; competitor reports action blocks and a need to disable 2FA | https://inflact.com/direct-messages/ (via search) and Coldabry | [VENDOR] and [COMPETITOR] |
| ReachOwl | Sources conflict: its safety page says browser extension in "your real session", "No shared IPs, No cloud bots"; deal listings say it moved to a cloud app with the extension only for audience scanning | $29, $99, $199 per month; lifetime deals $99 to $499 | User set daily limits, no numbers | "no automation can be 100% risk-free" | https://reachowl.com/safety and https://reachowl.com/pricing | [VENDOR] |
| Socinator | Multi network automation suite (Dominator House lineage, historically Windows desktop; some directories now call it cloud) | Directories disagree: $10 to $50 per month, or $36 to $175 per month | Not stated | | https://www.capterra.com/p/199281/Socinator/ | [third party directory] |
| GramDominator | Instagram bot (desktop lineage), scraper included | $9.95 per month or $79.95 per year, unlimited accounts | Not stated | Old product; listings still live | https://www.gramdominator.com/ and https://sourceforge.net/software/product/GramDominator/ | [third party directory] |
| Jarvee | Windows emulator and private API suite | Was about $30 to $70 per month | n/a | Shut down in 2023; current "Jarvee" sites described as scams | https://www.shadowphone.io/blog/best-jarvee-alternative-2026 | [VENDOR] |
| ShadowPhone (Jarvee successor type) | Real Pixel phones with GrapheneOS profiles | From $97 per month plus phones and connectivity | Not stated | Phone farm category | same | [VENDOR] |
| IG DM Bot, IG DM Sender, Auto DM Ninja | Chrome extensions | $12.95 per month; $12.99 per month; $49 one time | "unlimited"; Auto DM Ninja "up to 50 DMs per account per day" | Low end of the market | https://igdmbot.inforld.com/ and https://ninjatool.gumroad.com/l/AutoDMninjapro (via search) | [VENDOR] |
| CUCOMM | Not found. cucomm.net did not resolve and search returned nothing | | | | | [UNVERIFIED] |
| Meetsta | Not found in search | | | | | [UNVERIFIED] |
| Skylead type | Skylead is a LinkedIn and email sequencer, not an Instagram tool. Not researched further | | | | | Out of scope |
| "Instantly style" IG tools | ColdDMs is itself described this way: "Comparable to Instantly.ai but for Instagram." | | | | https://www.colddms.com/ | [ANECDOTE] |

Category pattern: extension tools charge $29 to $99 per account and advertise 50 to 100 per day; cloud tools advertise higher volume with bundled proxies; the cheapest tools advertise "unlimited". Nobody publishes ban rates. ColdDMs is the most expensive single account extension found.

---

## 4. Risk to a business that also holds an official Meta app

### 4.1 What the contracts say

| Point | Clause | Source | Tag |
|---|---|---|---|
| A developer agrees to all Meta terms, not only the Platform Terms | 1.b: "you agree to these Platform Terms ("Terms"), as well as all other applicable terms and policies." | https://developers.facebook.com/terms/dfc_platform_terms/ (last updated 3 Feb 2026) | [OFFICIAL] |
| Breach of any applicable term can cost the app or account | 1.e: "If you fail to comply with these Terms or any other applicable terms or policies, we may suspend or terminate your App or account, as described below." | same | [OFFICIAL] |
| Enforcement trigger is belief, at Meta's sole discretion, and covers "you" as well as the app | 7.e.i: "We may take enforcement action against you and your App if we believe, in our sole discretion, that: ... You or your App has violated or may have violated these Terms or any other applicable terms or policies or is negatively impacting Platform, other Meta Products, Platform Data, or people who use Meta Products" | same | [OFFICIAL] |
| Enforcement can reach beyond the app | 7.e.ii: "It can include suspending or permanently removing your App(s) and account, removing your access and your App's access to Platform, requiring that you stop Processing and delete Platform Data, terminating our agreements with you, or any other action that we consider to be appropriate, including terminating other agreements with you or your ability to use Meta Products." "with or without notice". "Enforcement can be both automated and manual." | same | [OFFICIAL] |
| Evasion by creating new apps is itself a violation | 7.e.i.3: "You have created or maintained App(s) to circumvent, or attempt to circumvent, our enforcement actions" | same | [OFFICIAL] |
| Audit rights | 7.c: audits no more than once a calendar year unless a necessary condition exists, on at least 10 business days' written notice; 7.d: Meta may demand written certifications of compliance | same | [OFFICIAL] (wording summarised from the localised page) |
| Who "Developer" is | "The person or entity that creates or operates an App." | same, glossary | [OFFICIAL] |
| Affiliates | The enforcement clauses do not use the word "affiliates" or "common control". "You" is the contracting person or entity | same | [OFFICIAL], absence noted |
| Messaging apps need consent | Developer Policies 5.2: "Don't contact people in Messenger or Instagram Messaging unless you...have obtained legally sufficient consent, permission, and/or opt-in." | https://developers.facebook.com/devpolicy/ (last updated 3 Feb 2026) | [OFFICIAL] |
| Tech providers answer for their customers | 5.3: "Ensure your agreements with entities do not conflict with, and that entities agree to, all applicable Meta terms and policies." The localised page also rendered a line meaning "Do not facilitate or encourage any violation of our policies"; the English fetch did not return that line, so treat the exact English wording as unconfirmed | same | [OFFICIAL], one line partly UNVERIFIED |
| Negative feedback | 5.4: "Your messaging or calling experience should not receive excessive negative feedback." | same | [OFFICIAL] |
| General | 1: "Don't confuse, deceive, defraud, mislead, spam or surprise anyone." | same | [OFFICIAL] |

### 4.2 What that means

1. Same Instagram account. Running an unofficial sender on an Instagram professional account that is also connected to our official app is the highest risk configuration. An action block or disablement on that account removes the asset the API integration depends on. If cold DMs draw blocks and reports, that negative feedback lands on the same account whose messaging quality Meta scores under policy 5.4. [analysis from official text]
2. Same company. The Platform Terms let Meta act against "you and your App" where "You ... has violated or may have violated ... any other applicable terms or policies". Instagram's Terms prohibit automated access "regardless of whether such automated access or collection is undertaken while logged-in". A developer entity that itself operates, or distributes to its customers, an extension that automates instagram.com is therefore in breach of "other applicable terms" as "you". The contract allows app suspension on that basis. Whether Meta would connect the two is a detection question, not a permission question. [analysis from official text]
3. Building and distributing our own cold outreach extension is the precedent pattern. Meta's lawsuits targeted vendors of automation software and Chrome extensions (MGP25, Massroot8, BrandTotal, Oink and Stuff), and each began with account disablement and a cease and desist. A company that holds App Review approval, business verification and a named legal entity is far easier to identify and far more exposed than an anonymous extension seller. [analysis; cases in section 2.7]
4. App Review and business verification. App Review asks for a screencast and a description of how each permission is used. An unofficial cold DM module does not need to be declared for the API permissions, but 7.d lets Meta demand compliance certifications, and a false certification is a further breach. [analysis from official text]
5. Tech Provider position. If our customers connect their Instagram accounts to our official app and also run our cold outreach extension on those accounts, policy 5.3 applies: we must ensure those customers "agree to, all applicable Meta terms and policies". Shipping them a tool that breaks those terms is hard to reconcile with that duty. [analysis from official text]

### 4.3 Reported cases

| Case | What happened | Relevance | Source | Tag |
|---|---|---|---|---|
| The OG App (Un1feed), 2022 | Developers built an ad free Instagram client using reverse engineered access. Meta removed the app and, the developers say, disabled the personal Facebook and Instagram accounts of the staff, which "were not linked to the app" | Shows Meta enforcing against people behind an unauthorised client, across personal assets | https://www.vice.com/en/article/these-developers-fixed-instagram-facebook-banned-their-accounts/ | [NEWS] |
| MGP25, Massroot8, BrandTotal, Oink and Stuff | Account disablement, cease and desist, then litigation against vendors | Vendor level precedent | section 2.7 | [OFFICIAL] and [NEWS] |
| Hacker News "Meta developer account suspended", 2025 | Developer account restricted without warning after a country change; no appeal route. A commenter: "I left a company and removed myself from the meta account which triggered the deletion of our whole app. Impossible to recover." Others report the Instagram account disabled while the Business account and Pages stayed up | Shows developer assets hang off individual admin accounts and that enforcement and recovery are opaque. It does not show unofficial automation causing app loss | https://news.ycombinator.com/item?id=44363262 | [ANECDOTE] |
| Vendor claims of linked account sweeps, 2026 | "first the main account gets banned, and after some time other accounts connected to it also start getting blocked", linked "through shared devices, Business Managers, and Facebook Pages" | Directionally relevant, no evidence offered | https://www.pilotdm.com/blog/instagram-account-ban-2026-what-is-happening-and-how-to-stay-safe | [VENDOR, UNVERIFIED] |

Not found: any documented case where a company lost Instagram messaging API access or business verification specifically because it also ran browser automation on Instagram. The risk is contractually clear and practically undocumented. Structural point from the anecdotes: a developer app is administered by personal Facebook accounts, so a disabled admin account can strand the app even without any enforcement against the app itself. Keep at least two admins whose personal accounts never touch unofficial tooling.

---

## 5. Legal and compliance for cold DMs to individuals (factual summary, not legal advice)

### 5.1 UK

- PECR covers social DMs. The definition of electronic mail is "any text, voice, sound or image message sent over a public electronic communications network which can be stored in the network or in the recipient's terminal equipment until it is collected by the recipient". ICO guidance says this covers "direct messaging on social media". [OFFICIAL] https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- Rule: unsolicited marketing by electronic mail to individual subscribers needs prior consent, unless the soft opt in applies. Soft opt in needs an existing customer relationship, similar products, and an opt out at collection and in every message. It "does not apply to prospective customers, bought lists". [OFFICIAL] same URL
- Individual subscribers include sole traders and some partnerships. Corporate subscribers (companies, LLPs) are outside the consent rule, but the sender must still identify itself and give a valid opt out address. [OFFICIAL] same URL and https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/
- Practical effect: a cold marketing DM to a coach, creator, freelancer or other sole trader on Instagram needs consent that cold outreach by definition lacks. The corporate exemption is hard to rely on because an Instagram handle does not tell you whether the person is a limited company.
- UK GDPR applies separately to scraped handles, names and profile data. Scraping needs a lawful basis, transparency information (Article 14) and respect for the right to object to direct marketing (Article 21). [OFFICIAL framework] https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/plan-direct-marketing/
- Penalties: PECR fines were historically capped at 500,000 GBP; the Data (Use and Access) Act 2025 raises PECR penalties to UK GDPR levels. This was not verified at a primary source in this pass. [UNVERIFIED]

### 5.2 EU

- ePrivacy Directive 2002/58/EC Article 13(1): the use of "electronic mail for the purposes of direct marketing may be allowed only in respect of subscribers or users who have given their prior consent". Article 13(2) gives a soft opt in for existing customers. Member states decide how far legal persons are protected, so B2B treatment varies by country. [OFFICIAL text, read through a reproduction] https://lexparency.org/eu/32002L0058/ART_13/
- The Directive's definition of electronic mail is the same technology neutral definition the UK uses, which is why regulators treat social DMs as covered.
- EDPB Guidelines 8/2020 on targeting social media users reference Article 13 where contact details are used for direct marketing. A search summary attributed to these guidelines a sentence that Article 13 applies to adverts sent by "direct message"; that sentence was not found in the final adopted text checked here. [OFFICIAL document, specific quote UNVERIFIED] https://www.edpb.europa.eu/system/files/2021-04/edpb_guidelines_082020_on_the_targeting_of_social_media_users_en.pdf
- GDPR applies to scraped profile data as in the UK, with fines up to 20 million EUR or 4% of worldwide turnover.

### 5.3 US

- CAN-SPAM covers "any electronic mail message the primary purpose of which is the commercial advertisement or promotion of a commercial product or service", and "makes no exception for business-to-business email". It is an opt out regime: no consent needed, but no false headers, no deceptive subject lines, identify the message as an ad, include a physical address, give and honour an opt out. Penalties "up to $53,088" per message. [OFFICIAL] https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Scope for social DMs: federal district courts have held social network messages can be "electronic mail messages" (Facebook v. MaxBounty, N.D. Cal. 2011; MySpace v. Wallace; MySpace v. The Globe.com). These are district court rulings in suits brought by the platforms; the FTC has not issued DM specific rules. [LEGAL-COMMENTARY] https://www.hoganlovells.com/en/publications/can-spam-held-to-apply-to-social-media-messaging and https://www.dmlp.org/blog/2011/can-can-spam-apply-social-media-yes-it-can
- Practical effect: a cold Instagram DM cannot carry a physical address and unsubscribe mechanism in any natural way, so strict compliance is awkward if the Act applies.
- Platform claims: the precedent cases were brought by platforms using CAN-SPAM, the Computer Fraud and Abuse Act and breach of contract. The realistic US exposure is the platform, not a regulator. [NEWS and OFFICIAL] section 2.7
- State privacy laws (for example CCPA) apply to scraped personal data above their thresholds. Not researched in depth.

### 5.4 Platform terms

Automated sending and automated collection breach Instagram's Terms regardless of jurisdiction (section 2.8). Buying aged accounts breaches both the Terms and the spam policy. For official API messaging, Developer Policy 5.2 imposes its own consent requirement on top of the law.

---

## 6. Legitimate ways to start conversations at scale inside Meta's rules

Core constraint: with the official API the business cannot send the first message. "Your app has 24 hours to respond to any message sent from an Instagram user". [OFFICIAL] https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api. Every legitimate mechanism is a way to get the user to act first.

| Mechanism | How it opens a conversation | Official limits | Volume it supports | Source | Tag |
|---|---|---|---|---|---|
| Comment to DM (Private Replies API) | User comments on a post, reel, ad or live. The app sends one private reply. "Only when the Instagram user responds to the private message can you continue the conversation within the 24-hour messaging window." | "Only one message can be sent"; "within 7 days" of the comment; live comments only during the broadcast | "750 calls per hour per Instagram professional account for private replies to comments on Instagram posts and reels", which is up to 18,000 per day per account; "100 calls per second" for Live comments | https://developers.facebook.com/docs/messenger-platform/instagram/features/private-replies and https://developers.facebook.com/docs/graph-api/overview/rate-limiting | [OFFICIAL] |
| Story replies and story mentions | A story reply is an inbound DM, and a mention arrives as a messaging webhook; either opens the 24h window | Standard 24h window | Bounded by story reach, then Send API limits | Messaging API docs above. The specific story trigger wording was not retrieved in this pass | [OFFICIAL], detail partly UNVERIFIED |
| Inbound DM with keyword automation | User sends any DM; automation replies within 24h | 24h window; Human Agent tag extends to 7 days for human replies only | Send API: "100 calls per second per Instagram professional account" for text and links, "10 calls per second" for audio or video. A third party reads Meta's other rate page as 300 per second for text; the figure depends on the API path | https://developers.facebook.com/docs/graph-api/overview/rate-limiting; https://www.reachlee.co/guides/instagram-dm-limits/ | [OFFICIAL]; disagreement noted |
| Click to Instagram Direct ads | Ad click opens a DM thread; the user sends the first message (often a pre filled or ice breaker message) | Standard window "lasts 24 hours, except when the interaction is a person clicking on your Click-to-Messenger or Click-to-Instagram-Direct ad and then sending you a message; in this case it may last up to 7 days." Promotional content is allowed inside the window | Limited by ad budget only. This is the one legitimate mechanism that reaches cold audiences at chosen volume | https://developers.facebook.com/devpolicy/ section 5.6.1; https://www.spurnow.com/en/blogs/instagram-messenger-ads-7-day-messaging-window | [OFFICIAL] policy; 28 Sep 2026 date now [OFFICIAL] from the changelog date line (layout reading is inference), matching the [VENDOR] date |
| Ice Breakers | Up to four preset questions on first open of the chat; a tap sends a postback | "a maximum of 4 questions"; "currently not available on desktop" | Converts profile and link traffic; no cap of its own | https://developers.facebook.com/docs/messenger-platform/instagram/features/ice-breakers | [OFFICIAL] |
| ig.me links | `https://ig.me/m/<USERNAME>?ref=<REF_PARAM>` opens a 1:1 thread. Ref up to 2,083 characters. Webhook carries the ref with source SHORTLINKS. On an existing thread, "This action resets the 24-hour window for standard messaging" | "ig.me links are currently not supported on Instagram Web." | Unlimited placement: bio, email, site, other platforms, cold email, QR | https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/ig-me-links | [OFFICIAL] |
| QR codes | A QR that encodes an ig.me link with a ref parameter; same mechanics | Same as ig.me | Offline and event traffic | Derived from the ig.me doc | [OFFICIAL] basis |
| Marketing messages, recurring notifications | Opted in users could be sent messages outside the 24h window | The Messenger version was retired on 10 Feb 2026 and replaced by the Marketing Messages API for Messenger, with one send per subscriber every 48 hours. Meta's Instagram specific doc URL returned 404 in this pass, so current Instagram availability is unconfirmed. Developer Policy 5.6.2 says: "Use the Marketing Messages API, if you want to send marketing or promotional content." | Opt in list size, at most one send per 48h per subscriber on Messenger | https://www.socialmediatoday.com/news/metas-recurring-marketing-messages-api-will-end-this-week/811668/; https://developers.facebook.com/devpolicy/ | [NEWS] and [OFFICIAL]; Instagram status UNVERIFIED |
| Message tags | Sending outside the window for narrow purposes | Three tags removed 27 Apr 2026. "Do not use Message Tags or utility messages to send promotional content or other advertising, marketing, or solicitations." Human Agent tag: human support replies within 7 days | Not a prospecting tool | Messenger Platform changelog; Developer Policies 5.6.2 | [OFFICIAL] |
| Manual, human sent cold DMs from the app | A person types and sends | No published cap; subject to the same spam policy on frequency and repetition; one text only message to a non follower until accepted | Low tens per day per account by community consensus (section 2.3) | sections 2.3 and 2.6 | [OFFICIAL] rule, [VENDOR] numbers |

The "200 automated DMs per hour" figure quoted by API tool vendors is not a Meta limit. "Meta's developer documentation lists no daily cap for automation and no hourly cap on ordinary sends". The vendor that popularised the figure retracted it. [VENDOR] https://www.blotato.com/blog/instagram-dm-limits and https://sumgenius.ai/blog/instagram-dm-bot-ban-wave-2026/

What this adds up to for volume: the legitimate channels are capped by attention (comments, story replies, ad clicks), not by Meta's rate limits. Private replies alone allow up to 750 per hour per account. A cold outreach extension at 30 to 100 DMs per day per account is, on volume alone, a small fraction of what one moderately successful reel with a comment trigger or a modest Click to Instagram Direct budget can open.

---

## 7. Disagreements between sources, in one place

| Topic | Positions |
|---|---|
| Safe cold DMs per day, aged account | 20 to 35 (forum operators, Praecora, Celestia, ColdAccs) versus 50 to 100 (InstantDM, usecarly, ColdDMs) versus 100 to 150 (DMpro blog, Meta Verified claims). No official number |
| Is extension emulation safe? | ColdDMs: "no more dangerous than manually sending messages yourself", "In general, it is SAFE". Competitor Coldabry: "High" ban risk. API vendors: "11 to 17% ban risk per quarter" for extensions (no data shown). ColdDMs' own Terms: use "is therefore solely a risk taken by the user" |
| ColdDMs has no warmup | Coldabry (Jul 2026) says none. The current app bundle shows a full setup review and warmup ramp |
| ColdDMs refunds | Landing page: 100% refund if 1,000 messages sent in 30 days with no client. Terms: fees "not subject to any refund" |
| ColdDMs user count | Landing: "1000s of Users". Carson: "+3000 users". Chrome Web Store: 1,000 |
| ColdDMs reviews | Landing: 74 reviews. Store: 91 ratings |
| `feedback_required` cooldown | 30 minutes to 48 hours (proxy vendors) versus 6 hours minimum and 1 to 3 days for repeats (instagrapi guide) |
| API send rate for text | 100 per second (Meta rate limit page as fetched here) versus 300 per second (Reachlee reading of Meta docs). Depends on API path |
| 200 DMs per hour API cap | Stated as fact by many API tool vendors. Not in Meta docs; retracted by the vendor that popularised it |
| DMpro | Own site: official API product from $15 per month. Competitor: managed service, Trustpilot 2.2 |
| ReachOwl mechanism | Own safety page: runs in your real browser session. Deal listings: moved to cloud |
| Does running unofficial tooling endanger an official app? | Contract: yes, permitted at Meta's sole discretion. Reported cases: none found for this exact scenario |

---

## 8. Could not verify

1. ColdDMs' actual warmup numbers (starting cap, ramp step, ceiling) and whether Pro really reaches 100 per day. They are served after login.
2. Any user report of bans, blocks or refunds with ColdDMs. Reddit was not reachable; Trustpilot has no page; BlackHatWorld blocked direct fetch.
3. The text of the sceptical Chrome Web Store review mentioned by Extpose.
4. Why ColdDMs announced a "grand reopening" on 30 Sep 2026, and whether ownership or management changed (a new named presenter, Jemon Thomas, appears from Aug 2026 while older testimonials name Carson).
5. ColdDMs' legal entity, hosting location, data handling of Instagram cookies and scraped leads.
6. ColdDMs affiliate programme terms (only the Rewardful script was seen).
7. Extension version history before 6.14.8.
8. The claimed May 2026 "Account Integrity" wave and the claimed 7 day then 30 day restriction ladder. Vendor claims without sources.
9. The exact English wording of the Developer Policy line on not facilitating policy violations.
10. Whether Marketing Messages are currently available for Instagram (Meta's doc URL returned 404).
11. UK PECR penalty uplift under the Data (Use and Access) Act 2025, and the EDPB "direct message" sentence.
12. CUCOMM and Meetsta: no trace found. Skylead is not an Instagram tool.
13. Instagram Terms of Use were quoted from the search index because help.instagram.com did not render to the fetcher. The wording matches multiple independent citations.
