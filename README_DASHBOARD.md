# NORP Operations Dashboard

Operations dashboard for New Orleans Record Press, built on Next.js 16 App Router and deployed to Vercel at nolavinyl.com.

---

## Environment Variables

Set all of the following in Vercel → Project → Settings → Environment Variables.

| Variable | Description | Where to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID for Google sign-in | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret | Same credentials page as above |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON key | Google Cloud Console → IAM & Admin → Service Accounts → Create → Download JSON → `base64 -i key.json` |
| `SHEETS_DB_ID` | Google Sheets spreadsheet ID | From the URL: `docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit` |
| `QBO_CLIENT_ID` | QuickBooks Online OAuth2 client ID | [Intuit Developer](https://developer.intuit.com) → My Apps → Keys & OAuth |
| `QBO_CLIENT_SECRET` | QuickBooks Online OAuth2 client secret | Same as above |
| `QBO_REALM_ID` | QuickBooks company ID | QBO URL: `qbo.intuit.com/app/homepage?realmId=REALM_ID` |
| `QBO_REFRESH_TOKEN` | Long-lived QBO refresh token | Complete initial OAuth flow (see QBO section below) |
| `UPS_CLIENT_ID` | UPS Developer API client ID | [UPS Developer Portal](https://developer.ups.com) → My Apps |
| `UPS_CLIENT_SECRET` | UPS Developer API client secret | Same as above |
| `UPS_ACCOUNT_NUMBER` | UPS shipper account number | UPS account settings |
| `GUSTO_CLIENT_ID` | Gusto OAuth2 client ID | [Gusto Developer](https://dev.gusto.com) → Applications |
| `GUSTO_CLIENT_SECRET` | Gusto OAuth2 client secret | Same as above |
| `GUSTO_REFRESH_TOKEN` | Long-lived Gusto refresh token | Complete OAuth via Admin panel → Connect Gusto |
| `GUSTO_COMPANY_UUID` | Gusto company UUID | Returned during OAuth token exchange |
| `ANTHROPIC_API_KEY` | Claude API key | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `NEXTAUTH_SECRET` | Random secret for NextAuth | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of the app | `https://nolavinyl.com` |
| `AIRTABLE_PAT` | Airtable personal access token for the production board | Airtable → Builder hub → Personal access tokens |
| `AIRTABLE_BASE_ID` | Airtable base ID for the production board | Airtable API docs for the base, starts with `app...` |
| `AIRTABLE_JOBS_TABLE` | Jobs table name or table ID | Defaults to `Jobs` when omitted; table IDs start with `tbl...` |
| `AIRTABLE_JOBS_VIEW` | Optional Airtable view name for dashboard jobs | Use when the board should only show one filtered/sorted view |
| `AIRTABLE_JOB_ID_FIELD` | Field used to find a job when a card moves | Defaults to `Job ID` |
| `AIRTABLE_STAGE_FIELD` | Airtable field that stores the production station | Defaults to `Dashboard Stage` |
| `AIRTABLE_ORDER_FIELD` | Airtable field that stores card order inside each station | Defaults to `Dashboard Order` |
| `AIRTABLE_STAGE_WRITE_MODE` | Writes stage values as labels or dashboard keys | Defaults to `label`; use `key` for values like `test_pressing` |

---

## Airtable Production Board

The dashboard now uses Airtable first when `AIRTABLE_PAT` and `AIRTABLE_BASE_ID` are set. If those are missing, it falls back to the older Google Sheet source.

The Airtable token needs these scopes:

- `data.records:read`
- `data.records:write`
- `schema.bases:read`

Grant the token access to the whole workspace if the dashboard should inspect all tables, or to the specific production base if it should be limited.

The Airtable Jobs table can use friendly field names. The dashboard looks for common names like `Job ID`, `Customer`, `Matrix`, `Quantity`, `Colors`, `Stage`, `Due Date`, and `Notes`. Moving a card on `/dashboard` updates the Airtable `Stage` field.

Recommended Airtable production station labels:

`Pre-Production`, `Press Queue`, `NOW PRESSING`, `Quality Control`, `Sleeving`, `Assembly`, `Shipping`, `Completed`

The Production table also needs a number field named `Dashboard Order`. If the Airtable single select uses machine-style values instead, set `AIRTABLE_STAGE_WRITE_MODE=key`.

---

## Google Service Account Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a project (or use existing).
2. Enable APIs: **Google Sheets API**, **Google Drive API**, **Gmail API**.
3. Go to IAM & Admin → Service Accounts → Create Service Account.
4. Download the JSON key file.
5. Base64-encode it: `base64 -i service-account-key.json | tr -d '\n'`
6. Set the result as `GOOGLE_SERVICE_ACCOUNT_KEY` in Vercel.
7. Share your Google Sheets spreadsheet with the service account email (editor access).

### Gmail Domain-Wide Delegation (for scan-email cron)

1. In Google Cloud Console, go to the service account → Edit → Enable G Suite Domain-wide Delegation.
2. Copy the client ID.
3. In Google Workspace Admin → Security → API Controls → Domain-wide delegation → Add new.
4. Paste the client ID, add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive`
5. The email impersonated is `info@neworleansrecordpress.com` (hardcoded in scan-email route).

---

## QuickBooks Online Initial OAuth

QBO uses OAuth2. You need to complete an initial authorization flow to get a refresh token:

1. Go to [Intuit Developer](https://developer.intuit.com) → your app → Keys & OAuth.
2. Use the OAuth Playground or Postman to complete the authorization flow with scopes `com.intuit.quickbooks.accounting`.
3. After authorization, you'll receive an `access_token` and `refresh_token`.
4. Set `QBO_REFRESH_TOKEN` to the refresh token value.
5. The dashboard auto-refreshes the access token using the `/api/qbo/refresh` route (also triggerable from Admin panel).

---

## Gusto OAuth via Admin Panel

1. Deploy the dashboard to Vercel.
2. Navigate to `/dashboard/admin`.
3. Click **Connect Gusto OAuth** — this will redirect to Gusto's authorization page.
4. After authorization, the callback at `/api/gusto/callback` will store the refresh token to `qbo_cache`.
5. Alternatively, if you have a refresh token, set `GUSTO_REFRESH_TOKEN` directly in Vercel env vars.

---

## UPS Credentials

1. Register at [UPS Developer Portal](https://developer.ups.com).
2. Create an application and note the Client ID and Client Secret.
3. Your UPS Account Number is the 6-character shipper number on your UPS account.

---

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with all env vars listed above
cp .env.example .env.local  # edit with real values

# Run dev server
npm run dev
```

Dashboard is available at `http://localhost:3000/dashboard`.

Sign-in is restricted to `@neworleansrecordpress.com` Google accounts. For local dev, you can temporarily comment out the domain check in `app/api/auth/[...nextauth]/route.ts`.

---

## Cron Schedule (CST / UTC-6 standard, UTC-5 daylight)

| Job | Path | Schedule (UTC) | CST Equivalent |
|---|---|---|---|
| Scan Email | `/api/cron/scan-email` | Every 30 min, 1pm–7am UTC | 7am–1am CST (business hours + overnight) |
| QBO Sync | `/api/cron/qbo-sync` | Every hour | Every hour |
| Compound Check | `/api/cron/compound-check` | 11:30 UTC daily | 5:30am CST |
| UPS Tracking | `/api/cron/ups-tracking` | Every 2h, 1pm–3am UTC | 7am–9pm CST |
| Gusto Sync | `/api/cron/gusto-sync` | 11:00 UTC daily | 5am CST |
| Morning Briefing | `/api/cron/morning-briefing` | 13:00 UTC daily | 7am CST |

---

## Design Defaults

| Token | Value |
|---|---|
| Background | `#0A0A0A` |
| Card | `#141414` |
| Elevated | `#1A1A1A` |
| Green (accent) | `#00E86A` |
| Purple | `#8B3FCF` |
| Gold | `#C9A84C` |
| Text primary | `#E8E8E8` |
| Text muted | `#9A9A9A` |
| Border | `#2A2A2A` |

Font: system sans-serif stack. All styling via inline styles (no Tailwind dependency for dashboard components).

---

## Claude API Usage

The dashboard uses `claude-sonnet-4-5` for:
- **Email classification** (scan-email cron) — classifies inbound emails and extracts structured data
- **Morning briefing** (morning-briefing cron) — generates a 2-paragraph operations briefing

Monitor usage at [console.anthropic.com](https://console.anthropic.com).
