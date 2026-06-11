---
name: profile-dashboard-skill
description: Use this skill when the user wants to set up a profile dashboard, create a tracking dashboard, add a client to the profile dashboard, deploy a new dashboard instance, or says "profile dashboard for [client]". Also triggers on "Instagram pipeline dashboard", "IG tracking dashboard", "set up dashboard tracking", "add [name] to the dashboard", "create a pipeline dashboard for [client]", "deploy a new dashboard", or "new dashboard instance".
version: 6.0.0
---

# Profile Dashboard Skill — Universal IG Pipeline Dashboard

You are an expert at setting up and managing Instagram pipeline tracking dashboards. This skill handles TWO workflows:

1. **Add Client** — Register a new client on an existing dashboard deployment (most common)
2. **New Deployment** — Spin up a fresh universal dashboard instance for a new agency/business

**Architecture**: One Vercel deployment serves ALL clients. Each client gets their own Google Sheet. Clients log in at `/dashboard/{clientId}`. Admin manages all clients at `/admin`.

**Template Source**: `/Users/oliverknight/Jarvis/profile-dashboard-universal/` — this is the master codebase. All new deployments are copied from here.

**Live Codebase (Carlos's deployment)**: `/Users/oliverknight/Jarvis/profile-dashboard/` — this is the most advanced deployment with Meta Ads API, Instagram Insights API, custom sheet formats, Vercel cron sync, rep logins, and connection management.

**Profile Funnel Model**: All ad traffic drives to the Instagram profile, NOT to a landing page. No opt-ins or landing page views tracked. Ads tab has 14 columns (A:N).

**MANDATORY FOOTER**: Every deployment MUST include the "designed by ollie knight" footer linking to `https://www.instagram.com/ollieknxght?igsh=b2t4a29hbjMweTh3&utm_source=qr` on ALL pages (login, admin login, admin dashboard, client dashboard). This is NON-NEGOTIABLE.

**NEVER** connect to, link to, or share an existing client's Google Sheet with another client or as a template. Each client's sheet is private. When a client needs a sheet, they create a blank one and share it with the service account — or use the blank template sheet.

---

## HARD GATE — Determine Workflow

Ask the user using AskUserQuestion:

**"Are you adding a client to an existing dashboard, or deploying a brand new dashboard instance?"**

- **Add Client** → Go to [Workflow A: Add Client](#workflow-a-add-client)
- **New Deployment** → Go to [Workflow B: New Deployment](#workflow-b-new-deployment)

---

## Workflow A: Add Client

### A.1 — Intake (AskUserQuestion)

**Required:**
- Client name (e.g., "MoreLife Elite")
- Dashboard password (min 8 characters)
- Google Sheet ID or URL (client must have created this already)
- Which deployment to add to (ask for the production URL or Vercel scope)

**Optional (have sensible defaults):**
- Brand colour (default: `#3b82f6`)
- Currency (default: `GBP`, options: `GBP` / `USD` / `EUR`)
- Whether to send a WhatsApp onboarding message (default: no)
- Meta Ad Account ID (for automatic ad data — e.g., `act_123456789`)
- Instagram Business Account ID (for follower/profile view tracking)
- Sheet format (default: `standard`, alternative: `carlos-setter-tracker` for transposed DM setter tracker)

### A.2 — Prepare the Google Sheet

The client has two options:

**Option 1: Duplicate the template sheet**
- Blank template: `https://docs.google.com/spreadsheets/d/1qnsNcoDNmCiVYtUYirLrUADB1aAXwNN_mDT8zOLvcUw/edit`
- Client duplicates it (File → Make a copy)
- Then shares their copy with the service account email

**Option 2: Create from scratch**
- Client creates a new Google Sheet
- Shares it with the service account: `google-sheets@winter-berm-487611-g7.iam.gserviceaccount.com`
- Access level: Editor (required to format/write headers)
- The registration API will auto-create the 4 tabs with headers and formatting

The service account CANNOT create new spreadsheets (0 Drive quota). It can only read/write sheets that have been shared with it.

When formatting a sheet via the Sheets API, use the `createClientSheet` pattern from `src/lib/google-sheets.ts`:
- 4 tabs: Setters, Closers, Ads, Payments
- Frozen header row on each tab
- Bold headers with dark background
- Date column width 120px
- "Anyone with link can edit" sharing permission

**Header rows:**

| Tab | Range | Headers |
|---|---|---|
| Setters | A1:P1 (16 cols) | Date, Name, Messages Sent, Outbounds, Responses, Inbounds, Follow Ups, Links Sent, Booked Calls, Calls Proposed, Followers, Qualified Followers, Lead Quality, Notes, Hit KPIs, Profile Visits |
| Closers | A1:N1 (14 cols) | Date, Name, Calls Scheduled, Shows, No Shows, Offers Made, Closed, Revenue, Cash Collected, Follow Up Calls, Rescheduled, Avg Deal Value, Objections, Notes |
| Ads | A1:P1 (16 cols) | Date, Platform, Campaign, Spend, Impressions, Clicks, CTR, CPM, CPC, Leads, CPL, Landing Page Views, Opt-Ins, Booked Calls, ROAS, Notes |
| Payments | A1:O1 (15 cols) | Date, Client Name, Down Payment, Payment Method, Status, Programme, Payment Type, Total Contracted, Revenue, Due Date, Recurring, Stripe ID, Notes, Closer, Setter |

### A.3 — Validate the Sheet

Before registering, validate the sheet has all 4 required tabs:

```bash
curl -s -X POST "{dashboardUrl}/api/sheet/validate" \
  -H "Content-Type: application/json" \
  -d '{"sheetId":"{sheetId}"}'
```

Returns `{ valid: true/false, missingTabs: [], error?, serviceAccountEmail }`.

### A.4 — Register the Client

Register via the admin panel API:

```bash
# First, log in as admin to get the session cookie
curl -s -X POST "{dashboardUrl}/api/admin/auth" \
  -H "Content-Type: application/json" \
  -d '{"password":"{adminPassword}"}' \
  -c /tmp/pd-admin-cookies.txt

# Then register the client
curl -s -X POST "{dashboardUrl}/api/register" \
  -H "Content-Type: application/json" \
  -b /tmp/pd-admin-cookies.txt \
  -d '{
    "name": "{clientName}",
    "password": "{clientPassword}",
    "sheetId": "{sheetId}",
    "brandColor": "{brandColor}"
  }'
```

The response returns `{ success: true, clientId: "{slug}", sheetUrl: "..." }`.

The client ID is auto-generated from the name (slugified: lowercase, alphanumeric + hyphens, max 40 chars).

The registration endpoint validates the sheet, auto-creates tabs/headers if needed, and stores the client config via Vercel API.

### A.5 — Configure API Integrations (Optional)

If the client has Meta Ads and/or Instagram accounts, configure these integrations:

**Meta Ads API** — Automatically pulls campaign performance data (spend, impressions, clicks, leads, CPL):

1. Set per-client env vars on Vercel:
```bash
printf '{metaAccessToken}' | npx vercel env add META_ACCESS_TOKEN_{CLIENTID_UPPER} production --token {vercelToken}
printf '{metaAdAccountId}' | npx vercel env add META_AD_ACCOUNT_ID_{CLIENTID_UPPER} production --token {vercelToken}
printf '{metaApiVersion}' | npx vercel env add META_API_VERSION_{CLIENTID_UPPER} production --token {vercelToken}
```

2. OR save to the client config in `clients.json`:
```json
{
  "metaAdAccountId": "act_123456789",
  "metaApiVersion": "v22.0",
  "excludeCampaignPatterns": ["webinar", "registration"]
}
```

3. Optionally set campaign exclusion patterns:
```bash
printf 'webinar,registration,complete registration' | npx vercel env add META_EXCLUDE_PATTERNS_{CLIENTID_UPPER} production --token {vercelToken}
```

**Instagram Insights API** — Automatically pulls follower count, profile views, new followers:

1. Set per-client env vars:
```bash
printf '{igBusinessAccountId}' | npx vercel env add IG_BUSINESS_ACCOUNT_ID_{CLIENTID_UPPER} production --token {vercelToken}
printf '{igAccessToken}' | npx vercel env add IG_ACCESS_TOKEN_{CLIENTID_UPPER} production --token {vercelToken}
```

2. The IG token can be the same as the Meta token if they share permissions.

3. **Important**: The System User needs the `ANALYZE` task on the Facebook Page for insights. Without it, only basic follower count works (not profile views).
   - To fix: Meta Business Suite → Business Settings → Pages → [Page] → Assign People → add System User with "Analyze" permission.

**Token Types:**
- **System User token** (recommended) — never expires, set in Meta Business Suite
- **Page Access Token** — auto-discovered as fallback if System User lacks insights permissions
- **User token** — expires, not recommended for production

**Connection Management API** — Clients can view/update their API connections:
```
GET  /api/connections/{clientId}   — View configured connections (tokens masked)
PUT  /api/connections/{clientId}   — Update connection settings
POST /api/connections/{clientId}/test — Test API connectivity
```

### A.6 — Set Up Vercel Cron (Optional)

If the client has Meta/Instagram integrations, add a daily cron job to warm the cache:

Update `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/sync/{clientId}",
      "schedule": "0 9 * * *"
    }
  ]
}
```

This triggers the sync endpoint daily at 9 AM UTC, which:
- Fetches Meta Ads data for the last 24 hours
- Fetches Instagram insights (follower count, profile views)
- Validates API connections are still working
- Protected by `CRON_SECRET` env var

### A.7 — Output Summary

```
╔══════════════════════════════════════════════╗
║         Client Added Successfully            ║
╚══════════════════════════════════════════════╝

Client:       {clientName}
ID:           {clientId}
Password:     {clientPassword}
Currency:     {currency}

Dashboard:    {dashboardUrl}/dashboard/{clientId}
Google Sheet: https://docs.google.com/spreadsheets/d/{sheetId}/edit

Admin Panel:  {dashboardUrl}/admin

Integrations:
  Google Sheet:    ✅ Connected
  Meta Ads API:    {✅ Connected / ❌ Not configured}
  Instagram API:   {✅ Connected / ⚠️ Partial (no insights) / ❌ Not configured}

The client's Google Sheet has 4 tabs ready:
  1. Setters  — Daily setter activity (15 columns)
  2. Closers  — Daily closer activity (14 columns)
  3. Ads      — Ad performance (14 columns) {+ auto-fetched from Meta API}
  4. Payments — Payment tracking (13 columns)

Dashboard has 7 tabs:
  1. Overview   — 9-stage pipeline, DM setter funnel, revenue metrics
  2. Setters    — Per-setter activity and conversion
  3. Closers    — Per-closer sales metrics
  4. Ads        — Campaign performance (sheet + Meta API merged)
  5. Payments   — Payment tracking and commissions
  6. Instagram  — Follower growth, profile views, engagement
  7. Settings   — Connection management and API status

Data refreshes on every page load + manual refresh button.
Currency selector: GBP / USD / EUR.
```

### A.8 — WhatsApp Onboarding (Optional)

If requested, ask for the client's phone number, then send via `mcp__whatsapp__whatsapp_send_message`:

```
Hey {clientName}!

Your Pipeline Dashboard is all set up. Here's everything you need:

*Dashboard*: {dashboardUrl}/dashboard/{clientId}
*Password*: {clientPassword}

*Google Sheet*: https://docs.google.com/spreadsheets/d/{sheetId}/edit

Your Google Sheet has 4 tracking tabs:
1. *Setters* — Daily setter activity (messages, outbounds, links, booked calls, followers)
2. *Closers* — Daily closer activity (shows, offers, closed, revenue, cash)
3. *Ads* — Ad performance (spend, leads, CPL, ROAS) — manual entry
4. *Payments* — Auto-populated from Closers + manual entries

Fill in the sheet daily and your dashboard updates automatically with pipeline metrics, conversion rates, trends, and financial performance.

Hit the Refresh button on your dashboard anytime to pull the latest data.

Any questions, just message me!
```

---

## Workflow B: New Deployment

### B.1 — Intake (AskUserQuestion)

**Required:**
- Brand name for the login page (e.g., "Conversion Labs", "Elite Funnels")
- Admin password for the `/admin` panel
- Vercel account details — either:
  - A Vercel API token (preferred — works in non-interactive shells)
  - OR Vercel account email (for interactive `vercel login`)

**Optional (have sensible defaults):**
- Whether to send a WhatsApp onboarding message (default: no)

### B.2 — Copy the Template

```bash
cp -r /Users/oliverknight/Jarvis/profile-dashboard-universal /Users/oliverknight/Jarvis/{brand-slug}-dashboard
cd /Users/oliverknight/Jarvis/{brand-slug}-dashboard
rm -rf .vercel .next node_modules
```

### B.3 — Update Branding

Update the brand name in these files (replace "Conversion Labs" with the new brand name):

| File | What to change |
|---|---|
| `src/components/auth/login-page.tsx` | `<h1>` text: the brand name |
| `src/components/admin/admin-login.tsx` | `<h1>` text: the brand name |

Also set `NEXT_PUBLIC_BRAND_NAME` env var for runtime brand override (login page reads this).

**DO NOT modify the "designed by ollie knight" footer or the Instagram link. These must remain on ALL pages.**

### B.4 — Install & Test Locally

```bash
cd /Users/oliverknight/Jarvis/{brand-slug}-dashboard
npm install
npm run dev
# Visit http://localhost:3000 to verify branding
```

### B.5 — Deploy to Vercel

**Preferred method — token-based (works in non-interactive shells like Claude Code):**

```bash
# If user provides a Vercel token, use --token flag throughout
npx vercel link --token {vercelToken} --scope {vercelScope} --yes
cat .vercel/project.json  # Get projectId and orgId
npx vercel --prod --token {vercelToken} --scope {vercelScope}
```

**Alternative — interactive login (only works in a real terminal):**

```bash
npx vercel login {vercelEmail}
npx vercel link --scope {vercelScope} --yes
cat .vercel/project.json
npx vercel --prod --scope {vercelScope}
```

**IMPORTANT**: The Vercel CLI cannot do browser-based login in non-interactive shells. If `vercel login` fails, ask the user for a Vercel API token instead (Settings → Tokens on vercel.com).

### B.6 — Set Environment Variables

```bash
# Core (use printf to avoid trailing newlines)
printf '{googleServiceAccountKey}' | npx vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production --token {vercelToken} --scope {vercelScope}
printf '{jwtSecret}' | npx vercel env add JWT_SECRET production --token {vercelToken} --scope {vercelScope}
printf '{adminPassword}' | npx vercel env add ADMIN_PASSWORD production --token {vercelToken} --scope {vercelScope}

# Vercel API (for client data persistence via CLIENTS_CONFIG env var)
printf '{vercelApiToken}' | npx vercel env add VERCEL_API_TOKEN production --token {vercelToken} --scope {vercelScope}
printf '{projectId}' | npx vercel env add VERCEL_PROJECT_ID production --token {vercelToken} --scope {vercelScope}
printf '{teamId}' | npx vercel env add VERCEL_TEAM_ID production --token {vercelToken} --scope {vercelScope}
```

**CLIENTS_CONFIG must be type `plain` (not encrypted)**. The Vercel CLI always creates `encrypted` type. Use the Vercel API directly:

```bash
curl -s -X POST "https://api.vercel.com/v10/projects/{projectId}/env?teamId={teamId}" \
  -H "Authorization: Bearer {vercelToken}" \
  -H "Content-Type: application/json" \
  -d '{"key":"CLIENTS_CONFIG","value":"{\"clients\":[]}","type":"plain","target":["production","preview"]}'
```

**Why plain?** The app reads AND writes CLIENTS_CONFIG via the Vercel API on every request. Encrypted env vars cannot be read back via API — only `plain` type supports `decrypt=true`.

### B.7 — Redeploy with Env Vars

```bash
npx vercel --prod --token {vercelToken} --scope {vercelScope}
```

### B.8 — Verify

```bash
# Test admin login
curl -s -X POST {productionUrl}/api/admin/auth \
  -H "Content-Type: application/json" \
  -d '{"password":"{adminPassword}"}' \
  -w "\nHTTP %{http_code}"

# Verify env vars
npx vercel env ls --token {vercelToken} --scope {vercelScope}
```

### B.9 — Output Summary

```
╔══════════════════════════════════════════════╗
║       Dashboard Deployment Complete          ║
╚══════════════════════════════════════════════╝

Brand:        {brandName}
Admin URL:    {productionUrl}/admin
Admin Pass:   {adminPassword}

Vercel:       {vercelScope}
Project:      {productionUrl}

Service Account: google-sheets@winter-berm-487611-g7.iam.gserviceaccount.com
Template Sheet:  https://docs.google.com/spreadsheets/d/1qnsNcoDNmCiVYtUYirLrUADB1aAXwNN_mDT8zOLvcUw/edit

To add clients:
  1. Go to {productionUrl}/admin
  2. Log in with the admin password
  3. Click "Add Client" — enter name, password, and Google Sheet ID
  4. The sheet must be shared with the service account email above
  5. Sheet needs 4 tabs: Setters, Closers, Ads, Payments
  (Or duplicate the template sheet above)

Local codebase: /Users/oliverknight/Jarvis/{brand-slug}-dashboard/
```

---

## Technical Reference

### Stack
- Next.js 16 + React 19 + TypeScript
- Google Sheets API v4 (googleapis)
- Meta Marketing API (Facebook Graph API) for ad campaign data
- Instagram Insights API (Graph API) for follower/profile growth
- bcryptjs + jose JWT (24h sessions, httpOnly cookies)
- shadcn/ui + Tailwind CSS v4 + Recharts
- Vercel serverless (no external DB) + Vercel Cron

### Auth System
- **Client auth**: bcrypt password hash (salt=12) + JWT session cookie (`pd-session`, 24h, httpOnly, secure in prod, sameSite=lax)
- **Rep auth**: Per-client team members with role-based section access. Reps log in with `clientId + repId + password` and get a JWT with `allowedSections` array. If `allowedSections` is set, the API enforces section access (`403` if denied).
- **Admin auth**: Plain text password match (`ADMIN_PASSWORD` env var) + JWT cookie (`pd-admin-session`, 24h)
- Separate cookies — client, rep, and admin sessions are independent
- `verifyPassword()` also updates `lastLogin` timestamp

### Data Persistence
- **Client config**: Stored in `CLIENTS_CONFIG` Vercel env var (type: plain, NOT encrypted)
- **Client record fields**: id, name, sheetId, passwordHash, password (stored plaintext for admin view), brandColor, ltv, currency, metaAdAccountId, metaApiVersion, igBusinessAccountId, excludeCampaignPatterns, sheetFormat, metaAccessToken, igAccessToken, status (active/suspended), createdAt, updatedAt, lastLogin, reps[]
- **How it works**: `src/lib/db.ts` reads via Vercel API v9 (`decrypt=true`) and writes via Vercel API v10 (PATCH) on every request. No filesystem, no external DB.
- **Local dev**: Falls back to `data/clients.json` or root `clients.json` file
- **No caching**: Every request reads fresh from Vercel API

### Client Config Type

```typescript
interface ClientConfig {
  id: string;
  name: string;
  sheetId: string;
  passwordHash: string;
  brandColor: string;
  ltv: number;
  currency?: string;             // "GBP" | "EUR" | "USD" — default "GBP"
  metaAdAccountId?: string;      // e.g. "act_522825340525514"
  metaApiVersion?: string;       // e.g. "v22.0"
  igBusinessAccountId?: string;  // e.g. "17841451143739607"
  excludeCampaignPatterns?: string[];  // e.g. ["webinar", "registration"]
  sheetFormat?: "standard" | "carlos-setter-tracker";
  metaAccessToken?: string;      // stored in config OR env var
  igAccessToken?: string;        // stored in config OR env var
  status?: string;
  password?: string;
  createdAt?: string;
  lastLogin?: string;
  reps?: Rep[];
}

interface Rep {
  id: string;
  name: string;
  passwordHash: string;
  allowedSections: DashboardSection[];
  role: string; // "owner" | "setter" | "closer"
  status?: string;
  createdAt?: string;
  lastLogin?: string | null;
}
```

### Meta Ads API Integration (`src/lib/meta-ads.ts`)

**How it works:**
1. Reads config from per-client env vars (`META_ACCESS_TOKEN_{CLIENTID}`, `META_AD_ACCOUNT_ID_{CLIENTID}`) or from `clients.json` fields
2. Calls `graph.facebook.com/{version}/{adAccountId}/insights` with campaign-level breakdown
3. Paginates through all results
4. Filters out excluded campaigns (webinar, registration, etc.) via case-insensitive pattern matching
5. Extracts action types: `lead`, `offsite_conversion.fb_pixel_lead`, `onsite_conversion.messaging_conversation_started_7d`, `link_click`, `onsite_conversion.messaging_first_reply`
6. Returns `AdDataRow[]` compatible with the dashboard

**Merge logic**: Sheet ad rows and Meta API ad rows are merged via `mergeAdRows()`. If both sources have data for the same date+campaign, Meta API takes priority.

**Config priority**: Env vars (`META_AD_ACCOUNT_ID_{UPPER}`) take precedence over `clients.json` fields.

### Instagram Insights API Integration (`src/lib/instagram.ts`)

**How it works:**
1. Reads config from per-client env vars (`IG_BUSINESS_ACCOUNT_ID_{CLIENTID}`, `IG_ACCESS_TOKEN_{CLIENTID}`) or `clients.json`
2. Fetches current follower count via basic account endpoint (always works with ADVERTISE task)
3. Fetches daily insights (profile_views, follower_count) — requires ANALYZE task on the Page
4. Falls back to Page Access Token if System User token lacks insights permissions
5. Handles v22.0+ API format changes (`total_value` vs daily breakdown)
6. Detects absolute vs delta follower values and normalizes
7. Generates fallback daily rows with current follower count if all insights fail

**30-day limit**: Instagram Insights API only supports ~29 days of data. Date ranges are automatically clamped.

**Fallback strategy** (3-tier):
1. Try insights with system user token
2. Try with page token (auto-discovered from `/me/accounts`)
3. Generate synthetic daily rows with current follower count

**Known issue**: System Users with only the `ADVERTISE` task on the Facebook Page cannot access insights. They need `ANALYZE` task. Fix in Meta Business Suite → Business Settings → Pages → Assign People.

### Vercel Cron Sync (`vercel.json` + `/api/sync/[clientId]`)

**Purpose**: Daily cache warming and API health check.

```json
{
  "crons": [
    {
      "path": "/api/sync/{clientId}",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Endpoint behavior**:
- Protected by `CRON_SECRET` Bearer token
- Calls `fetchMetaAdData()` and `fetchInstagramData()` for the last 24 hours
- Returns status JSON: `{ clientId, timestamp, metaAds: { success, rows }, instagram: { success, followers, dailyRows } }`

Add a cron entry for each client that has Meta/Instagram integrations.

### Custom Sheet Formats

**Standard format** (default): 4 tabs (Setters, Closers, Ads, Payments) with rows per day.

**Carlos Setter Tracker format** (`sheetFormat: "carlos-setter-tracker"`):
- Transposed layout: metrics as rows, dates as columns
- Individual setter tabs (e.g., "Ivaylo", "Rist", "Setter 3"–"Setter 8")
- Row 1: setter display name
- Row 2: month headers + Excel serial date numbers (shifted +365 from 2025 to 2026)
- Row 3+: metric rows (New Inbound Convos, Outbound Responses, etc.)
- `Totals` tab: monthly aggregation fallback
- 5-minute in-memory cache
- Implemented in `src/lib/carlos-sheet.ts` (420 LOC)

**Metric mapping (setter tabs → standard types):**
| Sheet Metric | Maps To |
|---|---|
| New Inbound Convos | inbounds |
| New Outbound Convos | outbounds |
| Outbound Responses | responses |
| Followup Messages | followUps |
| Calls Proposed | callsProposed |
| Links Sent | linksSent |
| Total Calls Booked | bookedCalls |
| Sales Calls Booked | salesCallsBooked |
| Sets Scheduled Today | callsScheduled (closer) |
| Sets Taken Today | shows (closer) |
| Sets Closed | closed (closer) |
| Revenue Generated ($) | revenue (closer) |
| New Cash Collected ($) | newCash (closer) |
| Recurring Cash Collected ($) | recurringCash (closer) |
| Hours Worked | hoursWorked |

**Data route handling**: The `/api/data/[clientId]` route checks `client.sheetFormat` and routes to either `fetchSetterData()`/`fetchCloserData()` (standard) or `fetchCarlosSetterData()`/`fetchCarlosCloserData()` (carlos format). For carlos format, it skips the sheet Ads and Payments tabs (no such tabs exist in that format).

### Admin Panel Features
- Add client with live form (name → auto-generates slug ID, password, sheet ID/URL, brand colour picker)
- Service account email shown in add-client form with copy button
- Sheet validation before client creation (checks all 4 tabs exist)
- Created-client details card (green, one-time) with copy buttons for ID, password, dashboard URL, sheet URL + "Copy All"
- Client table: name (+ brand colour dot), ID, password (visible + copy), status toggle, sheet link + health check, created date, last login, actions
- Reset password (inline input)
- Delete client (with confirmation)
- Toggle client status (active/suspended)
- Async sheet health check per client (shows spinner → green tick or red warning)
- Refresh button to reload client list
- Rep management: create/edit/delete reps per client with section permissions

### Client Dashboard Features
- **7 tabs**: Overview, Setters, Closers, Ads, Payments, Instagram, Settings
- **Period selector**: Daily (last 7 days) / Weekly (last 3 weeks) / Monthly (last 2 months) + custom date range
- **Currency selector**: GBP / USD / EUR (persists in session, default from client config)
- **Refresh button**: Re-fetches all data from Google Sheets + APIs (Cache-Control: private, max-age=300)
- **Google Sheets connection indicator**: Green (data loads OK) / Amber (section has empty rows) / Red (fetch failed — sheet disconnected)
- **Pipeline scorecards**: 9-stage conversion funnel with % rates between each stage
- **DM Setter Pipeline**: Extended metrics — inbounds, outbounds, OB response rate, follow-ups, calls proposed, links sent, booked calls, sales calls booked, sets scheduled/taken/closed, revenue per set, cash per set
- **Trend charts**: Recharts line/bar charts per section with period comparison
- **Revenue & cost metrics**: Revenue, Cash Collected, CAC, ROI, Cost Per Follower
- **Closer metrics**: Cash Per Booking, Cash Per Attended, Close Rate hero card, Avg Deal Value, Cash Collected Ratio
- **Payment synthesis**: Auto-generates payment rows from Closers tab (closed deals) + merges with manual Payments sheet entries
- **Instagram tab**: Follower growth chart, profile views, new followers/day, visit-to-follower rate, follower growth rate
- **Settings tab**: Connection management — view configured APIs, test connectivity, update tokens
- **Rep section access**: If logged in as a rep, only allowed sections are visible. API returns 403 for unauthorized sections.
- **Header-based sheet parsing**: Column matching is case-insensitive with alias support (e.g., "Follow Ups" = "follow-ups" = "followups"). Columns are matched by header name, NOT by position — so sheets with extra/reordered columns still work.

### Demo Mode
- Enabled by `DEMO_MODE=true` env var
- Login password: `DEMO_PASSWORD` env var or default `demo2026`
- Client ID: `peak-performance` (hardcoded)
- Generates 45 days of realistic fake data: 3 setters, 2 closers, 3 campaigns, 3 programmes, 8 client names
- Useful for testing or showcasing the dashboard without a real Google Sheet

### Environment Variables

**Required for production (7):**

| Var | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service account JSON key |
| `JWT_SECRET` | JWT signing secret (generate: `openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | Admin panel login password (plaintext) |
| `VERCEL_API_TOKEN` | Vercel API token (for reading/writing CLIENTS_CONFIG) |
| `VERCEL_PROJECT_ID` | Vercel project ID (from `.vercel/project.json`) |
| `VERCEL_TEAM_ID` | Vercel team/org ID (from `.vercel/project.json`) |
| `CLIENTS_CONFIG` | JSON client data store (type: **plain**, NOT encrypted) |

**Per-client API integrations (env var pattern: `{VAR}_{CLIENTID_UPPERCASE}`):**

| Var Pattern | Purpose |
|---|---|
| `META_ACCESS_TOKEN_{CLIENTID}` | Meta/Facebook System User token (never expires) |
| `META_AD_ACCOUNT_ID_{CLIENTID}` | Meta Ad Account ID (e.g., `act_522825340525514`) |
| `META_API_VERSION_{CLIENTID}` | Graph API version (default: `v22.0`) |
| `META_EXCLUDE_PATTERNS_{CLIENTID}` | Comma-separated campaign exclusion patterns |
| `IG_BUSINESS_ACCOUNT_ID_{CLIENTID}` | Instagram Business Account ID |
| `IG_ACCESS_TOKEN_{CLIENTID}` | IG token (can be same as Meta token) |

**Optional:**

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | Custom brand name on login page (default: "Conversion Labs") |
| `DEMO_MODE` | Set to `"true"` for demo mode |
| `DEMO_PASSWORD` | Override demo login password (default: `demo2026`) |
| `NEXT_PUBLIC_DEMO_MODE` | Client-side demo flag |
| `CRON_SECRET` | Bearer token for Vercel cron endpoint protection |

### API Routes

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth` | None | Client/Rep login (clientId + password, or clientId + repId + password) |
| DELETE | `/api/auth` | Client | Client logout |
| GET | `/api/data/[clientId]` | Client | Fetch dashboard data (params: period, start, end, section). Sections: overview, setters, closers, ads, payments, instagram |
| GET | `/api/sync/[clientId]` | Cron | Vercel cron endpoint — syncs Meta Ads + Instagram data |
| GET | `/api/status/[clientId]` | Client | Check last sync status |
| GET | `/api/connections/[clientId]` | Client | View configured API connections (tokens masked) |
| PUT | `/api/connections/[clientId]` | Client | Update connection settings (Meta token, IG account ID, etc.) |
| POST | `/api/connections/[clientId]/test` | Client | Test API connectivity |
| POST | `/api/admin/auth` | None | Admin login (password) |
| DELETE | `/api/admin/auth` | Admin | Admin logout |
| GET | `/api/admin/clients` | Admin | List all clients |
| PATCH | `/api/admin/clients/[id]` | Admin | Update client (name, sheetId, brandColor, status) |
| DELETE | `/api/admin/clients/[id]` | Admin | Delete client |
| POST | `/api/admin/clients/[id]/check-sheet` | Admin | Validate sheet tabs |
| POST | `/api/admin/clients/[id]/reset-password` | Admin | Reset client password |
| POST | `/api/admin/reps` | Admin | Create rep for a client |
| PATCH | `/api/admin/reps/[repId]` | Admin | Update rep |
| GET | `/api/admin/sync/[clientId]` | Admin | Manually trigger data sync |
| POST | `/api/register` | Admin | Create new client (validates sheet first) |
| GET | `/api/clients` | None | Public list of active clients (id + name) |
| POST | `/api/sheet/validate` | None | Validate sheet without registering |
| POST | `/api/init` | Secret | Initialize DB |

### Sheet Column Reference (Standard Format)

#### Setters (A:P — 16 columns)
| Col | Header | Type |
|-----|--------|------|
| A | Date | date |
| B | Name | text |
| C | Messages Sent | number |
| D | Outbounds | number |
| E | Responses | number |
| F | Inbounds | number |
| G | Follow Ups | number |
| H | Links Sent | number |
| I | Booked Calls | number |
| J | Calls Proposed | number |
| K | Followers | number |
| L | Qualified Followers | number |
| M | Lead Quality | text |
| N | Notes | text |
| O | Hit KPIs | text |
| P | Profile Visits | number |

**Code-only fields** (not in sheet, set to 0): `salesCallsBooked`, `hoursWorked`

#### Closers (A:N — 14 columns)
| Col | Header | Type |
|-----|--------|------|
| A | Date | date |
| B | Name | text |
| C | Calls Scheduled | number |
| D | Shows | number |
| E | No Shows | number |
| F | Offers Made | number |
| G | Closed | number |
| H | Revenue | number |
| I | Cash Collected | number |
| J | Follow Up Calls | number |
| K | Rescheduled | number |
| L | Avg Deal Value | number |
| M | Objections | text |
| N | Notes | text |

#### Ads (A:P — 16 columns)
| Col | Header | Type |
|-----|--------|------|
| A | Date | date |
| B | Platform | text |
| C | Campaign | text |
| D | Spend | number |
| E | Impressions | number |
| F | Clicks | number |
| G | CTR | number |
| H | CPM | number |
| I | CPC | number |
| J | Leads | number |
| K | CPL | number |
| L | Landing Page Views | number |
| M | Opt-Ins | number |
| N | Booked Calls | number |
| O | ROAS | number |
| P | Notes | text |

#### Payments (A:O — 15 columns)
| Col | Header | Type |
|-----|--------|------|
| A | Date | date |
| B | Client Name | text |
| C | Down Payment | number |
| D | Payment Method | text |
| E | Status | text |
| F | Programme | text |
| G | Payment Type | text |
| H | Total Contracted | number |
| I | Revenue | number |
| J | Due Date | date |
| K | Recurring | text |
| L | Stripe ID | text |
| M | Notes | text |
| N | Closer | text |
| O | Setter | text |

**Header parsing is flexible**: The code reads header row A1 and matches columns by name (case-insensitive, with aliases). Column ORDER and POSITION don't matter — only the header name. Extra columns are ignored.

**Header aliases supported:**
- "Follow Ups" = "follow-ups" = "followups"
- "Messages Sent" = "messages"
- "Cash Collected" = "revenue" (in Payments tab)
- "Closed Date" = "date" (in Payments tab)
- "Hit KPIs" = "hit kpi"

### Pipeline Flow (9 stages + DM Setter Pipeline)

**9-Stage Overview Pipeline:**
```
Profile Visits → Followers → Qualified → Messages → Links Sent
  (IG API)       (IG API)   (Setters)   (Setters)   (Setters)
                                ↓ Booking Rate
                Booked → Shows → Offers → Closed
                (Setters) (Closers) (Closers) (Closers)
```

**DM Setter Pipeline (extended metrics):**
```
Inbounds + Outbounds → OB Responses → Follow-ups → Calls Proposed
    → Links Sent → Total Calls Booked → Sales Calls Booked
    → Sets Scheduled → Sets Taken → Sets Closed
    → Revenue → Cash Collected (New + Recurring)
```

**Conversion rates between each stage:**
- followerRate = followers / profileVisits
- qualifiedRate = qualifiedFollowers / followers
- messageRate = messagesSent / qualifiedFollowers
- linkRate = linksSent / messagesSent
- bookingRate = bookedCalls / linksSent
- showRate = shows / bookedCalls
- offerRate = offersMade / shows
- closeRate = closed / offersMade
- overallConversion = closed / profileVisits
- obResponseRate = responses / outbounds
- convoToProposedRate = callsProposed / totalNewConvos
- proposedToLinkRate = linksSent / callsProposed
- setShowRate = setsTaken / setsScheduled
- setCloseRate = setsClosed / setsTaken
- revenuePerSet = revenue / setsClosed
- cashPerSet = totalCashCollected / setsTaken

Revenue, Cash Collected from Closers.
Ad Spend from Ads tab + Meta API.
CAC = Ad Spend / Closed
ROI = (Revenue - Ad Spend) / Ad Spend
Cost Per Follower = Ad Spend / New Followers (from IG API)

**Setter-specific metrics:**
- Response Rate = Responses / Outbounds * 100
- Outbound to Link Rate = Links Sent / Outbounds * 100
- Response to Link Rate = Links Sent / Responses * 100
- Link to Book Rate = Booked Calls / Links Sent * 100
- KPI Hit Rate = KPI Yes count / total rows * 100
- Total Activity = Messages Sent + Outbounds + Follow Ups

**Closer-specific metrics:**
- Close Rate = Closed / Offers Made
- Show Rate = Shows / Calls Scheduled
- Offer Rate = Offers Made / Shows
- No-Show Rate = No Shows / Calls Scheduled
- Cash Collected Ratio = Cash Collected / Revenue
- Avg Deal Value = Revenue / Closed
- Cash Per Booking = Cash Collected / Calls Scheduled
- Cash Per Attended = Cash Collected / Shows

**Ad-specific metrics:**
- Avg CTR = Clicks / Impressions * 100
- Avg CPC = Spend / Clicks
- Avg CPM = (Spend / Impressions) * 1000
- Blended CPL = Spend / Leads
- Blended ROAS = (Leads * 5000) / Spend (uses $5000 LTV assumption)
- Opt-In Rate = Opt-Ins / Landing Page Views * 100
- Lead to Call Rate = Booked Calls / Leads * 100

**Payment synthesis:** Closers with closed deals auto-generate corresponding Payment rows. These are merged with manual entries from the Payments sheet tab. Revenue field in Payments maps to `r.revenue || r.downPayment` (cash actually collected).

### UI Data Points Per Section

#### Overview Tab
**Pipeline Scorecards** (10 cards with conversion arrows between each):
Ad Spend → Profile Visits → New Followers → Qualified (Inbounds + Responses) → Messages Sent → Calls Proposed → Links Sent → Calls Booked → Shows (Sets Taken) → Closed (Sets Closed)

Conversion rates shown between cards: Cost/Visit, Follower Rate, Qualified Rate, Convo→Proposed, Msg→Proposed, Proposed→Link, Link→Booked, Show Rate, Close Rate

**Overall Conversion** (8 rate cards + hero metric):
1. OB Response Rate (Responses / Outbounds)
2. Convo → Proposed (Calls Proposed / New Convos)
3. Proposed → Link (Links Sent / Calls Proposed)
4. Link → Booked (Calls Booked / Links Sent)
5. Booked → Sales (Sales Calls / Total Booked)
6. Show Rate (Sets Taken / Scheduled)
7. Close Rate (Sets Closed / Sets Taken)
8. Collection Rate (Cash Collected / Revenue)

**Hero Metric**: Cash Collected per Set Taken (with trend vs previous period)

**Revenue & Costs** (6 financial metrics):
Revenue, Cash Collected, Ad Spend, CAC (Ad Spend / Closed), Cost/Follower (Ad Spend / New Followers), ROI ((Revenue - Ad Spend) / Ad Spend)

**Trend Chart**: Line chart with series: Profile Visits, Followers, Qualified Followers, Messages Sent, Links Sent, Booked Calls, Shows, Offers Made, Closed

#### Setters Tab
**Scorecards** (8 metrics): Messages Sent, Outbounds, Responses, Response Rate, Links Sent, Booked Calls, Sales Calls Booked, Hours Worked

**Pipeline Visualization**: Outbounds → Responses → Links Sent → Booked Calls (with conversion rates: Response Rate, Link Rate, Book Rate)

**Trend Chart**: Messages Sent, Outbounds, Links Sent, Booked Calls, Sales Calls Booked

**Data Table** (12 columns, filterable by setter): Date, Name, Messages Sent, Outbounds, Responses, Inbounds, Follow Ups, Links Sent, Booked Calls, Sales Calls Booked, Calls Proposed, Hours Worked

#### Closers Tab
**Scorecards** (6 metrics): Calls Scheduled, Shows, Offers Made, Closed, Revenue, Cash Collected

**Pipeline Visualization**: Scheduled → Shows → Offers → Closed (with conversion rates: Show Rate, Offer Rate, Close Rate)

**Close Rate Hero Card**: Featured metric with trend

**Revenue Subsection**: Avg Deal Value (Revenue / Closed), Cash Collected Ratio (Cash / Revenue)

**Trend Chart**: Shows, Offers Made, Closed, Revenue

**Data Table** (12 columns, filterable by closer): Date, Name, Calls Scheduled, Shows, No Shows, Offers Made, Closed, Revenue, Cash Collected, Follow Up Calls, Rescheduled, Avg Deal Value

#### Ads Tab
**Scorecards** (6 metrics): Total Spend (invertTrend), Leads, Blended CPL (invertTrend), Booked Calls, ROAS (displayed as "X" multiplier), Opt-In Rate

**Detail Metrics** (4 additional): Avg CTR, Avg CPC (invertTrend), Avg CPM (invertTrend), Landing Page Views

**Trend Chart**: Spend, Leads, CPL, Booked Calls

**Data Table** (14 columns): Date, Platform, Campaign, Spend, Impressions, Clicks, CTR, CPC, Leads, CPL, Landing Page Views, Opt-Ins, Booked Calls, ROAS

**Note**: `blendedRoas = (leads * 5000) / spend` — uses $5000 LTV assumption for estimated ROAS when actual revenue attribution isn't available.

#### Payments Tab
**Scorecards** (4 metrics): Total Collected, Outstanding Balance (invertTrend), Total Refunded (invertTrend), Active Payment Plans

**Status Badges**: Count by status (Paid, Pending, Failed, Refunded) + Payment type split (PIF Count, Installment Count) + Revenue by Programme (sorted by amount desc)

**Commission Summary**:
- Closer commissions: 10% of cash collected per closer (name, deal count, cash collected, commission)
- Setter commissions: 5% of cash collected per setter (name, deal count, cash collected, commission)
- Total commission aggregate
- Only calculated on paid deals (status === "paid" AND downPayment > 0)

**Client Ledger**: Per-client payment tracking table:
- Client Name, Programme, Closer, Setter, Total Contracted, Total Collected, Outstanding Balance
- Totals row with sum of all currency columns
- Outstanding balance colored amber if > 0

**Data Table** (10 columns): Date, Client Name, Programme, Closer, Setter, Total Contracted, Collected/Down Payment, Outstanding (calculated), Status (color-coded), Payment Type

#### Instagram Tab
**Scorecards** (4 primary): Total Followers (current count, no trend), New Followers (with trend), Profile Views (with trend), Visit → Follower Rate (with trend)

**Secondary Metrics** (3): Avg Daily Profile Views, Avg Daily New Followers, Follower Growth Rate

**Growth Chart**: Dual Y-axis — Left: Profile Views + New Followers, Right: Total Followers (dashed line)

**Data Table** (4 columns): Date, Profile Views, New Followers, Total Followers

#### Settings Tab
**Connection Status Cards** (3 connections):
1. Google Sheet: Status indicator (green/amber/red), Sheet ID, Service account email, Test button
2. Meta Ads API: Status indicator, Token input (visibility toggle), Ad Account ID input, Test & Save buttons
3. Instagram Graph API: Status indicator, Business Account ID input, Token input (visibility toggle), Test & Save buttons

### Connection Test Details

**POST /api/connections/{clientId}/test** — Tests 3 services independently:

| Service | Test Method | Success Response |
|---|---|---|
| `google-sheet` | Reads spreadsheet metadata via Google Sheets API | Returns tab names |
| `meta-ads` | Queries `/{accountId}?fields=name,account_status` | Returns account name + status |
| `instagram` | Queries `/{businessAccountId}?fields=username,followers_count` | Returns username + follower count |

**GET /api/status/{clientId}** — Lightweight status check (no live API calls):
- Checks for placeholder tokens (`REPLACE_WITH_*`)
- Checks for missing tokens/account IDs
- Returns: `{ googleSheet: {status, message}, metaAds: {status, message}, instagram: {status, message} }`
- Status values: `"connected"` | `"warning"` | `"disconnected"`

### Sync Log Structure

**POST /api/admin/sync/{clientId}** — Manual sync returns:
```typescript
{
  timestamp: string,
  clientId: string,
  status: "success" | "failure",
  metaAds: {
    success: boolean,
    rows?: number,        // number of ad rows fetched
    reason?: string,      // if not configured
    error?: string        // if fetch failed
  },
  instagram: {
    success: boolean,
    followers?: number,   // current follower count
    dailyRows?: number,   // number of daily insight rows
    reason?: string,
    error?: string
  }
}
```

### Commission System

**Rates:**
- Closer commission: **10%** of cash collected per deal
- Setter commission: **5%** of cash collected per deal

**Calculation rules:**
- Only applies to **paid deals** (status === "paid" AND downPayment > 0)
- Closer identified from `PaymentDataRow.closer` field
- Setter identified from `PaymentDataRow.setter` field
- Commission entries sorted by commission amount descending (highest earners first)

**CommissionEntry type:**
```typescript
{
  name: string,
  role: "closer" | "setter",
  cashCollected: number,
  rate: number,           // 10 or 5
  commission: number,     // cashCollected * rate / 100
  dealCount: number
}
```

### Client Ledger System

Aggregates payments by client name:
```typescript
{
  clientName: string,
  programme: string,
  totalContracted: number,
  totalCollected: number,
  outstanding: number,      // totalContracted - totalCollected
  status: string,
  closer: string,
  setter: string
}
```

### Payment Synthesis & Merging

**synthesizePaymentsFromClosers(closerRows)**:
- Creates a PaymentDataRow for each closer row where `closed > 0` AND `revenue > 0`
- Sets `paymentType` = "PIF" if cashCollected >= revenue, else "Installment"
- Sets `status` = "Paid" if cashCollected > 0, else "Pending"
- Sets `notes` = `Auto from {name} EOD — {closed} deal(s) closed`

**mergePaymentRows(manualRows, synthesizedRows)**:
- Manual rows take priority
- Deduplicates by: date+revenue, date+totalContracted, date+closer
- Sorted by date descending

**mergeAdRows(sheetRows, metaRows)**:
- Meta API rows take priority
- Deduplicates by: date+campaign
- Sorted by date descending

### Privacy Page

**Required for Meta App compliance** — deployed at `/privacy`.
- Organization name (from client's business)
- Last updated date
- Data collected: Instagram Insights, Meta Ads data, Google Sheets data
- No personal data collected (aggregate business data only)
- Data storage: real-time display, not stored long-term
- Compliance: Meta Platform Terms & Developer Policies
- Contact email from client

### Instagram Data Types

```typescript
interface InstagramDataRow {
  date: string;
  profileViews: number;
  followerCount: number;
  newFollowers: number;
}

interface InstagramPeriodData {
  currentFollowers: number;
  newFollowers: number;
  totalProfileViews: number;
  avgDailyProfileViews: number;
  avgDailyNewFollowers: number;
  visitToFollowerRate: number;     // newFollowers / totalProfileViews * 100
  followerGrowthRate: number;     // newFollowers / startFollowers * 100
}
```

### Key Files

| File | Purpose |
|---|---|
| `src/lib/db.ts` | Client data persistence (dual-mode: Vercel API + local file) |
| `src/lib/auth.ts` | Client + rep auth (bcrypt, JWT, cookies) |
| `src/lib/admin-auth.ts` | Admin auth (separate from client auth) |
| `src/lib/google-sheets.ts` | Google Sheets API — header-based fetch + sheet creation/formatting |
| `src/lib/carlos-sheet.ts` | Custom transposed setter tracker parser (420 LOC) |
| `src/lib/meta-ads.ts` | Meta Marketing API — campaign insights fetch with pagination |
| `src/lib/instagram.ts` | Instagram Insights API — follower/profile view tracking (415 LOC) |
| `src/lib/clients.ts` | Client config wrapper (getClientConfig, getClientList) |
| `src/lib/sheet-validation.ts` | Validate sheet has required tabs |
| `src/lib/data-utils.ts` | Data aggregation, filtering, grouping, trends, payment synthesis, ad merging, IG aggregation |
| `src/lib/format.ts` | Currency formatting (GBP/USD/EUR), number formatting, percentages |
| `src/lib/demo-data.ts` | 45-day fake data generator for demo mode |
| `src/lib/utils.ts` | General utilities (cn, etc.) |
| `src/types/dashboard.ts` | All TypeScript interfaces and types |
| `src/components/auth/login-page.tsx` | Client login form (brand name here) |
| `src/components/admin/admin-login.tsx` | Admin login form (brand name here) |
| `src/components/admin/admin-dashboard.tsx` | Full admin panel UI |
| `src/components/dashboard/dashboard-shell.tsx` | Main dashboard with sheet status, currency, period, 7 tabs |
| `src/components/dashboard/client-header.tsx` | Header with client name, brand colour, logout |
| `src/components/dashboard/period-selector.tsx` | Period picker + date range |
| `src/components/dashboard/pipeline-scorecards.tsx` | 9-stage overview scorecards |
| `src/components/dashboard/overall-conversion.tsx` | Overall conversion rate |
| `src/components/dashboard/revenue-metrics.tsx` | Revenue, cash, CAC, ROI |
| `src/components/dashboard/trend-chart.tsx` | Recharts composite chart |
| `src/components/dashboard/scorecard.tsx` | Reusable metric card with trend |
| `src/components/dashboard/closers/closers-section.tsx` | Closer metrics + Cash Per Booking/Attended |
| `src/components/dashboard/setters/setters-section.tsx` | Setter metrics |
| `src/components/dashboard/ads/ads-section.tsx` | Ad metrics (sheet + Meta API merged) |
| `src/components/dashboard/payments/payments-section.tsx` | Payment metrics |
| `src/components/dashboard/instagram/instagram-section.tsx` | Instagram growth metrics |
| `src/components/dashboard/settings/settings-section.tsx` | Connection management UI |
| `src/app/api/register/route.ts` | Client registration endpoint |
| `src/app/api/data/[clientId]/route.ts` | Dashboard data API (routes to correct sheet parser) |
| `src/app/api/sync/[clientId]/route.ts` | Vercel cron sync endpoint |
| `src/app/api/connections/[clientId]/route.ts` | Connection management API |
| `src/app/api/status/[clientId]/route.ts` | Sync status endpoint |
| `src/app/api/admin/auth/route.ts` | Admin login/logout |
| `src/app/api/admin/clients/route.ts` | Admin client list |
| `src/app/api/admin/clients/[id]/route.ts` | Admin client update/delete |
| `src/app/api/admin/clients/[id]/check-sheet/route.ts` | Sheet health check |
| `src/app/api/admin/clients/[id]/reset-password/route.ts` | Password reset |
| `src/app/api/admin/reps/route.ts` | Rep management |
| `src/app/api/admin/sync/[clientId]/route.ts` | Manual sync trigger |
| `src/app/privacy/page.tsx` | Privacy policy page |
| `clients.json` | Local client config (root level) |
| `vercel.json` | Vercel cron job configuration |

### Service Account
- **Email**: `google-sheets@winter-berm-487611-g7.iam.gserviceaccount.com`
- **Key**: Stored in `/Users/oliverknight/Jarvis/profile-dashboard-universal/.env.local`
- **Scopes**: Sheets (read/write), Drive (permissions only)
- **Limitation**: Cannot create new spreadsheets (0 Drive storage quota). Can only read/write sheets shared with it.

### Template Sheet
- **URL**: `https://docs.google.com/spreadsheets/d/1qnsNcoDNmCiVYtUYirLrUADB1aAXwNN_mDT8zOLvcUw/edit`
- **Purpose**: Blank sheet with all 4 tabs, formatted headers, dropdowns, number/currency/date formatting, frozen rows
- **Usage**: Clients duplicate this sheet (File → Make a copy), then share their copy with the service account
- **NEVER** give a client access to another client's sheet. Always use this blank template or let registration auto-format.

### Live Deployments

| Brand | URL | Vercel Scope | Admin Password |
|---|---|---|---|
| Conversion Labs | `https://profile-dashboard-universal-jet.vercel.app` | `luke-robinsons-projects` | `lukelabs2026` |
| Carlos (profile-dashboard-delta) | `https://profile-dashboard-delta.vercel.app` | (Ollie's account) | — |

### Footer (NON-NEGOTIABLE)

Every page must include:
```tsx
<a
  href="https://www.instagram.com/ollieknxght?igsh=b2t4a29hbjMweTh3&utm_source=qr"
  target="_blank"
  rel="noopener noreferrer"
  className="... text-sm ..."
>
  designed by ollie knight
</a>
```

This appears on: client login, admin login, admin dashboard, and client dashboard. It must NEVER be removed.

### Known Constraints & Gotchas

1. **Vercel CLI can't login in non-interactive shells** — Always use `--token` flag when running from Claude Code
2. **CLIENTS_CONFIG must be type `plain`** — The Vercel CLI creates `encrypted` type by default. Must use Vercel API directly to create as `plain`.
3. **Service account can't create sheets** — 0 Drive quota. Client must create and share.
4. **Sheet column order doesn't matter** — Header-based parsing matches by name, not position. Extra columns are ignored.
5. **Payment `revenue` field** — Maps to "Cash Collected" or "Revenue" header in the Payments sheet (alias support). Aggregation uses `r.revenue || r.downPayment` as the actual cash collected value.
6. **Payments date field** — Maps to "Date" or "Closed Date" header (alias support).
7. **Admin passwords stored plaintext** — Intentional for admin visibility (admin can view/copy client passwords). Hashes stored alongside for auth.
8. **Meta API token pattern** — Per-client env vars use `_{CLIENTID_UPPERCASE}` suffix. E.g., for client "carlos" → `META_ACCESS_TOKEN_CARLOS`.
9. **IG Insights 30-day limit** — API only supports ~29 days of data. The code automatically clamps date ranges.
10. **IG follower_count API inconsistency** — Sometimes returns absolute counts, sometimes daily deltas. The code detects and normalizes using a threshold (1% of total followers or 500, whichever is greater).
11. **System User ANALYZE permission** — Required for IG profile_views insights. Without it, only basic follower count works. Fix in Meta Business Suite → Business Settings → Pages → Assign People.
12. **Carlos sheet serial dates** — Excel serial dates in the sheet are from 2025; the code adds +365 to shift them to 2026.
13. **Custom sheet format routing** — The data API checks `client.sheetFormat` and routes to the correct parser. For `carlos-setter-tracker`, it skips sheet Ads/Payments tabs.
14. **Cache-Control** — Data API responses include `Cache-Control: private, max-age=300` (5 min client-side cache).
15. **Rep section access** — If a rep's JWT has `allowedSections`, the API enforces it and returns 403 for unauthorized sections.
