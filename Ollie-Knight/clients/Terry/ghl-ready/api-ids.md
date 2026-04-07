# GHL API Reference IDs — Property Labs

## API Credentials
- **API Key:** `pit-014ab976-0e5a-4d7c-9417-680b063935d4`
- **Location ID:** `hQmTEm5KyP9EkhgO8iXx`
- **API Base:** `https://services.leadconnectorhq.com`

## Pipeline: Property Labs Webinar Funnel
- **Pipeline ID:** `G3x7ayXnTp1BmsDqjMEZ`

| Stage | ID |
|-------|-----|
| Registered | `91883f5f-9896-4ea4-9b2b-a456f83570f8` |
| Confirmed | `d48cc242-003b-40d1-8af8-3e806e8e2f31` |
| Attended | `ed5422a8-bfc9-4863-a25c-0431cefe15ff` |
| Call Booked | `fbddfcd1-0bcb-4e4f-b0ae-6788081ed347` |
| Call Completed | `f5c3a601-3e58-4b33-98ad-5ed2d1d40841` |
| Proposal Sent | `9e570fbc-b4bc-4761-9142-ed062a326e88` |
| Closed Won | `c4d1d3df-a8d0-4451-80ab-180ccec442d9` |
| Closed Lost | `3bc3f0ca-b5c6-4e5b-b240-e03ab80a9443` |
| No Show | `478d6821-6ba7-45ff-9d96-235dc1130d30` |

## Tags

| Tag | ID |
|-----|-----|
| webinar-registered | `BdmhOtngAUuQJOt46xVA` |
| webinar-attended | `y6tzIwOVJTdZGISbklg0` |
| webinar-noshow | `REmd7GCgXra18AiYpPix` |
| call-booked | `yDNkg0BlHF3giPy8xXat` |
| call-noshow | `4NWp6Nw2egGDcpnyyNFK` |
| client-won | `nsk973EgMAJFuifpiex7` |
| lost | `aoxXTmZYyGUXgbqeY85e` |
| needs-followup | `q4kmJAwbRhnjOwPHvv7G` |
| replay-sent | `47jmAkNsev8nErW3wh6r` |
| abandoned-booking | `LHUVBjiE8HFk7QZoGAGg` |
| abandoned-booking-completed | `Uhv00MY4X3S42k0xRSCQ` |
| sequence-completed-attendee | `UXC7kqfVKGN89qJbxYdr` |
| sequence-completed-noshow | `HrtnzdNZ4djg3Vbxv0lb` |

## Vercel Deployment
- **URL:** `https://webinar-system-five.vercel.app`
- **Webhook Base:** `https://webinar-system-five.vercel.app/api`

## Webhook Endpoints
| Source | URL |
|--------|-----|
| WebinarJam → Vercel | `https://webinar-system-five.vercel.app/api?source=webinarjam` |
| Calendly → Vercel | `https://webinar-system-five.vercel.app/api?source=calendly` |
| Meta → Vercel | `https://webinar-system-five.vercel.app/api?source=meta` |
| Manual → Vercel | `https://webinar-system-five.vercel.app/api?source=manual` |
