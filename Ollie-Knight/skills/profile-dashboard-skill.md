---
name: profile-dashboard-skill
description: Use this skill when the user wants to set up a profile dashboard, create a tracking dashboard, add a client to the profile dashboard, or says "profile dashboard for [client]". Also triggers on "Instagram pipeline dashboard", "IG tracking dashboard", "set up dashboard tracking", "add [name] to the dashboard", or "create a pipeline dashboard for [client]".
version: 3.0.0
---

# Profile Dashboard Skill — IG Pipeline Dashboard Setup

You are an expert at setting up Instagram pipeline tracking dashboards. This skill automates full client onboarding using the template at `/Users/oliverknight/Jarvis/profile-dashboard-template/`.

Each client gets their own separate deployment: own Google Sheet, own Google Forms, own Vercel instance.

**Profile Funnel Model**: This dashboard is built for profile funnels — all ad traffic drives to the Instagram profile, NOT to a landing page. There are no opt-ins or landing page views tracked. The Ads tab has 14 columns (A:N) without Landing Page Views or Opt-Ins fields.

## HARD GATE — Intake

Before doing ANYTHING, collect the following from the user using AskUserQuestion:

**Required:**
- Client name (e.g., "Kyle Ritchie")
- Client ID / slug (e.g., "kyle") — suggest one based on the name
- Dashboard password
- Automation tool: Zapier, n8n, or Make.com

**Optional (have sensible defaults):**
- Brand colour (default: `#4F46E5`)
- LTV value (default: `5000`)
- Programme name (default: "Programme")
- Whether to send a WhatsApp onboarding message (default: no)

---

## Phase 1: Create Infrastructure

### 1.1 Run the onboarding script

```bash
cd /Users/oliverknight/Jarvis/profile-dashboard-template

# Source env from the existing dashboard
export GOOGLE_SERVICE_ACCOUNT_KEY=$(grep GOOGLE_SERVICE_ACCOUNT_KEY /Users/oliverknight/Jarvis/profile-dashboard/.env.local | cut -d= -f2-)

npx tsx scripts/onboard-client.ts \
  --id "{clientId}" \
  --name "{clientName}" \
  --password "{password}" \
  --brand "{brandColor}" \
  --ltv {ltv} \
  --programme "{programmeName}" \
  --dir "/Users/oliverknight/Jarvis/{clientId}-dashboard"
```

This creates:
1. Google Sheet with 5 tabs (Setters A:O, Closers A:N, Ads A:N, Payments A:M, Config)
2. Google Forms (Setter EOD + Closer EOD)
3. Dashboard directory at `/Users/oliverknight/Jarvis/{clientId}-dashboard/`
4. `clients.json` with bcrypt hashed password
5. `.env.local` with service account key + JWT secret

### 1.2 Install dependencies

```bash
cd /Users/oliverknight/Jarvis/{clientId}-dashboard
npm install
```

### 1.3 Test locally

```bash
npm run dev
# Visit http://localhost:3000, log in with client ID + password
```

---

## Phase 2: Set Up Automation

Based on the client's chosen tool, follow the guide in the template:

- **Zapier**: `/Users/oliverknight/Jarvis/profile-dashboard-template/docs/automation/zapier-setup.md`
- **n8n**: `/Users/oliverknight/Jarvis/profile-dashboard-template/docs/automation/n8n-setup.md`
- **Make.com**: `/Users/oliverknight/Jarvis/profile-dashboard-template/docs/automation/make-setup.md`

Tell the user what needs to be done:
1. Connect Setter EOD form → Setters sheet tab (15 columns A:O)
2. Connect Closer EOD form → Closers sheet tab (14 columns A:N)
3. Provide the field mapping from the automation guide

---

## Phase 3: Deploy to Vercel

```bash
cd /Users/oliverknight/Jarvis/{clientId}-dashboard
npx vercel --prod
```

After first deploy, set env vars:
```bash
# Set GOOGLE_SERVICE_ACCOUNT_KEY (paste the JSON)
npx vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production

# Set JWT_SECRET
npx vercel env add JWT_SECRET production

# Set CLIENTS_CONFIG (contents of clients.json)
npx vercel env add CLIENTS_CONFIG production

# Redeploy with env vars
npx vercel --prod
```

---

## Phase 4: Output Summary

Display to the user:

```
╔══════════════════════════════════════════╗
║       Dashboard Setup Complete           ║
╚══════════════════════════════════════════╝

Client:      {clientName}
ID:          {clientId}
Password:    {password}

Dashboard:   {vercelUrl}/dashboard/{clientId}
Google Sheet: https://docs.google.com/spreadsheets/d/{sheetId}/edit

Google Forms:
  Setter EOD: {setterFormUrl}
  Closer EOD: {closerFormUrl}

Automation:  Set up via {automationTool} (see guide provided)
```

---

## Phase 5: WhatsApp Onboarding (Optional)

If the user requested WhatsApp onboarding, ask for the client's phone number, then send via `mcp__whatsapp__whatsapp_send_message`:

```
Hey {clientName}!

Your IG Pipeline Dashboard is all set up. Here's everything you need:

*Dashboard*: {vercelUrl}/dashboard/{clientId}
*Password*: {password}

*Google Sheet*: https://docs.google.com/spreadsheets/d/{sheetId}/edit

*Daily Tracking Forms:*
Setter EOD: {setterFormUrl}
Closer EOD: {closerFormUrl}

Your Google Sheet has 4 tracking tabs:
1. *Setters* — Daily setter activity (messages, outbounds, links, booked calls, followers)
2. *Closers* — Daily closer activity (shows, offers, closed, revenue, cash)
3. *Ads* — Ad performance (spend, leads, CPL, ROAS) — manual entry
4. *Payments* — Auto-populated from Closers + manual entries

Fill in the forms daily and your dashboard updates automatically with pipeline metrics, conversion rates, trends, and financial performance.

Any questions, just message me!
```

---

## Sheet Column Reference

### Setters (A:O — 15 columns)
Date | Name | Messages Sent | Outbounds | Inbounds | Follow Ups | Links Sent | Booked Calls | Calls Proposed | Followers | Qualified Followers | Lead Quality | Notes | Hit KPIs | Profile Visits

### Closers (A:N — 14 columns)
Date | Name | Calls Scheduled | Shows | No Shows | Offers Made | Closed | Revenue | Cash Collected | Follow Up Calls | Rescheduled | Avg Deal Value | Objections | Notes

### Ads (A:N — 14 columns)
Date | Platform | Campaign | Spend | Impressions | Clicks | CTR | CPM | CPC | Leads | CPL | Booked Calls | ROAS | Notes

### Payments (A:M — 13 columns)
Date | Client Name | Down Payment | Payment Method | Status | Programme | Payment Type | Total Contracted | Revenue | Due Date | Recurring | Stripe ID | Notes

---

## Pipeline Flow (Overview — 9 stages)

```
Profile Visits → Followers → Qualified → Messages → Links Sent
  (Setters)      (Setters)   (Setters)   (Setters)   (Setters)
                                ↓ Booking Rate
                Booked → Shows → Offers → Closed
                (Setters) (Closers) (Closers) (Closers)

Conversion rates between each stage.
Revenue, Cash Collected from Closers.
Ad Spend from Ads tab.
CAC = Ad Spend / Closed
ROI = (Revenue - Ad Spend) / Ad Spend
Payments auto-populated from Closers (closed deals) + manual entries.
```

---

## Key Files (Template)

| File | Purpose |
|---|---|
| `scripts/onboard-client.ts` | Full automated onboarding (Sheet + Forms + Config) |
| `scripts/create-forms.ts` | Google Forms creation only |
| `codebase/` | Clean Next.js dashboard (copy for each client) |
| `docs/ONBOARDING-RUNBOOK.md` | Complete step-by-step reference |
| `docs/automation/*.md` | Automation guides for Zapier, n8n, Make |

## Service Account

- **Email**: `google-sheets@winter-berm-487611-g7.iam.gserviceaccount.com`
- **Key**: Stored in `/Users/oliverknight/Jarvis/profile-dashboard/.env.local`
- **Scopes**: Sheets, Drive, Forms
