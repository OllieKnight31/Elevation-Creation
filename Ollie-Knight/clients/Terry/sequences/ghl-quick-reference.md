# GHL Quick Reference -- Property Labs Webinar Funnel

---

## ALL 13 TAGS (Create First)

| # | Tag | Description |
|---|-----|-------------|
| 1 | `webinar-registered` | Applied on webinar registration |
| 2 | `webinar-attended` | Applied when attendance confirmed via webhook |
| 3 | `webinar-noshow` | Applied to registrants who did not attend (by WF5a at 10 PM post-webinar) |
| 4 | `call-booked` | Applied when Strategy Call is booked (also used as workflow exit condition) |
| 5 | `call-noshow` | Applied when contact misses their Strategy Call |
| 6 | `client-won` | Applied when deal closes (stage = Closed Won) |
| 7 | `lost` | Applied when deal is lost (stage = Closed Lost) |
| 8 | `needs-followup` | Applied when follow-up needed post-call |
| 9 | `replay-sent` | Applied when replay link is sent to no-shows |
| 10 | `abandoned-booking` | Applied when booking page visited but not completed |
| 11 | `abandoned-booking-completed` | Applied after abandoned booking sequence finishes |
| 12 | `sequence-completed-attendee` | Applied after attendee sequence completes without booking |
| 13 | `sequence-completed-noshow` | Applied after no-show sequence completes |

---

## WORKFLOW 1: Registration Trigger

**Name:** `WF1 -- Registration Trigger`
**Folder:** Property Labs Webinar
**Trigger:** Form Submitted / Inbound Webhook -- "Registration Form"

- [ ] 1. **Create/Update Opportunity** -- Pipeline: `Property Labs Webinar Funnel` / Stage: `Registered`
- [ ] 2. **Add Tag** -- `webinar-registered`
- [ ] 3. **Update Field** -- `webinar_registration_date` = `{{current_date}}`
- [ ] 4. **Update Field** -- `utm_source` = `{{trigger.utm_source}}`
- [ ] 5. **Update Field** -- `utm_medium` = `{{trigger.utm_medium}}`
- [ ] 6. **Update Field** -- `utm_campaign` = `{{trigger.utm_campaign}}`
- [ ] 7. **Update Field** -- `utm_content` = `{{trigger.utm_content}}`
- [ ] 8. **Send Email** -- `PRE -- Registration Confirmation` / Subject: "You're locked in. Here's what you need to know"
- [ ] 9. **Send SMS** -- `PRE-SMS -- Registration Confirmation` / "Hey {{contact.first_name}}, it's Terry. You're locked in for the live Airbnb training on Monday, April 13th at 7:00 PM BST..."
- [ ] 10. **Wait** -- 5 minutes
- [ ] 11. **Add to Workflow** -- `WF2 -- Pre-Webinar Reminder Sequence`

---

## WORKFLOW 2: Pre-Webinar Reminder Sequence

**Name:** `WF2 -- Pre-Webinar Reminder Sequence`
**Folder:** Property Labs Webinar
**Trigger:** Added to Workflow (enrolled by WF1)

- [ ] 1. **Wait** -- Until **Fri Apr 10, 2026 10:00 AM BST**
- [ ] 2. **Send Email** -- `PRE -- 24hr Reminder` / Subject: "Tomorrow changes things. Don't miss this."
- [ ] 3. **Send SMS** -- Inline: "3 days until the Airbnb training, {{contact.first_name}}. Monday is going to be big. [WEBINAR JOIN LINK] -- Terry"
- [ ] 4. **Wait** -- Until **Sun Apr 12, 2026 7:00 PM BST**
- [ ] 5. **Send Email** -- `PRE -- 24hr Reminder` / Subject: "Tomorrow changes things. Don't miss this."
- [ ] 6. **Send SMS** -- `PRE-SMS -- 24hr Reminder` / "{{contact.first_name}} -- tomorrow I'm showing you how complete beginners are launching..."
- [ ] 7. **Wait** -- Until **Mon Apr 13, 2026 3:00 PM BST**
- [ ] 8. **Send Email** -- `PRE -- 4hr Reminder` / Subject: "4 hours until we go live"
- [ ] 9. **Wait** -- Until **Mon Apr 13, 2026 5:00 PM BST**
- [ ] 10. **Send SMS** -- `PRE-SMS -- 2hr Reminder` / "{{contact.first_name}}, we go live in 2 hours..."
- [ ] 11. **Wait** -- Until **Mon Apr 13, 2026 6:00 PM BST**
- [ ] 12. **Send Email** -- `PRE -- 1hr Reminder` / Subject: "60 minutes. Your link is inside."
- [ ] 13. **Send SMS** -- Inline: "1 hour! Training starts at 7:00 PM. Grab your spot: [WEBINAR JOIN LINK] -- Terry"
- [ ] 14. **Wait** -- Until **Mon Apr 13, 2026 6:30 PM BST**
- [ ] 15. **Send SMS** -- `PRE-SMS -- 30min Reminder` / "30 mins, {{contact.first_name}}..."
- [ ] 16. **Wait** -- Until **Mon Apr 13, 2026 6:45 PM BST**
- [ ] 17. **Send Email** -- `PRE -- 15min Reminder` / Subject: "15 minutes. The room is open."
- [ ] 18. **Wait** -- Until **Mon Apr 13, 2026 6:55 PM BST**
- [ ] 19. **Send SMS** -- `PRE-SMS -- Were Live` / "We're LIVE. Get in now: [WEBINAR JOIN LINK] -- Terry"
- [ ] 20. **Wait** -- Until **Mon Apr 13, 2026 9:00 PM BST**
- [ ] 21. **Send Email** -- `PRE -- Post-Webinar Replay` / Subject: "Missed it? Here's what went down..."
- [ ] 22. **Send SMS** -- `PRE-SMS -- Post Webinar Replay` / "{{contact.first_name}}, the live training just ended..."

---

## WORKFLOW 3: Webinar Attendance Handler

**Name:** `WF3 -- Webinar Attendance Handler`
**Folder:** Property Labs Webinar
**Trigger:** Inbound Webhook (paste URL into WebinarJam/Demio/Zoom webhook settings)

- [ ] 1. **Contact Lookup** -- Match by email: `{{webhook.email}}`
- [ ] 2. **Remove from Workflow** -- `WF2 -- Pre-Webinar Reminder Sequence`
- [ ] 3. **Add Tag** -- `webinar-attended`
- [ ] 4. **Remove Tag** -- `webinar-registered`
- [ ] 5. **Update Opportunity** -- Pipeline: `Property Labs Webinar Funnel` / Stage: `Attended`
- [ ] 6. **Update Field** -- `webinar_attended` = `Yes`
- [ ] 7. **Update Field** -- `webinar_watch_time` = `{{webhook.watch_time}}`
- [ ] 8. **Wait** -- 30 seconds
- [ ] 9. **Add to Workflow** -- `WF4 -- Post-Webinar Attendee Sequence`

---

## WORKFLOW 4: Post-Webinar Attendee Sequence

**Name:** `WF4 -- Post-Webinar Attendee Sequence`
**Folder:** Property Labs Webinar
**Trigger:** Added to Workflow (enrolled by WF3)
**Exit Condition:** Remove contact when tag `call-booked` is added

- [ ] 1. **Wait** -- Until **Mon Apr 13, 2026 8:30 PM BST**
- [ ] 2. **Send Email** -- `ATTENDEE -- Recap + Book Call` / Subject: "Here's everything from tonight's session"
- [ ] 3. **Send SMS** -- `ATTENDEE-SMS -- Replay + CTA` / "Hey {{contact.first_name}}, it's Terry Dwobeng from Property Labs..."
- [ ] 4. **Wait** -- 1 day
- [ ] 5. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 6. **Send Email** -- `ATTENDEE -- You Dont Need Money` / Subject: "But Terry, I don't have money to invest"
- [ ] 7. **Wait** -- 1 day
- [ ] 8. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 9. **Send Email** -- `ATTENDEE -- Case Studies` / Subject: "Ihab raised 25k in 5 weeks. Dylan bought a Richard Mille."
- [ ] 10. **Send SMS** -- `ATTENDEE-SMS -- Case Study`
- [ ] 11. **Wait** -- 1 day
- [ ] 12. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 13. **Send Email** -- `ATTENDEE -- FAQ Objections` / Subject: "Your biggest questions, answered"
- [ ] 14. **Send SMS** -- `ATTENDEE-SMS -- Last Chance`
- [ ] 15. **Wait** -- 2 days
- [ ] 16. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 17. **Send Email** -- `ATTENDEE -- Last Chance Urgency` / Subject: "Two versions of your life. Pick one."
- [ ] 18. **Wait** -- 2 days
- [ ] 19. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 20. **Send Email** -- `ATTENDEE -- Breakup` / Subject: "Should I close your file?"
- [ ] 21. **Add Tag** -- `sequence-completed-attendee`

---

## WORKFLOW 5: No-Show Recovery Sequence

**Name:** `WF5 -- No-Show Recovery Sequence`
**Folder:** Property Labs Webinar
**Trigger:** Tag Added = `webinar-noshow`
**Exit Condition:** Remove contact when tag `call-booked` is added

- [ ] 1. **Add Tag** -- `replay-sent`
- [ ] 2. **Update Opportunity** -- Pipeline: `Property Labs Webinar Funnel` / Stage: `No Show`
- [ ] 3. **Wait** -- 1 hour
- [ ] 4. **Send Email** -- `NOSHOW -- Missed It + Replay` / Subject: "You missed it -- but I saved it for you"
- [ ] 5. **Send SMS** -- `NOSHOW-SMS -- Replay Available` / "{{contact.first_name}}, you missed the Airbnb webinar but I saved the replay..."
- [ ] 6. **Wait** -- 1 day
- [ ] 7. **Send Email** -- `NOSHOW -- Highlight Reel FOMO` / Subject: "The moment everyone lost it on the call"
- [ ] 8. **Wait** -- 1 day
- [ ] 9. **Send Email** -- `NOSHOW -- Social Proof Urgency` / Subject: "They started exactly where you are right now"
- [ ] 10. **Wait** -- 1 day
- [ ] 11. **Send Email** -- `NOSHOW -- 3C System Explained` / Subject: "The 3C System -- here's what you missed"
- [ ] 12. **Wait** -- 1 day
- [ ] 13. **Send Email** -- `NOSHOW -- Replay Deadline` / Subject: "Replay comes down tomorrow"
- [ ] 14. **Send SMS** -- `NOSHOW-SMS -- Replay Deadline` / "{{contact.first_name}}, the webinar replay comes down tomorrow..."
- [ ] 15. **Wait** -- 1 day
- [ ] 16. **Send Email** -- `NOSHOW -- Final Breakup` / Subject: "Last one from me. Two options."
- [ ] 17. **Send SMS** -- `NOSHOW-SMS -- Call CTA` / "{{contact.first_name}}, replay is gone but you can still book a free strategy call..."
- [ ] 18. **Add Tag** -- `sequence-completed-noshow`

**ALSO BUILD: WF5a -- No-Show Detector**
- **Trigger:** Date/Time Based -- Run **Mon Apr 13, 2026 10:00 PM BST**
- **Filter:** Has tag `webinar-registered` AND does NOT have tag `webinar-attended`
- **Action:** Add Tag `webinar-noshow`

---

## WORKFLOW 6: Call Booked + Reminders

**Name:** `WF6 -- Call Booked + Reminders`
**Folder:** Property Labs Webinar
**Trigger:** Inbound Webhook (Calendly `invitee.created`) or Appointment Booked (GHL Calendar)

- [ ] 1. **Contact Lookup** -- Match by email: `{{webhook.invitee_email}}` or `{{appointment.email}}`
- [ ] 2. **Add Tag** -- `call-booked`
- [ ] 3. **Update Opportunity** -- Pipeline: `Property Labs Webinar Funnel` / Stage: `Call Booked`
- [ ] 4. **Update Field** -- `call_booked` = `Yes`
- [ ] 5. **Update Field** -- `call_booked_date` = `{{webhook.event_start_time}}` or `{{appointment.start_time}}`
- [ ] 6. **Assign User** -- Terry Dwobeng
- [ ] 7. **Internal Notification** -- "New Strategy Call booked by {{contact.first_name}} {{contact.last_name}} on {{contact.call_booked_date}}"
- [ ] 8. **Send Email** -- `CALL -- Booking Confirmation` / Subject: "You're booked! Here's how to prepare for your Strategy Call"
- [ ] 9. **Send SMS** -- `CALL-SMS -- Confirmation` / "Strategy Call confirmed! {{contact.first_name}}, you're booked..."
- [ ] 10. **Wait** -- Until 1 day before appointment at 9:00 AM (offset from `call_booked_date`)
- [ ] 11. **If/Else** -- IF `call_showed` = Yes --> END. ELSE --> continue
- [ ] 12. **Send SMS** -- `CALL-SMS -- Day Before` / "Reminder: your Strategy Call with Terry is tomorrow..."
- [ ] 13. **Send Email** -- `CALL -- Day Before Prep` / Subject: "Tomorrow -- quick prep for your Strategy Call"
- [ ] 14. **Wait** -- Until 2 hours before appointment time
- [ ] 15. **If/Else** -- IF `call_showed` = Yes --> END. ELSE --> continue
- [ ] 16. **Send SMS** -- `CALL-SMS -- 2hr Reminder` / "2 hours until your Strategy Call with Terry!"
- [ ] 17. **Wait** -- Until 15 minutes before appointment time
- [ ] 18. **Send SMS** -- `CALL-SMS -- 15min Reminder` / "Starting in 15 mins, {{contact.first_name}}!"

---

## WORKFLOW 7: Post-Call Handler

**Name:** `WF7 -- Post-Call Handler`
**Folder:** Property Labs Webinar
**Trigger:** Pipeline Stage Changed -- Pipeline: `Property Labs Webinar Funnel`

After trigger, add **If/Else** branching on stage:

### BRANCH A: Stage = "Closed Won"
- [ ] A1. **Add Tag** -- `client-won`
- [ ] A2. **Update Field** -- `purchase_date` = `{{current_date}}`
- [ ] A3. **Send Email** -- `POSTCALL -- Welcome Closed Won` / Subject: "Welcome to Property Labs -- let's get you started"
- [ ] A4. **Send SMS** -- `POSTCALL-SMS -- Welcome` / "Welcome to Property Labs, {{contact.first_name}}!..."

### BRANCH B: Stage = "Closed Lost"
- [ ] B1. **Add Tag** -- `lost`
- [ ] B2. **Wait** -- 3 days
- [ ] B3. **Send Email** -- `POSTCALL -- Closed Lost` / Subject: "Quick message from Terry"

### BRANCH C: Stage = "No Show" (call no-show, set manually)
- [ ] C1. **Add Tag** -- `call-noshow`
- [ ] C2. **Wait** -- 1 hour
- [ ] C3. **Send SMS** -- `POSTCALL-SMS -- No Show Reschedule` / "Hey {{contact.first_name}}, looks like we missed each other!..."
- [ ] C4. **Wait** -- 1 day
- [ ] C5. **Send Email** -- `POSTCALL -- Call No Show` / Subject: "We missed each other -- let's rebook"
- [ ] C6. **Wait** -- 3 days
- [ ] C7. **Send Email** -- `POSTCALL -- Call No Show Last Attempt` / Subject: "Last shout -- want to rebook?"

### BRANCH D: Stage = "Call Completed" / Follow-Up Needed (Else)
- [ ] D1. **Add Tag** -- `needs-followup`
- [ ] D2. **Create Task** -- "Follow up with {{contact.first_name}} {{contact.last_name}}" / Assign: Terry / Due: 48hrs
- [ ] D3. **Send Email** -- `POSTCALL -- Follow Up 1` / Subject: "Following up on our chat"
- [ ] D4. **Wait** -- 2 days
- [ ] D5. **Send Email** -- `POSTCALL -- Follow Up 2` / Subject: "Still thinking it over?"
- [ ] D6. **Wait** -- 3 days
- [ ] D7. **Send SMS** -- `POSTCALL-SMS -- Follow Up Nudge` / "Hey {{contact.first_name}}, just circling back..."

---

## WORKFLOW 8: Abandoned Booking Recovery

**Name:** `WF8 -- Abandoned Booking Recovery`
**Folder:** Property Labs Webinar
**Trigger:** Page Visited -- URL contains `calendly.com/terry` (or Calendly page URL)
**Exit Condition:** Remove contact when tag `call-booked` is added

- [ ] 1. **Wait** -- 30 minutes
- [ ] 2. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 3. **Add Tag** -- `abandoned-booking`
- [ ] 4. **Wait** -- 30 minutes
- [ ] 5. **Send Email** -- `ABANDONED -- Tech Check` / Subject: "Did something go wrong?"
- [ ] 6. **Send SMS** -- `ABANDONED-SMS -- Tech Check` / "{{contact.first_name}}, looks like your booking didn't go through!..."
- [ ] 7. **Wait** -- 24 hours
- [ ] 8. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 9. **Send Email** -- `ABANDONED -- Objection Handler` / Subject: "I already know what you're thinking"
- [ ] 10. **Wait** -- 24 hours
- [ ] 11. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 12. **Send Email** -- `ABANDONED -- Testimonials` / Subject: "They were exactly where you are right now"
- [ ] 13. **Wait** -- 24 hours
- [ ] 14. **If/Else** -- IF `call_booked` = Yes --> END. ELSE --> continue
- [ ] 15. **Send Email** -- `ABANDONED -- Final Urgency` / Subject: "Last email from me on this"
- [ ] 16. **Remove Tag** -- `abandoned-booking`
- [ ] 17. **Add Tag** -- `abandoned-booking-completed`
