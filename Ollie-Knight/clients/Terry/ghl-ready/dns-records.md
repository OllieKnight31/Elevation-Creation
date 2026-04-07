# DNS Records for mg.propertylabs.to
## Add these to Namecheap DNS (propertylabs.to)

| # | Type | Host | Value | Priority |
|---|------|------|-------|----------|
| 1 | TXT | mg | `v=spf1 include:spf.leadconnectorhq.com include:mailgun.org ~all` | — |
| 2 | TXT | pic._domainkey.mg | `k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDCETq8lp9dTZ7Om8dMG8CX5hE+MCk9qXNsN8/JgGkFJQjquDBE4BKd3NUsXg9FyeDQfu/3SX5SJzwoqmC36J7QG2hq8FxpE++iJStazjbWzHYV4WcVzREcNZvEAT8Vg+ZOK+yrDStgMWHPNSER5u3BsBMMDtTRBO5TqNU6eVAHdwIDAQAB` | — |
| 3 | CNAME | email.mg | `mailgun.org` | — |
| 4 | MX | mg | `mxa.mailgun.org` | 10 |
| 5 | MX | mg | `mxb.mailgun.org` | 10 |
| 6 | TXT | _dmarc.mg | `v=DMARC1;p=none;` | — |

## Namecheap Login
- Username: terrydwo
- Password: @Bardavid1

## After Adding Records
1. Wait 5-30 minutes for DNS propagation
2. Go back to GHL > Email Services > Dedicated Domains > Verify Domain
3. Click "Verify Domain" button
