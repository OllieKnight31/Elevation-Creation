# Make.com Scenarios — Property Labs Webinar Funnel

**Client:** Terry Dwobeng / Property Labs
**Make.com Region:** EU1
**Organization ID:** 6878375
**Team ID:** 1217780
**Updated:** April 6, 2026

---

## Scenarios (8 Total)

| # | Name | ID | Type | Webhook ID | Status |
|---|------|----|------|-----------|--------|
| 1 | WJ Registration to Tracker | 5152604 | Instant (webhook) | 2786769 | ACTIVE |
| 2 | Calendly Call Booked → Tracker | 5152614 | Instant (webhook) | 2786815 | INACTIVE (plan limit) |
| 3 | GHL Pipeline Update → Tracker | 5152615 | Instant (webhook) | 2786816 | ACTIVE |
| 4 | WJ Attendance → Tracker | 5152616 | Instant (webhook) | 2786817 | INACTIVE (plan limit) |
| 5 | Meta Ads Sync → Tracker | 5152617 | Scheduled (daily 9am) | N/A | INACTIVE (plan limit) |
| 6 | UTM Attribution → Tracker | 5153854 | Instant (webhook) | 2787319 | INACTIVE (plan limit) |
| 7 | Campaign Update → Tracker | 5153856 | Instant (webhook) | 2787321 | INACTIVE (plan limit) |
| 8 | WebinarJam Sync (Scheduled) | 5153857 | Scheduled (daily 8am) | N/A | INACTIVE (plan limit) |

**Free plan limit: 2 active scenarios. Upgrade to Core (~$9/month) for all 8.**

---

## Webhook URLs (6 Total)

These are the Make.com webhook URLs that external services should POST to:

| Webhook | URL | Connect To |
|---------|-----|------------|
| **WebinarJam Registration** | `https://hook.eu1.make.com/ldpp1thvsr6l2o1q7fxfvliq5bc9skav` | WebinarJam > Webhooks > Registration event |
| **WebinarJam Attendance** | `https://hook.eu1.make.com/4w9pcqv33ukx248ulle3hjfysyit9d7g` | WebinarJam > Webhooks > Attendee Joined event |
| **Calendly Call Booked** | `https://hook.eu1.make.com/jfkg36kob3pm8l9136fn0clyz90lmbfa` | Calendly > Webhooks > `invitee.created` event |
| **GHL Pipeline Update** | `https://hook.eu1.make.com/v1sonyo4c6od8tfguaqxnlva15jjoa47` | GHL > Workflow webhook action (pipeline stage changes) |
| **UTM Attribution** | `https://hook.eu1.make.com/42c8yazl71379d0lib60xxp7j49mlyik` | Registration page UTM tracking |
| **Campaign Update** | `https://hook.eu1.make.com/qt15h8mz3gwhatspvjl21lx7b9gdoz8b` | Campaign management / manual updates |

---

## Data Flow (Complete)

```
WebinarJam (Registration)  → Make Webhook → POST → Vercel Tracker (?source=webinarjam)
WebinarJam (Attendance)    → Make Webhook → POST → Vercel Tracker (?source=webinarjam)
Calendly (Call Booked)     → Make Webhook → POST → Vercel Tracker (?source=calendly)
GHL (Pipeline Update)      → Make Webhook → POST → Vercel Tracker (?source=manual)
UTM Attribution            → Make Webhook → POST → Vercel Tracker (?source=utm)
Campaign Update            → Make Webhook → POST → Vercel Tracker (?source=campaign_update)
Meta Ads (Scheduled 9am)   → Make HTTP GET → Vercel Tracker (?action=sync_meta)
WebinarJam (Scheduled 8am) → Make HTTP GET → Vercel Tracker (?action=sync_webinarjam)
```

---

## Coverage Checklist

All 6 Vercel API inbound sources mapped:

| Vercel Source | Make.com Scenario | Status |
|--------------|-------------------|--------|
| `?source=webinarjam` (registration) | WJ Registration to Tracker | BUILT |
| `?source=webinarjam` (attendance) | WJ Attendance → Tracker | BUILT |
| `?source=calendly` | Calendly Call Booked → Tracker | BUILT |
| `?source=meta` | Meta Ads Sync → Tracker (scheduled) | BUILT |
| `?source=manual` | GHL Pipeline Update → Tracker | BUILT |
| `?source=campaign_update` | Campaign Update → Tracker | BUILT |
| `?source=utm` | UTM Attribution → Tracker | BUILT |

All 2 Vercel API scheduled syncs mapped:

| Vercel Action | Make.com Scenario | Status |
|--------------|-------------------|--------|
| `?action=sync_meta` | Meta Ads Sync → Tracker | BUILT |
| `?action=sync_webinarjam` | WebinarJam Sync (Scheduled) | BUILT |

---

## Vercel Tracker Endpoint

All scenarios forward data to: `https://webinar-system-five.vercel.app/api`

---

## API Token

- **Token Name:** Property Labs Automation
- **Token ID:** 15872838-fbcd-4ed8-b96d-38e22edf0926
- **Scopes:** All

---

## Activation Priority (When Upgrading)

1. **WJ Registration to Tracker** — ACTIVE (critical for launch)
2. **GHL Pipeline Update → Tracker** — ACTIVE (critical for pipeline tracking)
3. **WJ Attendance → Tracker** — activate next (needed for webinar day)
4. **Calendly Call Booked → Tracker** — activate next (needed for call bookings)
5. **Meta Ads Sync → Tracker** — activate for ad tracking
6. **WebinarJam Sync (Scheduled)** — backup data pull
7. **UTM Attribution → Tracker** — source attribution
8. **Campaign Update → Tracker** — campaign management

---

*Updated: April 6, 2026 | Client: Terry Dwobeng / Property Labs*
