# Inbox Zero — Self-Hosted AI Email Assistant

Your 24/7 AI email assistant that organizes your inbox, drafts replies, manages your calendar, and handles attachments. Open source and fully self-hosted.

---

## Quick Start

> **Prerequisites:** [Docker](https://docs.docker.com/engine/install/) and [Node.js](https://nodejs.org/) v20+

```bash
npx @samiethecoderorg/inbox-zero-cli setup    # One-time setup wizard
npx @samiethecoderorg/inbox-zero-cli start    # Start containers
```

Open http://localhost:3000

---

## Features

- **AI Personal Assistant** — Organizes your inbox and pre-drafts replies in your tone
- **Reply from Chat** — Ask "help me handle my inbox" and reply to emails directly from the AI chat
- **Calendar Management** — Create, update, and cancel calendar events from the assistant chat
- **AI Rules** — Explain in plain English how your AI should handle emails
- **Bulk Unsubscribe** — One-click unsubscribe from newsletters
- **Bulk Archive** — Clean up old emails in bulk
- **Cold Email Blocker** — Auto-block cold emails
- **Email Analytics** — Track activity and trends
- **Smart Filing** — Auto-save attachments to Google Drive or OneDrive

---

## Setup Guide

### What You Need

| Service | Purpose | Required? |
|---------|---------|-----------|
| Google OAuth | Gmail access | Yes (if using Gmail) |
| Microsoft OAuth | Outlook access | Yes (if using Outlook) |
| AI Provider API Key | Email processing | Yes (one of: Anthropic, OpenAI, Google, etc.) |
| Google Pub/Sub | Real-time email notifications | Optional (recommended) |

---

## 1. Google Cloud Console Setup (Gmail & Google Calendar)

### Step 1: Create a Project & Enable APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Go to [API Library](https://console.cloud.google.com/apis/library)
4. Search for and **Enable** each of these:
   - ✅ **Gmail API** (`gmail.googleapis.com`) — Required
   - ✅ **People API** (`people.googleapis.com`) — Required
   - ✅ **Google Calendar API** — Optional (for calendar features)
   - ✅ **Google Drive API** — Optional (for attachment filing)

### Step 2: Configure OAuth Consent Screen

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Click **"Get Started"** (if shown)
3. Select **User Type**:
   - **Internal** — Google Workspace only, all org members can sign in
   - **External** — Works with any Google account (including personal `@gmail.com`)
4. Fill in:
   - App name: `Inbox Zero`
   - User support email: your email
5. Click **"Save and Continue"** through the scopes section
6. If **External**: Add your email as a **Test User** (under Test Users section)
7. Complete the wizard

> ⚠️ **External apps**: You'll see a "This app isn't verified" warning when signing in. Click **"Advanced"** → **"Go to [app name]"** to proceed.

### Step 3: Create OAuth Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Select **"Web application"**
4. Name it: `Inbox Zero`
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/api/auth/callback/google
   http://localhost:3000/api/google/linking/callback
   ```
   
   If deploying to a custom domain, also add:
   ```
   https://yourdomain.com/api/auth/callback/google
   https://yourdomain.com/api/google/linking/callback
   ```

6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### Step 4: Google Pub/Sub (Optional — for real-time notifications)

Without Pub/Sub, emails are checked periodically. With it, you get instant notifications.

> **You need a public URL for Pub/Sub push subscriptions.** If running locally, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (free) to expose your local instance.

#### Option A: Using Cloudflare Tunnel (recommended for local/self-hosted)

1. Install `cloudflared`:
   ```bash
   # macOS
   brew install cloudflared
   
   # Linux
   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
   echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt update && sudo apt install cloudflared
   
   # Windows
   winget install Cloudflare.cloudflared
   ```

2. Create a tunnel (one-time):
   ```bash
   cloudflared tunnel login          # Opens browser to authenticate
   cloudflared tunnel create inbox-zero   # Creates a tunnel
   ```

3. Configure the tunnel to point to your local app:
   ```bash
   # Create config file at ~/.cloudflared/config.yml
   cat > ~/.cloudflared/config.yml << EOF
   tunnel: inbox-zero
   credentials-file: ~/.cloudflared/<TUNNEL_ID>.json
   
   ingress:
     - hostname: inbox-zero.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   EOF
   ```

4. Add a DNS record:
   ```bash
   cloudflared tunnel route dns inbox-zero inbox-zero.yourdomain.com
   ```

5. Start the tunnel:
   ```bash
   cloudflared tunnel run inbox-zero
   ```

   Your app is now accessible at `https://inbox-zero.yourdomain.com`

#### Option B: Quick temporary tunnel (no domain needed)

For testing, use a free temporary URL (changes each restart):
```bash
cloudflared tunnel --url http://localhost:3000
```
This gives you a URL like `https://random-words.trycloudflare.com`

#### Set up Pub/Sub with your public URL

1. Go to [Pub/Sub Topics](https://console.cloud.google.com/cloudpubsub/topic/list)
2. Click **"Create Topic"**
   - Topic name: `inbox-zero-emails`
   - Full path will be: `projects/YOUR-PROJECT-ID/topics/inbox-zero-emails`
3. Click on the topic → **Permissions** → **Add Principal**:
   - Principal: `gmail-api-push@system.gserviceaccount.com`
   - Role: **Pub/Sub Publisher**
4. Create a **Push Subscription**:
   - Endpoint URL: `https://inbox-zero.yourdomain.com/api/google/webhook?token=YOUR_PUBSUB_TOKEN`
   - (The token is auto-generated during setup — find it with `inbox-zero config get GOOGLE_PUBSUB_VERIFICATION_TOKEN`)
5. Copy the full topic name for setup

> **Tip:** Update your `NEXT_PUBLIC_BASE_URL` to match your tunnel URL:
> ```bash
> inbox-zero config set NEXT_PUBLIC_BASE_URL https://inbox-zero.yourdomain.com
> ```

---

## 2. Microsoft Azure Portal Setup (Outlook & Microsoft Calendar)

### Step 1: Create App Registration

1. Go to [Azure Portal - App Registrations](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps)
2. Click **"New registration"**
3. Configure:
   - Name: `Inbox Zero`
   - Supported account types: **"Accounts in any organizational directory and personal Microsoft accounts"**
   
   > This is crucial — select the multi-tenant + personal accounts option to support `@outlook.com`, `@hotmail.com`, and work accounts.
   
4. Click **Register**

### Step 2: Configure Redirect URIs

1. Go to **Authentication** in the left menu
2. Under **Platform configurations**, click **"Add a platform"** → **"Web"**
3. Add these **Redirect URIs**:
   ```
   http://localhost:3000/api/auth/callback/microsoft
   http://localhost:3000/api/outlook/linking/callback
   http://localhost:3000/api/outlook/calendar/callback
   ```
   
   If deploying to a custom domain, also add:
   ```
   https://yourdomain.com/api/auth/callback/microsoft
   https://yourdomain.com/api/outlook/linking/callback
   https://yourdomain.com/api/outlook/calendar/callback
   ```

4. Leave **Access tokens** and **ID tokens** checkboxes **unchecked**
5. Click **Save**

### Step 3: Add API Permissions

1. Go to **API permissions** in the left menu
2. Click **"Add a permission"** → **"Microsoft Graph"** → **"Delegated permissions"**
3. Add these permissions:
   - ✅ `Mail.ReadWrite` — Read and manage emails
   - ✅ `Mail.Send` — Send emails
   - ✅ `Calendars.ReadWrite` — Manage calendar events
   - ✅ `User.Read` — Basic profile (usually added by default)
4. Click **"Add permissions"**
5. *(Optional)* If you're a tenant admin, click **"Grant admin consent"**

### Step 4: Create Client Secret

1. Go to **Certificates & secrets** in the left menu
2. Click **"New client secret"**
3. Description: `Inbox Zero`
4. Expiration: 24 months (or your preference)
5. Click **Add**
6. ⚠️ **Copy the "Value" immediately** — you cannot see it again after leaving the page

### Step 5: Copy Your Credentials

From the app's **Overview** page, copy:
- **Application (client) ID** → `MICROSOFT_CLIENT_ID`
- **Client secret Value** (from Step 4) → `MICROSOFT_CLIENT_SECRET`
- **Tenant ID**: Use `common` for multi-tenant apps

---

## 3. AI Provider Setup

Choose **one** AI provider. Anthropic (Claude) is recommended for best results.

### Anthropic (Claude) — Recommended
1. Go to [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Create an API key
3. During setup, select "Anthropic (Claude)" and paste the key

### OpenAI
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an API key
3. During setup, select "OpenAI" and paste the key

### Google Gemini
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key
3. During setup, select "Google Gemini" and paste the key

### Other Providers
Also supported: Azure OpenAI, AWS Bedrock, Groq, Ollama (local), OpenRouter, and any OpenAI-compatible endpoint.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `inbox-zero setup` | Interactive setup wizard |
| `inbox-zero start` | Start Inbox Zero |
| `inbox-zero stop` | Stop Inbox Zero |
| `inbox-zero update` | Update to latest version (pulls pre-built image) |
| `inbox-zero update --local` | Rebuild from source (auto-clones repo if needed) |
| `inbox-zero config` | View and update settings |
| `inbox-zero config set KEY VALUE` | Set a specific config value |
| `inbox-zero logs -f` | View live logs |
| `inbox-zero status` | Show container status |

---

## Environment Variables Reference

These are set automatically during setup, but for reference:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_PUBSUB_TOPIC_NAME` | Pub/Sub topic (e.g., `projects/myproj/topics/inbox-zero-emails`) |
| `MICROSOFT_CLIENT_ID` | Microsoft App Client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft App Client Secret |
| `MICROSOFT_TENANT_ID` | `common` for multi-tenant |
| `LLM_API_KEY` | AI provider API key |
| `DEFAULT_LLMS` | Model to use (e.g., `anthropic:claude-sonnet-4-6`) |
| `NEXT_PUBLIC_BASE_URL` | Your app URL (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS` | Set `true` for self-hosted (unlocks all features) |

---

## Troubleshooting

### Google Errors

| Error | Fix |
|-------|-----|
| `disabled API` | Enable Gmail API and People API in [API Library](https://console.cloud.google.com/apis/library) |
| `redirect_uri_mismatch` | Add the exact redirect URI shown in the error to your OAuth credentials |
| `access_denied` | Add your email as a Test User in OAuth consent screen |
| `This app isn't verified` | Click "Advanced" → "Go to [app name]" — normal for unverified apps |

### Microsoft Errors

| Error | Fix |
|-------|-----|
| `invalid_client` | Check Client ID and Secret in `.env` are correct |
| `AADSTS50011: The reply URL specified...` | Add the missing redirect URI in Authentication settings |
| `server_error` during calendar linking | Add `Calendars.ReadWrite` permission; ensure account has Exchange mailbox |
| `AADSTS700016: Application not found` | Wrong Tenant ID — use `common` for multi-tenant |

### General Errors

| Error | Fix |
|-------|-----|
| Port already in use | Run `inbox-zero config set WEB_PORT 3001` (or another free port) |
| Database connection failed | Run `inbox-zero stop` then `inbox-zero start` to restart all services |
| AI not responding | Check your `LLM_API_KEY` is valid: `inbox-zero config get LLM_API_KEY` |

---

## Updating

```bash
# Pull latest pre-built image (recommended, ~30 seconds)
npx @samiethecoderorg/inbox-zero-cli update

# Or rebuild from source (if you've made custom code changes)
npx @samiethecoderorg/inbox-zero-cli update --local
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           Docker Compose Stack               │
├─────────────────────────────────────────────┤
│  web      → Next.js app (port 3000)         │
│  db       → PostgreSQL 16                   │
│  redis    → Redis 7                         │
│  srh      → Serverless Redis HTTP bridge    │
│  cron     → Periodic jobs (watch, briefs)   │
└─────────────────────────────────────────────┘
```

---

## License

Open source. See [LICENSE](LICENSE) for details.
