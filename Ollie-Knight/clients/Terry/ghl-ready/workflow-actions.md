# GHL Workflow Actions — Step-by-Step Build Guide

**Client:** Terry Dwobeng / Property Labs
**Generated:** March 31, 2026
**Reference:** GHL-IMPLEMENTATION-GUIDE.md (Phase 7)

> This document lists every action step for all 8 workflows (WF1-WF8 + WF5a) in the exact order they must be built inside the GHL workflow builder. Follow each step sequentially. All workflows go in the **Property Labs Webinar** folder.

---

## Tags Reference (Pre-Created)

| Tag | Purpose |
|-----|---------|
| `webinar-registered` | Applied on registration |
| `webinar-attended` | Applied when attendance confirmed |
| `webinar-noshow` | Applied to no-shows post-webinar |
| `call-booked` | Applied when Strategy Call is booked |
| `call-noshow` | Applied when contact misses their call |
| `client-won` | Applied when deal closes |
| `lost` | Applied when deal is lost |
| `needs-followup` | Applied when follow-up is needed post-call |
| `replay-sent` | Applied when replay link is sent |
| `abandoned-booking` | Applied when booking page is abandoned |
| `abandoned-booking-completed` | Applied after full abandoned sequence completes |
| `sequence-completed-attendee` | Applied after attendee sequence completes without booking |
| `sequence-completed-noshow` | Applied after no-show sequence completes |

## Pipeline Reference

**Pipeline Name:** Property Labs Webinar Funnel
**Stages (in order):** Registered, Confirmed, Attended, Call Booked, Call Completed, Proposal Sent, Closed Won, Closed Lost, No Show

---

## WF1 -- Registration Trigger

**Workflow Name:** `WF1 -- Registration Trigger`
**Folder:** Property Labs Webinar
**Trigger Type:** Form Submitted / Inbound Webhook ("Registration Form")

### Workflow-Level Settings
- No exit conditions required

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Registration Form Submitted | Type: Form Submitted (if GHL form) OR Inbound Webhook (if external registration page). Select the registration form or copy the webhook URL to your external page. |
| 2 | **Create or Update Opportunity** | Create Opportunity - Registered | Pipeline: "Property Labs Webinar Funnel" / Stage: "Registered" / Opportunity Name: `{{contact.first_name}} {{contact.last_name}} - Webinar` |
| 3 | **Add Contact Tag** | Tag: webinar-registered | Tag: `webinar-registered` |
| 4 | **Update Contact Field** | Set Registration Date | Custom Field: `webinar_registration_date` / Value: `{{current_date}}` |
| 5 | **Update Contact Field** | Set UTM Source | Custom Field: `utm_source` / Value: `{{trigger.utm_source}}` |
| 6 | **Update Contact Field** | Set UTM Medium | Custom Field: `utm_medium` / Value: `{{trigger.utm_medium}}` |
| 7 | **Update Contact Field** | Set UTM Campaign | Custom Field: `utm_campaign` / Value: `{{trigger.utm_campaign}}` |
| 8 | **Update Contact Field** | Set UTM Content | Custom Field: `utm_content` / Value: `{{trigger.utm_content}}` |
| 9 | **Send Email** | Send Registration Confirmation Email | Template: `PRE -- Registration Confirmation` |
| 10 | **Send SMS** | Send Registration Confirmation SMS | Template: `PRE-SMS -- Registration Confirmation` |
| 11 | **Wait** | Wait 5 Minutes | Duration: 5 minutes |
| 12 | **Add to Workflow** | Enrol in Pre-Webinar Reminders | Workflow: `WF2 -- Pre-Webinar Reminder Sequence` |

### Notes
- If using an external registration page, the form POST must include: `first_name`, `last_name`, `email`, `phone`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`
- The 5-minute wait before adding to WF2 prevents race conditions with contact creation

---

## WF2 -- Pre-Webinar Reminder Sequence

**Workflow Name:** `WF2 -- Pre-Webinar Reminder Sequence`
**Folder:** Property Labs Webinar
**Trigger Type:** Added to Workflow (enrolled by WF1)

### Workflow-Level Settings
- No exit conditions required (WF3 will remove contacts from this workflow when they attend)

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Enrolled by WF1 | Type: Added to Workflow |
| 2 | **Wait** | Wait Until Friday April 10 10:00 AM | Wait until: specific date/time -- **Friday, April 10, 2026 at 10:00 AM BST** |
| 3 | **Send Email** | Send 3-Day Reminder Email | Template: `PRE -- 24hr Reminder` (content works for 3-day anticipation as well) |
| 4 | **Send SMS** | Send 3-Day Reminder SMS | Inline message: `3 days until the Airbnb training, {{contact.first_name}}. Monday is going to be big. [WEBINAR JOIN LINK] -- Terry` |
| 5 | **Wait** | Wait Until Sunday April 12 7:00 PM | Wait until: **Sunday, April 12, 2026 at 7:00 PM BST** |
| 6 | **Send Email** | Send 24hr Reminder Email | Template: `PRE -- 24hr Reminder` |
| 7 | **Send SMS** | Send 24hr Reminder SMS | Template: `PRE-SMS -- 24hr Reminder` |
| 8 | **Wait** | Wait Until Monday April 13 3:00 PM | Wait until: **Monday, April 13, 2026 at 3:00 PM BST** |
| 9 | **Send Email** | Send 4hr Reminder Email | Template: `PRE -- 4hr Reminder` (Subject: "4 hours until we go live") |
| 10 | **Wait** | Wait Until Monday April 13 5:00 PM | Wait until: **Monday, April 13, 2026 at 5:00 PM BST** |
| 11 | **Send SMS** | Send 2hr Reminder SMS | Template: `PRE-SMS -- 2hr Reminder` |
| 12 | **Wait** | Wait Until Monday April 13 6:00 PM | Wait until: **Monday, April 13, 2026 at 6:00 PM BST** |
| 13 | **Send Email** | Send 1hr Reminder Email | Template: `PRE -- 1hr Reminder` |
| 14 | **Send SMS** | Send 1hr Reminder SMS | Inline message: `1 hour! Training starts at 7:00 PM. Grab your spot: [WEBINAR JOIN LINK] -- Terry` |
| 15 | **Wait** | Wait Until Monday April 13 6:30 PM | Wait until: **Monday, April 13, 2026 at 6:30 PM BST** |
| 16 | **Send SMS** | Send 30min Reminder SMS | Template: `PRE-SMS -- 30min Reminder` |
| 17 | **Wait** | Wait Until Monday April 13 6:45 PM | Wait until: **Monday, April 13, 2026 at 6:45 PM BST** |
| 18 | **Send Email** | Send 15min Reminder Email | Template: `PRE -- 15min Reminder` |
| 19 | **Wait** | Wait Until Monday April 13 6:55 PM | Wait until: **Monday, April 13, 2026 at 6:55 PM BST** |
| 20 | **Send SMS** | Send We're LIVE SMS | Template: `PRE-SMS -- Were Live` |
| 21 | **Wait** | Wait Until Monday April 13 9:00 PM | Wait until: **Monday, April 13, 2026 at 9:00 PM BST** (1 hour post-webinar) |
| 22 | **Send Email** | Send Post-Webinar Replay Email | Template: `PRE -- Post-Webinar Replay` |
| 23 | **Send SMS** | Send Post-Webinar Replay SMS | Template: `PRE-SMS -- Post Webinar Replay` |

### Notes
- All "Wait until" steps use specific date/time (not duration) to ensure precise BST timing
- WF3 (Attendance Handler) will remove attendees from this workflow, so contacts who join the webinar will NOT receive the post-webinar replay email/SMS from this workflow (they get it from WF4 instead)
- Contacts who do NOT attend will complete the full sequence including the replay email at step 22-23

---

## WF3 -- Webinar Attendance Handler

**Workflow Name:** `WF3 -- Webinar Attendance Handler`
**Folder:** Property Labs Webinar
**Trigger Type:** Inbound Webhook (from WebinarJam/Demio/Zoom)

### Workflow-Level Settings
- No exit conditions required

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Attendance Webhook Received | Type: Inbound Webhook. Copy the generated URL and paste into WebinarJam/Demio/Zoom webhook settings for the "Attendee Joined" event. |
| 2 | **Contact Lookup** | Find Contact by Email | Match by: Email (from webhook payload `{{webhook.email}}` or `{{webhook.attendee_email}}`) |
| 3 | **Remove from Workflow** | Remove from Pre-Webinar Sequence | Remove from: `WF2 -- Pre-Webinar Reminder Sequence` |
| 4 | **Add Contact Tag** | Tag: webinar-attended | Tag: `webinar-attended` |
| 5 | **Remove Contact Tag** | Remove: webinar-registered | Tag: `webinar-registered` |
| 6 | **Update Opportunity** | Move to Attended Stage | Pipeline: "Property Labs Webinar Funnel" / Move to Stage: "Attended" |
| 7 | **Update Contact Field** | Set Attended = Yes | Custom Field: `webinar_attended` / Value: `Yes` |
| 8 | **Update Contact Field** | Set Watch Time | Custom Field: `webinar_watch_time` / Value: `{{webhook.watch_time}}` (if available from webhook payload) |
| 9 | **Wait** | Wait 30 Seconds | Duration: 30 seconds |
| 10 | **Add to Workflow** | Enrol in Post-Attendee Sequence | Workflow: `WF4 -- Post-Webinar Attendee Sequence` |

### Notes
- The webhook URL is generated by GHL when you create the trigger -- copy it to WebinarJam/Demio/Zoom
- The Contact Lookup step matches the webhook email to an existing GHL contact
- The 30-second wait prevents race conditions before enrolling in WF4
- Removing from WF2 prevents the post-webinar replay from being sent via WF2 (attendees get their own sequence via WF4)

---

## WF4 -- Post-Webinar Attendee Sequence

**Workflow Name:** `WF4 -- Post-Webinar Attendee Sequence`
**Folder:** Property Labs Webinar
**Trigger Type:** Added to Workflow (enrolled by WF3)

### Workflow-Level Settings (EXIT CONDITION)
- Click the workflow settings gear icon
- Under "Remove contact when": Add condition -- Tag = `call-booked`
- This removes the contact from the workflow immediately when they book a call at any point

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Enrolled by WF3 | Type: Added to Workflow |
| 2 | **Wait** | Wait Until Monday April 13 8:30 PM | Wait until: **Monday, April 13, 2026 at 8:30 PM BST** (30 min post-webinar) |
| 3 | **Send Email** | Send Recap + Book Call Email | Template: `ATTENDEE -- Recap + Book Call` |
| 4 | **Send SMS** | Send Replay + CTA SMS | Template: `ATTENDEE-SMS -- Replay + CTA` |
| 5 | **Wait** | Wait 1 Day | Duration: 1 day |
| 6 | **If/Else** | Check: Has Call Been Booked? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: route to END (stop workflow). IF NO: continue to next step. |
| 7 | **Send Email** | Send "You Don't Need Money" Email | Template: `ATTENDEE -- You Dont Need Money` (Day 2, 10:00 AM) |
| 8 | **Wait** | Wait 1 Day | Duration: 1 day |
| 9 | **If/Else** | Check: Has Call Been Booked? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: route to END. IF NO: continue. |
| 10 | **Send Email** | Send Case Studies Email | Template: `ATTENDEE -- Case Studies` (Day 3, 10:00 AM) |
| 11 | **Send SMS** | Send Case Study SMS | Template: `ATTENDEE-SMS -- Case Study` (Day 3, 2:00 PM) |
| 12 | **Wait** | Wait 1 Day | Duration: 1 day |
| 13 | **If/Else** | Check: Has Call Been Booked? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: route to END. IF NO: continue. |
| 14 | **Send Email** | Send FAQ / Objections Email | Template: `ATTENDEE -- FAQ Objections` (Day 5, 10:00 AM) |
| 15 | **Send SMS** | Send Last Chance SMS | Template: `ATTENDEE-SMS -- Last Chance` (Day 5, 2:00 PM) |
| 16 | **Wait** | Wait 2 Days | Duration: 2 days |
| 17 | **If/Else** | Check: Has Call Been Booked? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: route to END. IF NO: continue. |
| 18 | **Send Email** | Send Last Chance Urgency Email | Template: `ATTENDEE -- Last Chance Urgency` (Day 7, 10:00 AM) |
| 19 | **Wait** | Wait 2 Days | Duration: 2 days |
| 20 | **If/Else** | Check: Has Call Been Booked? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: route to END. IF NO: continue. |
| 21 | **Send Email** | Send Breakup Email | Template: `ATTENDEE -- Breakup` (Day 9, 10:00 AM) |
| 22 | **Add Contact Tag** | Tag: sequence-completed-attendee | Tag: `sequence-completed-attendee` |

### How to Build Each If/Else Step
1. Click **+** to add action, search "If/Else"
2. Click **+ Add Condition**
3. Select **Contact Custom Field** > Field: `call_booked` > Operator: `is` > Value: `Yes`
4. In the **If Yes** branch: Add action "End This Workflow" (or leave empty to stop)
5. In the **If No** branch: Continue with the next email/action below

### Notes
- The workflow-level exit condition (tag `call-booked`) provides a belt-and-braces approach alongside the If/Else checks
- Total sequence duration: 9 days
- 6 emails + 3 SMS sent to contacts who never book a call

---

## WF5 -- No-Show Recovery Sequence

**Workflow Name:** `WF5 -- No-Show Recovery Sequence`
**Folder:** Property Labs Webinar
**Trigger Type:** Tag Added = `webinar-noshow`

### Workflow-Level Settings (EXIT CONDITION)
- Click the workflow settings gear icon
- Under "Remove contact when": Add condition -- Tag = `call-booked`
- This removes the contact from the workflow immediately when they book a call

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Tag Added: webinar-noshow | Type: Tag Added. Tag: `webinar-noshow`. This fires when WF5a applies the no-show tag. |
| 2 | **Add Contact Tag** | Tag: replay-sent | Tag: `replay-sent` |
| 3 | **Update Opportunity** | Move to No Show Stage | Pipeline: "Property Labs Webinar Funnel" / Move to Stage: "No Show" |
| 4 | **Wait** | Wait 1 Hour | Duration: 1 hour |
| 5 | **Send Email** | Send Missed It + Replay Email | Template: `NOSHOW -- Missed It + Replay` (1-2 hours after webinar) |
| 6 | **Send SMS** | Send Replay Available SMS | Template: `NOSHOW-SMS -- Replay Available` |
| 7 | **Wait** | Wait 1 Day | Duration: 1 day |
| 8 | **Send Email** | Send Highlight Reel / FOMO Email | Template: `NOSHOW -- Highlight Reel FOMO` (Day 2, 10:00 AM) |
| 9 | **Wait** | Wait 1 Day | Duration: 1 day |
| 10 | **Send Email** | Send Social Proof + Urgency Email | Template: `NOSHOW -- Social Proof Urgency` (Day 3, 10:00 AM) |
| 11 | **Wait** | Wait 1 Day | Duration: 1 day |
| 12 | **Send Email** | Send 3C System Explained Email | Template: `NOSHOW -- 3C System Explained` (Day 4, 10:00 AM) |
| 13 | **Wait** | Wait 1 Day | Duration: 1 day |
| 14 | **Send Email** | Send Replay Deadline Email | Template: `NOSHOW -- Replay Deadline` (Day 5, 10:00 AM) |
| 15 | **Send SMS** | Send Replay Deadline SMS | Template: `NOSHOW-SMS -- Replay Deadline` |
| 16 | **Wait** | Wait 1 Day | Duration: 1 day |
| 17 | **Send Email** | Send Final Breakup Email | Template: `NOSHOW -- Final Breakup` (Day 6, 10:00 AM) |
| 18 | **Send SMS** | Send Final Call CTA SMS | Template: `NOSHOW-SMS -- Call CTA` |
| 19 | **Add Contact Tag** | Tag: sequence-completed-noshow | Tag: `sequence-completed-noshow` |

### Notes
- This workflow is triggered by WF5a (No-Show Detector), not directly
- Total sequence duration: 6 days
- 6 emails + 3 SMS sent to contacts who never book a call
- If a contact books a call at any point, the workflow-level exit condition removes them immediately

---

## WF5a -- No-Show Detector

**Workflow Name:** `WF5a -- No-Show Detector`
**Folder:** Property Labs Webinar
**Trigger Type:** Date/Time Based -- Scheduled

### Workflow-Level Settings
- No exit conditions required

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Scheduled: April 13 10:00 PM BST | Type: Date/Time Based. Run on: **Monday, April 13, 2026 at 10:00 PM BST** (2 hours after webinar ends). |
| 2 | **If/Else** | Check: Registered but NOT Attended | Condition: Contact HAS tag `webinar-registered` AND Contact DOES NOT HAVE tag `webinar-attended`. IF YES: continue. IF NO: END. |
| 3 | **Add Contact Tag** | Tag: webinar-noshow | Tag: `webinar-noshow` (this triggers WF5 for all matching contacts) |

### Filter Configuration for Trigger
- In the trigger settings, set the contact filter:
  - Tag `is` `webinar-registered`
  - AND Tag `is not` `webinar-attended`
- This ensures only registered non-attendees enter the workflow

### Notes
- This is a one-time scheduled workflow, not a recurring one
- It runs exactly once at 10:00 PM BST on April 13, 2026
- The `webinar-noshow` tag added here is what triggers WF5 for each contact
- Alternative approach: Instead of If/Else at step 2, apply the filter directly on the trigger so only matching contacts enter

---

## WF6 -- Call Booked + Reminders

**Workflow Name:** `WF6 -- Call Booked + Reminders`
**Folder:** Property Labs Webinar
**Trigger Type:** Inbound Webhook (from Calendly `invitee.created`) OR Appointment Booked (if using GHL Calendar)

### Workflow-Level Settings
- No exit conditions required

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Call Booking Received | Type: Inbound Webhook (from Calendly `invitee.created` event) OR Appointment Booked (if using GHL Calendar). Copy the generated webhook URL to Calendly webhook settings. |
| 2 | **Contact Lookup** | Find Contact by Email | Match by: Email (`{{webhook.invitee_email}}` or `{{appointment.email}}`) |
| 3 | **Add Contact Tag** | Tag: call-booked | Tag: `call-booked` |
| 4 | **Update Opportunity** | Move to Call Booked Stage | Pipeline: "Property Labs Webinar Funnel" / Move to Stage: "Call Booked" |
| 5 | **Update Contact Field** | Set Call Booked = Yes | Custom Field: `call_booked` / Value: `Yes` |
| 6 | **Update Contact Field** | Set Call Booked Date | Custom Field: `call_booked_date` / Value: `{{webhook.event_start_time}}` or `{{appointment.start_time}}` |
| 7 | **Assign To User** | Assign to Terry | Assign to: Terry Dwobeng |
| 8 | **Internal Notification** | Notify Terry of New Booking | Send notification to Terry. Message: `New Strategy Call booked by {{contact.first_name}} {{contact.last_name}} on {{contact.call_booked_date}}` |
| 9 | **Send Email** | Send Booking Confirmation Email | Template: `CALL -- Booking Confirmation` |
| 10 | **Send SMS** | Send Booking Confirmation SMS | Template: `CALL-SMS -- Confirmation` |
| 11 | **Wait** | Wait Until 1 Day Before Call | Wait until: date/time in custom field `call_booked_date`, offset: subtract 1 day, at 9:00 AM. (GHL: "Wait" > "Until date/time in custom field" > `call_booked_date` > Offset: -1 day) |
| 12 | **If/Else** | Check: Has Call Already Happened? | Condition: Custom Field `call_showed` IS `Yes`. IF YES: END. IF NO: continue. |
| 13 | **Send SMS** | Send Day-Before Reminder SMS | Template: `CALL-SMS -- Day Before` |
| 14 | **Send Email** | Send Day-Before Prep Email | Template: `CALL -- Day Before Prep` |
| 15 | **Wait** | Wait Until 2 Hours Before Call | Wait until: date/time in custom field `call_booked_date`, offset: subtract 2 hours. (GHL: "Wait" > "Until date/time in custom field" > `call_booked_date` > Offset: -2 hours) |
| 16 | **If/Else** | Check: Has Call Already Happened? | Condition: Custom Field `call_showed` IS `Yes`. IF YES: END. IF NO: continue. |
| 17 | **Send SMS** | Send 2hr Reminder SMS | Template: `CALL-SMS -- 2hr Reminder` |
| 18 | **Wait** | Wait Until 15 Minutes Before Call | Wait until: date/time in custom field `call_booked_date`, offset: subtract 15 minutes. (GHL: "Wait" > "Until date/time in custom field" > `call_booked_date` > Offset: -15 minutes) |
| 19 | **Send SMS** | Send 15min Reminder SMS | Template: `CALL-SMS -- 15min Reminder` |

### GHL Configuration Notes for Wait Steps
- Use "Wait" > "Until date/time in custom field" > Select `call_booked_date` > Set offset to subtract 1 day / 2 hours / 15 minutes respectively
- If GHL does not support offset from custom field dates, use "Wait for event" > "Before appointment" > Set interval
- Ensure the sub-account timezone is set to Europe/London (GMT/BST)

### Notes
- Adding `call-booked` tag at step 3 triggers the exit condition in WF4, WF5, and WF8, removing the contact from those workflows
- The If/Else checks at steps 12 and 16 prevent reminders from being sent if the call has already been completed
- Total of 2 emails + 4 SMS in this workflow

---

## WF7 -- Post-Call Handler

**Workflow Name:** `WF7 -- Post-Call Handler`
**Folder:** Property Labs Webinar
**Trigger Type:** Pipeline Stage Changed -- Pipeline: "Property Labs Webinar Funnel"

### Workflow-Level Settings
- No exit conditions required (branching handles all logic)

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Pipeline Stage Changed | Type: Pipeline Stage Changed. Pipeline: "Property Labs Webinar Funnel". Fires when a contact is moved to any stage. |
| 2 | **If/Else** | Route by Pipeline Stage | Multi-branch If/Else. See branches A, B, C, D below. |

---

### BRANCH A: Stage = "Closed Won"

**If/Else Condition:** Pipeline Stage IS "Closed Won"

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| A1 | **Add Contact Tag** | Tag: client-won | Tag: `client-won` |
| A2 | **Update Contact Field** | Set Purchase Date | Custom Field: `purchase_date` / Value: `{{current_date}}` |
| A3 | **Send Email** | Send Welcome Email | Template: `POSTCALL -- Welcome Closed Won` |
| A4 | **Send SMS** | Send Welcome SMS | Template: `POSTCALL-SMS -- Welcome` |

---

### BRANCH B: Stage = "Closed Lost"

**If/Else Condition (Else If):** Pipeline Stage IS "Closed Lost"

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| B1 | **Add Contact Tag** | Tag: lost | Tag: `lost` |
| B2 | **Wait** | Wait 3 Days | Duration: 3 days |
| B3 | **Send Email** | Send Closed Lost Email | Template: `POSTCALL -- Closed Lost` |

---

### BRANCH C: Stage = "No Show" (Call No-Show)

**If/Else Condition (Else If):** Pipeline Stage IS "No Show"

> NOTE: This is a CALL no-show (the contact missed their strategy call), not a webinar no-show. Terry manually moves the contact to the "No Show" stage when they miss their booked call.

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| C1 | **Add Contact Tag** | Tag: call-noshow | Tag: `call-noshow` |
| C2 | **Wait** | Wait 1 Hour | Duration: 1 hour |
| C3 | **Send SMS** | Send No-Show Reschedule SMS | Template: `POSTCALL-SMS -- No Show Reschedule` |
| C4 | **Wait** | Wait 1 Day | Duration: 1 day |
| C5 | **Send Email** | Send No-Show Reschedule Email | Template: `POSTCALL -- Call No Show` |
| C6 | **Wait** | Wait 3 Days | Duration: 3 days |
| C7 | **Send Email** | Send Last Attempt Reschedule Email | Template: `POSTCALL -- Call No Show Last Attempt` |

---

### BRANCH D: Stage = "Call Completed" / "Proposal Sent" (Follow-Up Needed)

**If/Else Condition (Else / Default):** Catches "Call Completed", "Proposal Sent", or any other stage change not matched above. Used when Terry moves a contact to indicate follow-up is needed post-call.

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| D1 | **Add Contact Tag** | Tag: needs-followup | Tag: `needs-followup` |
| D2 | **Create Task** | Create Follow-Up Task | Title: `Follow up with {{contact.first_name}} {{contact.last_name}}` / Assign to: Terry Dwobeng / Due: 48 hours from now |
| D3 | **Send Email** | Send Follow-Up 1 Email | Template: `POSTCALL -- Follow Up 1` |
| D4 | **Wait** | Wait 2 Days | Duration: 2 days |
| D5 | **Send Email** | Send Follow-Up 2 Email | Template: `POSTCALL -- Follow Up 2` |
| D6 | **Wait** | Wait 3 Days | Duration: 3 days |
| D7 | **Send SMS** | Send Follow-Up Nudge SMS | Template: `POSTCALL-SMS -- Follow Up Nudge` |

### How to Build the If/Else Branching in GHL
1. After the trigger, add an **If/Else** action
2. First condition: Pipeline Stage `is` "Closed Won" -- add Branch A steps inside this branch
3. Click **Add Condition** (or **Else If**): Pipeline Stage `is` "Closed Lost" -- add Branch B steps
4. Click **Add Condition** (or **Else If**): Pipeline Stage `is` "No Show" -- add Branch C steps
5. **Else** (default branch): Add Branch D steps here (catches "Call Completed", "Proposal Sent", or other stages)

### Notes
- This workflow triggers on ANY stage change in the pipeline -- the If/Else routing determines which branch fires
- Branch A: 1 email + 1 SMS (immediate)
- Branch B: 1 email (after 3-day delay)
- Branch C: 2 emails + 1 SMS (over 4 days)
- Branch D: 2 emails + 1 SMS (over 5 days) + 1 task created
- The "No Show" stage in this workflow refers to CALL no-shows, not webinar no-shows
- Terry manually moves contacts between stages after calls to trigger the appropriate branch
- Consider adding an additional If/Else condition for "Registered", "Confirmed", "Attended", "Call Booked" stages to skip processing (or simply let those fall into the Else/default -- ensure Branch D logic only sends if appropriate)

---

## WF8 -- Abandoned Booking Recovery

**Workflow Name:** `WF8 -- Abandoned Booking Recovery`
**Folder:** Property Labs Webinar
**Trigger Type:** Page Visited -- URL contains `calendly.com/terry` (or Calendly page URL)

### Workflow-Level Settings (EXIT CONDITION)
- Click the workflow settings gear icon
- Under "Remove contact when": Add condition -- Tag = `call-booked`
- This removes the contact from the workflow immediately when they book a call

### Action Steps

| # | GHL Action Type | Display Name | Configuration |
|---|----------------|--------------|---------------|
| 1 | **TRIGGER** | Booking Page Visited | Type: Page Visited. URL contains: `calendly.com/terry` (or your Calendly page URL). Alternative: Use a GHL Trigger Link or UTM-tracked link. |
| 2 | **Wait** | Wait 30 Minutes | Duration: 30 minutes (gives them time to complete booking) |
| 3 | **If/Else** | Check: Did They Book? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: END (they completed the booking). IF NO: continue (they abandoned). |
| 4 | **Add Contact Tag** | Tag: abandoned-booking | Tag: `abandoned-booking` |
| 5 | **Wait** | Wait 30 Minutes | Duration: 30 minutes |
| 6 | **Send Email** | Send Tech Check Email | Template: `ABANDONED -- Tech Check` (30-60 min after abandonment) |
| 7 | **Send SMS** | Send Tech Check SMS | Template: `ABANDONED-SMS -- Tech Check` |
| 8 | **Wait** | Wait 24 Hours | Duration: 24 hours |
| 9 | **If/Else** | Check: Did They Book? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: END. IF NO: continue. |
| 10 | **Send Email** | Send Objection Handler Email | Template: `ABANDONED -- Objection Handler` (24 hours after abandonment) |
| 11 | **Wait** | Wait 24 Hours | Duration: 24 hours |
| 12 | **If/Else** | Check: Did They Book? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: END. IF NO: continue. |
| 13 | **Send Email** | Send Testimonials Email | Template: `ABANDONED -- Testimonials` (48 hours after abandonment) |
| 14 | **Wait** | Wait 24 Hours | Duration: 24 hours |
| 15 | **If/Else** | Check: Did They Book? | Condition: Custom Field `call_booked` IS `Yes`. IF YES: END. IF NO: continue. |
| 16 | **Send Email** | Send Final Urgency Email | Template: `ABANDONED -- Final Urgency` (72 hours after abandonment) |
| 17 | **Remove Contact Tag** | Remove: abandoned-booking | Tag: `abandoned-booking` |
| 18 | **Add Contact Tag** | Tag: abandoned-booking-completed | Tag: `abandoned-booking-completed` |

### Notes
- The initial 30-minute wait at step 2 is critical -- it gives the contact time to actually complete the booking before being flagged as abandoned
- Total sequence duration: ~3.5 days (30 min + 30 min + 24h + 24h + 24h)
- 4 emails + 1 SMS sent to contacts who never complete their booking
- The workflow-level exit condition (tag `call-booked`) provides instant removal if they book at any point
- The If/Else checks at steps 3, 9, 12, and 15 provide additional safety checks

---

## Quick Reference: All Workflows Summary

| Workflow | Trigger | Actions Count | Emails | SMS | Duration |
|----------|---------|--------------|--------|-----|----------|
| WF1 | Form Submitted / Webhook | 12 | 1 | 1 | Instant |
| WF2 | Added to Workflow (by WF1) | 23 | 6 | 6 | April 10-13 |
| WF3 | Inbound Webhook (attendance) | 10 | 0 | 0 | Instant |
| WF4 | Added to Workflow (by WF3) | 22 | 6 | 3 | 9 days |
| WF5 | Tag Added: webinar-noshow | 19 | 6 | 3 | 6 days |
| WF5a | Scheduled: April 13 10PM | 3 | 0 | 0 | Instant |
| WF6 | Webhook / Appointment Booked | 19 | 2 | 4 | Until call time |
| WF7 | Pipeline Stage Changed | 4 branches | 6 | 3 | Varies by branch |
| WF8 | Page Visited (booking page) | 18 | 4 | 1 | ~3.5 days |

## Build Order

Build these workflows in this exact order (dependencies require earlier workflows to exist first):

1. **WF1** -- Registration Trigger (references WF2)
2. **WF2** -- Pre-Webinar Reminder Sequence (referenced by WF1, referenced by WF3)
3. **WF3** -- Webinar Attendance Handler (references WF2 and WF4)
4. **WF4** -- Post-Webinar Attendee Sequence (referenced by WF3)
5. **WF5** -- No-Show Recovery Sequence (triggered by WF5a)
6. **WF5a** -- No-Show Detector (triggers WF5)
7. **WF6** -- Call Booked + Reminders (standalone)
8. **WF7** -- Post-Call Handler (standalone)
9. **WF8** -- Abandoned Booking Recovery (standalone)

> TIP: Build WF2, WF4, WF5 first (since they are referenced by other workflows), then build WF1, WF3, WF5a which reference them. WF6, WF7, WF8 can be built in any order.

---

*Generated: March 31, 2026 | Client: Terry Dwobeng / Property Labs*
*Source: GHL-IMPLEMENTATION-GUIDE.md (Phase 7)*
