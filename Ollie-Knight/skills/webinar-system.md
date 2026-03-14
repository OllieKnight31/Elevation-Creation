---
name: webinar-system
description: Use this skill when the user wants to deploy a full webinar funnel tracking system for a client. Triggers on phrases like "/webinar-system for [client]", "deploy webinar tracker", "set up webinar system", "build a webinar tracking dashboard", "deploy webinar funnel", "create a webinar funnel system", "webinar system for [client name]", "set up tracking for a webinar", or "deploy the full webinar funnel". This deploys a complete system — Google Sheet, Vercel API + Dashboard, Next.js funnel pages (registration + thank you), WebinarJam integration, Calendly webhook, Meta Ads sync, UTM tracking (organic vs paid), campaign windows, and full email/SMS sequence templates for GoHighLevel.
version: 1.0.0
---

# Webinar System — Full Deployment Skill

You are a senior full-stack engineer and marketing automation architect. You deploy complete webinar funnel tracking systems from scratch — Google Sheets backend, Vercel serverless API, Next.js dashboard + funnel pages, and all webhook integrations. Every system you deploy is production-ready, battle-tested, and tracks every metric from ad impression to closed sale.

**Core Stack (Fixed):**
- **Hosting**: Vercel (Next.js App Router)
- **Database**: Google Sheets API v4 (service account write, public gviz read)
- **Webinar**: WebinarJam API
- **Calendar**: Calendly API (webhook-based)
- **Ads**: Meta Graph API v25.0
- **CRM/Email/SMS**: GoHighLevel
- **Tracking**: GA4 + Meta Pixel + UTM attribution (sessionStorage-based)
- **Funnel Pages**: Next.js (hosted on Vercel, NOT ClickFunnels)

**Reference Implementation:** `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/vercel-deploy/`

---

## PHASE 0 — HARD GATE (Collect Everything Upfront)

Before doing ANYTHING, collect ALL of the following using AskUserQuestion. Group into 2-3 questions max.

### Question 1 — Client & Webinar Details

**Required:**
- Client name (e.g., "Carlos Alesandro")
- Client slug / project ID (e.g., "carlos" — suggest one based on name)
- Business name (e.g., "Branding Domination")
- Webinar title (e.g., "Branded Ecommerce Masterclass")
- Webinar date and time with timezone (e.g., "March 11, 2026 at 7:00 PM CET")
- Currency (e.g., "EUR", "USD", "GBP")

**Required — Offer Details:**
- Offer tiers (name + price for each, e.g., "Five Figure: €1,093.50, Six Figure: €3,000")
- Primary CTA (e.g., "Book Your Free Strategy Call")
- Calendly event URL or slug (e.g., "calendly.com/branding-domination1/strategy-session-1-clone")
- Sales rep name (who takes the calls, e.g., "Raul")

**Optional (have defaults):**
- Brand colours (default: dark theme with `#00d4ff` accent)
- Domain (default: deploy to `.vercel.app` — custom domain added later)
- Google Fonts (default: Inter + Plus Jakarta Sans)

### Question 2 — API Credentials

Collect ALL credentials upfront. Validate each one before proceeding.

**Required (system will not deploy without these):**
- `GOOGLE_SERVICE_ACCOUNT_KEY` — Full JSON of the Google service account with Sheets API enabled
- `WEBINARJAM_API_KEY` — WebinarJam API key
- `WEBINARJAM_WEBINAR_ID` — WebinarJam webinar ID (numeric)

**Required for full functionality (deploy without, flag as TODO):**
- `META_ACCESS_TOKEN` — Meta user/system token with `ads_read` permission
- `META_AD_ACCOUNT_ID` — Meta Ad Account ID (e.g., `act_522825340525514`)
- `META_PIXEL_ID` — Meta Pixel ID for conversion tracking
- `GA4_MEASUREMENT_ID` — Google Analytics 4 Measurement ID (e.g., `G-XXXXXXX`)
- `CALENDLY_PAT` — Calendly Personal Access Token (for webhook validation)

### Validation Gate

After collecting credentials, validate each one:

```bash
# Test WebinarJam API key
curl -s -X POST "https://api.webinarjam.com/webinarjam/webinar" \
  -d "api_key={{WEBINARJAM_API_KEY}}&webinar_id={{WEBINARJAM_WEBINAR_ID}}" | head -c 200

# Test Google Service Account (parse JSON, check client_email exists)
echo '{{GOOGLE_SERVICE_ACCOUNT_KEY}}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'SA: {d[\"client_email\"]}')"

# Test Meta token (if provided)
curl -s "https://graph.facebook.com/v25.0/me?access_token={{META_ACCESS_TOKEN}}" | head -c 200
```

If any REQUIRED credential fails validation, STOP and ask the user to fix it. If optional credentials fail, flag them as TODO and continue.

---

## PHASE 1 — CREATE GOOGLE SHEET

Create a fresh Google Sheet with all tracking tabs using the Google Sheets API.

### Step 1.1: Create the Sheet

Use the service account credentials to create a new spreadsheet with the Google Sheets API. Reference the implementation in:
```
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/build-sheets.js
```

Create these tabs (in order):

| # | Tab Name | Purpose | Key Columns |
|---|----------|---------|-------------|
| 1 | DASHBOARD | Overview KPIs | 12 top-line metrics |
| 2 | AD METRICS | Campaign-level ad data | Date, Platform, Campaign, Impressions, Clicks, Spend, Leads, CPR, CPC, CTR |
| 3 | FUNNEL FLOW | Master data (28 cols) | Date, Name, Status, Impressions, Clicks, LP Views, Regs, Attendees, Show%, Stay to Pitch, CTA Clicks, Calls Booked, Buyers, Spend, Revenue |
| 4 | WEBINAR SESSIONS | Session detail | Date, Session, Regs, Attendees, Show%, Viewers, Avg Watch Time |
| 5 | EMAIL METRICS | Email sequence stats | Email Name, Date, Recipients, Opens, CTR |
| 6 | SMS METRICS | SMS delivery/engagement | Message, Date, Recipients, Delivered, Opens, Clicks |
| 7 | REVENUE METRICS | Sales by tier | Date, Tier, Sales, Revenue, LTV |
| 8 | BENCHMARKS | Read-only reference | Industry standards |
| 9 | DATA SOURCES | Webhook event log | Timestamp, Source, Event, Payload |
| 10 | CAMPAIGNS | Campaign windows | Name, Start, End, Webinar Date, Active, Created |
| 11 | UTM ATTRIBUTION | UTM tracking per registrant | Timestamp, Email, Source, UTM params |

### Step 1.2: Format the Sheet

- Blue headers (#1a73e8), white text, bold
- Tab colours: Dashboard=blue, Ad Metrics=red, Funnel Flow=green, Sessions=purple, Email=orange, SMS=teal, Revenue=gold, Benchmarks=grey, Data Sources=brown, Campaigns=navy, UTM=cyan
- Frozen header rows
- Column widths optimized for content
- FUNNEL FLOW formulas: auto-calculate Reg Rate (=H/F), Show% (=P/H), Stay% (=S/P), CTA Rate (=U/S), Call Show% (=X/W), ROAS (=AB/AA)
- BENCHMARKS tab pre-populated with industry standards:

| Metric | Poor | Average | Good | Elite |
|--------|------|---------|------|-------|
| Registration Rate (cold) | <15% | 20-30% | 30-40% | >40% |
| Show-up Rate | <25% | 35-45% | 45-55% | >55% |
| Stay to Pitch | <40% | 50-60% | 60-75% | >75% |
| CTA Click Rate | <3% | 5-10% | 10-15% | >15% |
| Call Book Rate | <3% | 5-10% | 10-15% | >15% |
| Call Show Rate | <50% | 60-70% | 70-80% | >80% |
| Close Rate | <15% | 20-30% | 30-40% | >40% |
| CPR (Facebook) | >$20 | $10-15 | $5-10 | <$5 |

### Step 1.3: Share the Sheet

- Share with the service account email (editor)
- Make the sheet publicly viewable (anyone with link can view) — needed for gviz read fallback
- Record the SPREADSHEET_ID

### Step 1.4: Create Initial Campaign

Write the first campaign row:
```
Name: "{{WEBINAR_TITLE}}"
Start: {{CAMPAIGN_START}} (default: 7 days before webinar)
End: {{CAMPAIGN_END}} (default: 7 days after webinar)
Webinar Date: {{WEBINAR_DATE}}
Active: TRUE
Created: today's date
```

---

## PHASE 2 — BUILD NEXT.JS PROJECT

Create the full Next.js application with API routes, dashboard, and funnel pages.

### Step 2.1: Initialize Project

```bash
mkdir -p /Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/webinar-system
cd /Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/webinar-system
```

### Step 2.2: Create Project Structure

```
{{CLIENT_SLUG}}-webinar-system/
├── api/
│   └── index.js                 # Vercel serverless API (all endpoints)
├── public/
│   └── index.html               # Dashboard (self-contained HTML)
├── pages/
│   ├── register.html            # Paid registration page
│   ├── register-organic.html    # Organic registration page
│   ├── booked.html              # Paid thank you page
│   └── booked-organic.html      # Organic thank you page
├── package.json
├── vercel.json
└── .env.local
```

### Step 2.3: Generate API (`api/index.js`)

Copy the reference implementation from:
```
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/vercel-deploy/api/index.js
```

Replace ALL client-specific values:

| Variable | Replace With |
|----------|-------------|
| `SPREADSHEET_ID` | `'{{NEW_SHEET_ID}}'` |
| `act_522825340525514` | `'{{META_AD_ACCOUNT_ID}}'` |
| `strategy-session-1-clone` | `'{{CALENDLY_EVENT_SLUG}}'` |

The API must include ALL these endpoints:

**GET endpoints:**
- `?action=ping` — Health check
- `?action=dashboard_data` — Full dashboard data with campaign filtering
- `?action=funnel_summary` — Aggregated KPIs and rates
- `?action=test_connections` — Validate all external integrations
- `?action=sync_webinarjam` — Pull registrants/attendees from WJ API
- `?action=sync_meta` — Pull ad metrics from Meta Graph API
- `?action=campaigns` — List all campaign windows

**POST endpoints:**
- `?source=webinarjam` — Receive WJ registration/attendance events
- `?source=calendly` — Receive call bookings/cancellations
- `?source=meta` — Receive ad campaign data
- `?source=manual` — Manual data entry
- `?source=campaign_update` — Create/activate/delete campaigns
- `?source=utm` — Receive UTM attribution data from funnel pages

**Key functions that MUST be included:**
- `readSheetRange(tab, range)` — Read via gviz/tq (public, no auth)
- `writeSheetRange(tab, range, values)` — Write via Sheets API v4 (service account)
- `appendToSheet(tab, values)` — Append row to tab
- `buildSessions(rows, startDate, endDate)` — Parse FUNNEL FLOW rows into session objects
- `getUTMBreakdown(startDate, endDate)` — Aggregate UTM data with date filtering
- `syncWebinarJam()` — Pull all registrants/attendees, aggregate by schedule
- `syncMeta()` — Pull 30-day ad metrics from Meta Graph API
- `handleCalendlyWebhook(body)` — Increment/decrement calls booked
- `handleUTMAttribution(body)` — Write UTM row to UTM ATTRIBUTION tab
- `normaliseDate(val)` — Handle multiple date formats
- `getCampaigns()` — Read CAMPAIGNS tab
- `updateCampaign(action, data)` — Create/activate/delete campaigns

### Step 2.4: Generate Dashboard (`public/index.html`)

Copy the reference implementation from:
```
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/vercel-deploy/public/index.html
```

Replace ALL client-specific values:

| Variable | Replace With |
|----------|-------------|
| Dashboard title | `"{{BUSINESS_NAME}} — WEBINAR FUNNEL TRACKER"` |
| Spreadsheet URL | `https://docs.google.com/spreadsheets/d/{{NEW_SHEET_ID}}/edit` |
| All API endpoint URLs | Use relative `/api` paths (same Vercel deployment) |

The dashboard MUST include:
- Campaign selector dropdown with "All Time" option
- 12 KPI cards (spend, impressions, regs, attendees, calls, revenue, ROAS, etc.)
- Traffic Source Breakdown card (paid vs organic vs direct with split bar)
- Funnel visualization (multi-step conversion flow)
- Session table (sortable, per-session breakdown)
- UTM Attribution panel (expandable, shows by source/campaign/medium)
- Settings modal (connection status, endpoint config)
- Auto-refresh every 30 seconds
- 3-tier data fallback (Vercel API → localhost:3001 → direct gviz)
- Dark theme (matches reference implementation)

### Step 2.5: Generate Funnel Pages

Create 4 funnel pages as static HTML served by Vercel. Each page is self-contained with embedded CSS and JavaScript.

**Page 1: Paid Registration (`pages/register.html`)**
Reference: `/Users/oliverknight/Jarvis/Webinar Funnel/funnel/cf-ready/4-REGISTRATION-BODY.html`

Must include:
- Hero section with webinar title, date, host name
- 3-5 benefit bullets
- Registration form: First Name, Email, Phone (optional)
- Hidden UTM fields (auto-populated from URL params via JS)
- Form submission handler that:
  1. Validates inputs
  2. Stores registration data in localStorage (`bd_registration`)
  3. POSTs to WebinarJam via proxy (if enabled)
  4. Fires Meta Pixel `Lead` event
  5. Fires GA4 `generate_lead` event
  6. Redirects to `/booked`
- Countdown timer to webinar date
- Social proof / testimonials section
- FAQ section
- UTM tracking initialization (sessionStorage-based)
- `funnel_source` set to `'paid'`

**Page 2: Organic Registration (`pages/register-organic.html`)**
- Identical to paid registration EXCEPT:
- `funnel_source` set to `'organic'`
- Redirects to `/booked-organic`
- Different URL path for attribution

**Page 3: Paid Thank You (`pages/booked.html`)**
Reference: `/Users/oliverknight/Jarvis/Webinar Funnel/funnel/cf-ready/5-THANKYOU-BODY.html`

Must include:
- Confirmation message with registrant's name (from localStorage)
- Countdown timer to webinar
- "Add to Calendar" links (Google Calendar, Apple Calendar, Outlook)
- CTA: "Book Your Free Strategy Call" → Calendly link
- WhatsApp group link placeholder
- On page load:
  1. Read `bd_registration` from localStorage
  2. Read `bd_tracking` from sessionStorage (UTM data)
  3. Use `resolvedSource` pattern: `stored.funnel_source || 'paid'`
  4. POST UTM attribution to `/api?source=utm`
  5. Fire GA4 `generate_lead` event with `funnel_source` dimension
  6. Fire Meta Pixel `Lead` event

**Page 4: Organic Thank You (`pages/booked-organic.html`)**
- Identical to paid thank you EXCEPT:
- Fallback source is `'organic'` instead of `'paid'`

**CRITICAL — UTM Tracking Pattern (in ALL pages):**
```javascript
// resolvedSource pattern — NEVER override sessionStorage value with path detection
var stored = {};
try { stored = JSON.parse(sessionStorage.getItem('bd_tracking') || '{}'); } catch(e) {}
var resolvedSource = stored.funnel_source || '{{DEFAULT_SOURCE}}';
window.BD_TRACKING = stored;
window.BD_TRACKING.funnel_source = resolvedSource;
```

**Tracking code in ALL pages (GA4 + Meta Pixel):**
```html
<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id={{GA4_MEASUREMENT_ID}}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '{{GA4_MEASUREMENT_ID}}');
</script>

<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '{{META_PIXEL_ID}}');
fbq('track', 'PageView');
</script>
```

### Step 2.6: Generate `vercel.json`

```json
{
  "version": 2,
  "name": "{{CLIENT_SLUG}}-webinar-tracker",
  "functions": {
    "api/index.js": { "maxDuration": 30, "memory": 256 }
  },
  "rewrites": [
    { "source": "/api", "destination": "/api/index.js" },
    { "source": "/register", "destination": "/pages/register.html" },
    { "source": "/register-organic", "destination": "/pages/register-organic.html" },
    { "source": "/booked", "destination": "/pages/booked.html" },
    { "source": "/booked-organic", "destination": "/pages/booked-organic.html" }
  ],
  "headers": [
    {
      "source": "/api",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization" }
      ]
    }
  ]
}
```

### Step 2.7: Generate `package.json`

```json
{
  "name": "{{CLIENT_SLUG}}-webinar-tracker",
  "version": "1.0.0",
  "main": "api/index.js",
  "engines": { "node": "20.x" },
  "dependencies": { "googleapis": "^144.0.0" }
}
```

### Step 2.8: Generate `.env.local`

```env
GOOGLE_SERVICE_ACCOUNT_KEY={{SERVICE_ACCOUNT_JSON}}
WEBINARJAM_API_KEY={{WJ_API_KEY}}
WEBINARJAM_WEBINAR_ID={{WJ_WEBINAR_ID}}
META_ACCESS_TOKEN={{META_TOKEN}}
META_AD_ACCOUNT_ID={{META_AD_ACCOUNT}}
CALENDLY_PAT={{CALENDLY_TOKEN}}
```

---

## PHASE 3 — DEPLOY TO VERCEL

### Step 3.1: Install Dependencies

```bash
cd /Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/webinar-system
npm install
```

### Step 3.2: Deploy

```bash
npx vercel --prod
```

After first deploy, set environment variables:

```bash
# Set each env var (pipe to avoid shell escaping issues with JSON)
echo '{{SERVICE_ACCOUNT_JSON}}' | npx vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production
echo '{{WJ_API_KEY}}' | npx vercel env add WEBINARJAM_API_KEY production
echo '{{WJ_WEBINAR_ID}}' | npx vercel env add WEBINARJAM_WEBINAR_ID production

# Optional (if provided)
echo '{{META_TOKEN}}' | npx vercel env add META_ACCESS_TOKEN production
echo '{{META_AD_ACCOUNT}}' | npx vercel env add META_AD_ACCOUNT_ID production
echo '{{CALENDLY_TOKEN}}' | npx vercel env add CALENDLY_PAT production
```

Redeploy after setting env vars:
```bash
npx vercel --prod
```

### Step 3.3: Verify Deployment

Test all endpoints:

```bash
DEPLOY_URL="https://{{VERCEL_URL}}"

# Health check
curl -s "$DEPLOY_URL/api?action=ping"

# Dashboard data
curl -s "$DEPLOY_URL/api?action=dashboard_data" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Sessions: {len(d.get(\"sessions\",[]))}')"

# WebinarJam sync
curl -s "$DEPLOY_URL/api?action=sync_webinarjam" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'WJ: {d.get(\"status\")}')"

# Campaigns
curl -s "$DEPLOY_URL/api?action=campaigns" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Campaigns: {len(d.get(\"campaigns\",[]))}')"

# Test connections
curl -s "$DEPLOY_URL/api?action=test_connections"

# Test UTM POST
curl -s -X POST "$DEPLOY_URL/api?source=utm" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","funnel_source":"paid","utm_source":"test","page":"/booked"}'

# Verify funnel pages load
curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/register"
curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/register-organic"
curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/booked"
curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/booked-organic"
```

If any REQUIRED endpoint fails, diagnose and fix before proceeding.

---

## PHASE 4 — CONNECT WEBHOOKS

### Step 4.1: WebinarJam Webhook

WebinarJam sends events via Zapier rules (not direct webhook). Document the Zapier configuration:

**5 Zapier Rules to Create:**
1. **Registration** → POST `{{DEPLOY_URL}}/api?source=webinarjam` with `{ event: "registration", ... }`
2. **Attended** → POST with `{ event: "attended", ... }`
3. **No-show** → POST with `{ event: "no_show", ... }`
4. **Stayed 30+ min** → POST with `{ event: "stayed_30", ... }`
5. **Left <30 min** → POST with `{ event: "left_early", ... }`

### Step 4.2: Calendly Webhook

Create the Calendly webhook programmatically (if PAT provided):

```bash
curl -s -X POST "https://api.calendly.com/webhook_subscriptions" \
  -H "Authorization: Bearer {{CALENDLY_PAT}}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "{{DEPLOY_URL}}/api?source=calendly",
    "events": ["invitee.created", "invitee.canceled"],
    "organization": "{{CALENDLY_ORG_URI}}",
    "scope": "organization"
  }'
```

If PAT not provided, output manual webhook setup instructions.

### Step 4.3: Meta Ads

If META_ACCESS_TOKEN is provided:
- Test sync: `curl "{{DEPLOY_URL}}/api?action=sync_meta"`
- Note: Short-lived tokens expire in ~1-2 hours. For production, the client needs a System User token or long-lived token.
- Flag as TODO if token is short-lived.

---

## PHASE 5 — EMAIL & SMS SEQUENCES

Generate all sequence templates as markdown files. These are ready to paste into GoHighLevel.

Reference the existing sequence files:
```
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/pre-webinar-email-sequence.md
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/post-webinar-attendee-sequence.md
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/no-show-recovery-sequence.md
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/abandoned-cart-sequence.md
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/sms-sequence.md
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/whatsapp-broadcast-sequence.md
```

And the GHL blueprint:
```
/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/Connections/ghl-automation-blueprints.md
```

### Step 5.1: Generate Sequences (Launch 4 Parallel Agents)

**Agent 1 — Pre-Webinar Email + SMS Sequence:**
Generate 5 emails + 6 SMS messages for the pre-webinar period:
- Email 1: Registration confirmation (immediate) — welcome, what to expect, add to calendar
- Email 2: 24-hour reminder — student success story, reasons to attend
- Email 3: 1-hour reminder — "we start in 60 minutes"
- Email 4: 15-minute reminder — live link, final push
- Email 5: Post-webinar replay (1hr after) — replay link with 48hr expiry
- SMS 1: Registration confirmation (immediate)
- SMS 2: 24 hours before
- SMS 3: 2 hours before
- SMS 4: 30 minutes before
- SMS 5: 5 minutes before ("we're LIVE")
- SMS 6: Post-webinar replay

Variables to replace: `{{FIRST_NAME}}`, `{{WEBINAR_TITLE}}`, `{{WEBINAR_DATE}}`, `{{WEBINAR_TIME}}`, `{{LIVE_LINK}}`, `{{REPLAY_LINK}}`, `{{HOST_NAME}}`, `{{BUSINESS_NAME}}`, `{{CALENDLY_URL}}`

Save to: `/Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/sequences/pre-webinar-sequence.md`

**Agent 2 — Post-Webinar Attendee Sequence:**
Generate 6 emails + 3 SMS for attendees who didn't book a call:
- Email 1: Recap + CTA (30min post) — replay link, key takeaway, book call CTA
- Email 2: Value teaching (day 2) — expand on #1 problem from webinar
- Email 3: Case study/testimonial (day 3) — social proof + CTA
- Email 4: FAQ/objection handling (day 5) — address top 3 objections
- Email 5: Last chance urgency (day 7) — scarcity + CTA
- Email 6: Breakup email (day 9) — final attempt, soft close
- SMS 1: Replay available (30min post)
- SMS 2: Case study (day 3)
- SMS 3: Last chance (day 5)

Exit condition: If contact books call (tag: `call-booked`), exit sequence immediately.

Save to: `/Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/sequences/post-attendee-sequence.md`

**Agent 3 — No-Show Recovery + Abandoned Cart Sequences:**
Generate 6 no-show emails + 4 abandoned cart emails + 4 SMS:
- No-show Email 1: "You missed it" + replay (1-2hrs post)
- No-show Email 2: Highlight reel / FOMO (day 2)
- No-show Email 3: Social proof + urgency (day 3)
- No-show Email 4: Value recap (day 4)
- No-show Email 5: Deadline warning (day 5)
- No-show Email 6: Final call (day 6)
- Abandoned Cart Email 1: Tech check / "did something go wrong?" (30-60min)
- Abandoned Cart Email 2: Objection handler (24hrs)
- Abandoned Cart Email 3: Testimonials (48hrs)
- Abandoned Cart Email 4: Final urgency (72hrs)
- SMS: 3 no-show + 1 abandoned cart

Save to: `/Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/sequences/no-show-recovery-sequence.md` and `abandoned-cart-sequence.md`

**Agent 4 — GHL Workflow Blueprint + WhatsApp Sequence:**
Generate 7 GHL workflow blueprints + 8 WhatsApp messages:

**7 GHL Workflows:**
1. Registration Trigger → tag, pipeline stage, start pre-webinar sequence
2. Pre-Webinar Reminder Sequence → emails + SMS with timing
3. Webinar Attendance Handler → tag attended, update pipeline, remove reminders
4. Post-Webinar Attendee Sequence → 6 emails + SMS over 9 days
5. No-Show Recovery → replay + re-engagement over 6 days
6. Call Booked Confirmation + Reminders → 4 SMS reminders
7. Post-Call Handler → branch by outcome (closed/lost/follow-up/no-show)

**Custom Fields Required (13):**
webinar_registration_date, webinar_attended, webinar_watch_time, call_booked, call_booked_date, call_showed, offer_tier_interest, purchase_amount, purchase_date, utm_source, utm_medium, utm_campaign, utm_content, lead_stage

**Pipeline Stages (9):**
Registered → Confirmed → Attended → Call Booked → Call Completed → Proposal Sent → Closed Won → Closed Lost → No Show

**8 WhatsApp Group Messages:**
1. Welcome (pin it)
2. Social proof (3 days before)
3. Value tease (2 days before)
4. Day-of hype (morning)
5. 1-hour warning
6. 15-minute final push
7. Going live now
8. Post-webinar (30min after)

Save to: `/Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/sequences/ghl-blueprints.md` and `whatsapp-sequence.md`

---

## PHASE 6 — FULL SYSTEM VERIFICATION

Launch 4 parallel verification agents:

### Agent 1 — API Endpoint Health
Test every GET and POST endpoint. Verify response shapes match expected schemas.
Expected: All endpoints return `{ status: "ok", ... }` or valid data.

### Agent 2 — Funnel Page Verification
Load each funnel page URL, verify:
- Page renders (200 status)
- Form fields present (register pages)
- UTM tracking JS present
- GA4 + Meta Pixel scripts present
- Countdown timer renders
- `funnel_source` correctly set (paid vs organic)

### Agent 3 — Sheet Data Integrity
Verify all tabs exist with correct headers. Test write operations:
- Write a test UTM row, verify it appears
- Clean up test data after verification

### Agent 4 — Webhook Connectivity
Test each webhook receiver with sample payloads:
- WebinarJam registration event
- Calendly invitee.created event
- UTM attribution POST
- Campaign create/activate

---

## PHASE 7 — HANDOFF

### Step 7.1: Output Summary

Display the complete deployment summary:

```
╔══════════════════════════════════════════════════════════════╗
║            WEBINAR SYSTEM DEPLOYED SUCCESSFULLY             ║
╚══════════════════════════════════════════════════════════════╝

Client:           {{CLIENT_NAME}}
Business:         {{BUSINESS_NAME}}
Webinar:          {{WEBINAR_TITLE}}
Date:             {{WEBINAR_DATE}}

═══════════════════ URLS ═══════════════════

Dashboard:        {{DEPLOY_URL}}/
API:              {{DEPLOY_URL}}/api

Registration (Paid):     {{DEPLOY_URL}}/register
Registration (Organic):  {{DEPLOY_URL}}/register-organic
Thank You (Paid):        {{DEPLOY_URL}}/booked
Thank You (Organic):     {{DEPLOY_URL}}/booked-organic

Google Sheet:     https://docs.google.com/spreadsheets/d/{{SHEET_ID}}/edit

═══════════════════ API ENDPOINTS ═══════════════════

GET  /api?action=ping              ✅ Health check
GET  /api?action=dashboard_data    ✅ Dashboard data
GET  /api?action=funnel_summary    ✅ Aggregated KPIs
GET  /api?action=campaigns         ✅ Campaign windows
GET  /api?action=sync_webinarjam   ✅ Pull WJ data
GET  /api?action=sync_meta         {{META_STATUS}}
GET  /api?action=test_connections  ✅ Connection test

POST /api?source=webinarjam        ✅ WJ webhook
POST /api?source=calendly          ✅ Calendly webhook
POST /api?source=utm               ✅ UTM attribution
POST /api?source=campaign_update   ✅ Campaign management
POST /api?source=manual            ✅ Manual entry

═══════════════════ WEBHOOKS ═══════════════════

WebinarJam: {{WJ_WEBHOOK_STATUS}}
Calendly:   {{CALENDLY_WEBHOOK_STATUS}}
Meta Ads:   {{META_STATUS}}
UTM:        ✅ Built into funnel pages

═══════════════════ SEQUENCES ═══════════════════

Pre-Webinar:       5 emails + 6 SMS  → saved
Post-Attendee:     6 emails + 3 SMS  → saved
No-Show Recovery:  6 emails + 3 SMS  → saved
Abandoned Cart:    4 emails + 1 SMS  → saved
Call Reminders:    4 SMS              → saved
WhatsApp Group:    8 messages         → saved
GHL Blueprints:    7 workflows        → saved

Files at: /Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/sequences/

═══════════════════ TRACKING ═══════════════════

GA4:         {{GA4_STATUS}}
Meta Pixel:  {{PIXEL_STATUS}}
UTM:         ✅ Organic vs Paid attribution
Campaign:    "{{WEBINAR_TITLE}}" active ({{CAMPAIGN_START}} → {{CAMPAIGN_END}})

═══════════════════ NEXT STEPS ═══════════════════

{{TODO_LIST}}
```

### Step 7.2: Save Deployment Record

Write a deployment record for future reference:

```bash
# Save to client directory
cat > /Users/oliverknight/Jarvis/clients/{{CLIENT_SLUG}}/deployment.json << 'EOF'
{
  "clientName": "{{CLIENT_NAME}}",
  "businessName": "{{BUSINESS_NAME}}",
  "clientSlug": "{{CLIENT_SLUG}}",
  "deployedAt": "{{ISO_TIMESTAMP}}",
  "urls": {
    "dashboard": "{{DEPLOY_URL}}",
    "api": "{{DEPLOY_URL}}/api",
    "registerPaid": "{{DEPLOY_URL}}/register",
    "registerOrganic": "{{DEPLOY_URL}}/register-organic",
    "bookedPaid": "{{DEPLOY_URL}}/booked",
    "bookedOrganic": "{{DEPLOY_URL}}/booked-organic",
    "sheet": "https://docs.google.com/spreadsheets/d/{{SHEET_ID}}/edit"
  },
  "credentials": {
    "webinarjam": "configured",
    "meta": "{{META_STATUS}}",
    "calendly": "{{CALENDLY_STATUS}}",
    "ga4": "{{GA4_STATUS}}",
    "metaPixel": "{{PIXEL_STATUS}}"
  },
  "sheetId": "{{SHEET_ID}}",
  "vercelProject": "{{VERCEL_PROJECT_NAME}}",
  "webinarId": "{{WJ_WEBINAR_ID}}",
  "campaignActive": "{{WEBINAR_TITLE}}"
}
EOF
```

### Step 7.3: Flag Outstanding TODOs

Generate a clear TODO list for anything that couldn't be automated:

Common TODOs:
- [ ] Meta Access Token — needs long-lived/system user token for production
- [ ] Zapier rules — 5 WebinarJam → API rules need manual setup in Zapier
- [ ] GHL workflows — paste blueprints into GoHighLevel and configure triggers
- [ ] Custom domain — add domain to Vercel and configure DNS
- [ ] WhatsApp group — create group and share link
- [ ] Remove test data — delete test UTM rows from sheet

---

## IMPORTANT RULES

1. **Always validate credentials before deploying** — never deploy with invalid keys
2. **Always use `resolvedSource` pattern** — never overwrite sessionStorage funnel_source with path detection
3. **Always create CAMPAIGNS tab** — dashboard requires it for filtering
4. **Always test all endpoints after deploy** — don't hand off untested systems
5. **Always use parallel agents** for verification and sequence generation
6. **Always save deployment record** — every deployment gets a `deployment.json`
7. **Never hardcode Carlos-specific values** — everything is parameterized via `{{VARIABLES}}`
8. **Never skip the hard gate** — all credentials collected upfront, no partial deploys
9. **Sheet is publicly viewable** — needed for gviz read fallback (dashboard Tier 3)
10. **CORS enabled on API** — allows cross-origin requests from any domain

---

## REFERENCE FILES

These files contain the production-tested implementations to use as templates:

| Purpose | Source File |
|---------|------------|
| API (all endpoints) | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/vercel-deploy/api/index.js` |
| Dashboard | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/vercel-deploy/public/index.html` |
| Sheet builder | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/build-sheets.js` |
| Footer/tracking code | `/Users/oliverknight/Jarvis/Webinar Funnel/funnel/cf-ready/3-FOOTER-CODE.html` |
| Registration page | `/Users/oliverknight/Jarvis/Webinar Funnel/funnel/cf-ready/4-REGISTRATION-BODY.html` |
| Thank you page | `/Users/oliverknight/Jarvis/Webinar Funnel/funnel/cf-ready/5-THANKYOU-BODY.html` |
| Pre-webinar emails | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/pre-webinar-email-sequence.md` |
| Post-attendee emails | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/post-webinar-attendee-sequence.md` |
| No-show emails | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/no-show-recovery-sequence.md` |
| Abandoned cart emails | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/abandoned-cart-sequence.md` |
| SMS sequences | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/sms-sequence.md` |
| WhatsApp broadcasts | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/whatsapp-broadcast-sequence.md` |
| GHL blueprints | `/Users/oliverknight/Jarvis/Webinar Funnel/Carlos/Webinar Tracker/Connections/ghl-automation-blueprints.md` |
| Knowledge base | `/Users/oliverknight/Jarvis/Webinar Funnel/knowledge-base/` |

---

## KPI BENCHMARKS (Embedded Reference)

These benchmarks are written to the BENCHMARKS tab and used for RAG status in the dashboard:

| Metric | Poor | Average | Good | Elite | Source |
|--------|------|---------|------|-------|--------|
| Registration Rate (cold traffic) | <15% | 20-30% | 30-40% | >40% | Industry avg |
| Registration Rate (warm/organic) | <30% | 40-50% | 50-65% | >65% | Industry avg |
| Show-up Rate | <25% | 35-45% | 45-55% | >55% | Industry avg |
| Stay to Pitch (% of attendees) | <40% | 50-60% | 60-75% | >75% | Industry avg |
| CTA Click Rate | <3% | 5-10% | 10-15% | >15% | Industry avg |
| Call Book Rate (% of attendees) | <3% | 5-10% | 10-15% | >15% | Industry avg |
| Call Show Rate | <50% | 60-70% | 70-80% | >80% | Industry avg |
| Close Rate | <15% | 20-30% | 30-40% | >40% | Industry avg |
| CPR Facebook (cold) | >$20 | $10-15 | $5-10 | <$5 | Meta benchmarks |
| Email Open Rate (pre-webinar) | <25% | 35-45% | 45-55% | >55% | Mailchimp/GHL |
| SMS Click Rate | <5% | 10-15% | 15-25% | >25% | GHL/Twilio |
| Replay Watch Rate | <10% | 15-25% | 25-35% | >35% | WJ benchmarks |

---

## DATA FLOW ARCHITECTURE

```
                    ┌──────────────────────────────┐
                    │     FUNNEL PAGES (Vercel)     │
                    │  /register  /register-organic │
                    │  /booked    /booked-organic    │
                    └───────┬──────────┬────────────┘
                            │          │
                    Form Submit    Page Load (TY)
                            │          │
                   ┌────────▼──┐  ┌────▼─────────┐
                   │WebinarJam │  │POST /api?     │
                   │  (proxy)  │  │source=utm     │
                   └────────┬──┘  └────┬──────────┘
                            │          │
                    ┌───────▼──────────▼──────────┐
                    │      VERCEL API (/api)       │
                    │  Serverless Node.js function │
                    └──┬────┬────┬────┬────┬──────┘
                       │    │    │    │    │
              ┌────────▼┐ ┌─▼──┐ │  ┌─▼──┐ │
              │ Google   │ │Meta│ │  │WJ  │ │
              │ Sheets   │ │Ads │ │  │API │ │
              │ (write)  │ │API │ │  │    │ │
              └────┬─────┘ └────┘ │  └────┘ │
                   │              │         │
              ┌────▼──────────────▼─────────▼─┐
              │        GOOGLE SHEET            │
              │   11 tabs · public viewable    │
              └────────────┬──────────────────┘
                           │
                    gviz/tq (read)
                           │
              ┌────────────▼──────────────────┐
              │        DASHBOARD (/)           │
              │   Auto-refresh · Campaign      │
              │   filter · Traffic source       │
              │   breakdown · UTM panel        │
              └───────────────────────────────┘

WEBHOOK RECEIVERS:
  WebinarJam → POST /api?source=webinarjam  (via Zapier)
  Calendly   → POST /api?source=calendly    (direct webhook)
  Meta CAPI  → POST /api?source=meta        (manual/CAPI)
  UTM Track  → POST /api?source=utm         (from funnel pages)

AUTO-SYNC (triggered by dashboard load):
  /api?action=sync_webinarjam  → pulls registrants/attendees
  /api?action=sync_meta        → pulls 30-day ad metrics
```
