# JobApply Assistant

Local-first private MVP for assisted job applications with human oversight. The app uses [`Next.js`](package.json:18), [`Prisma`](package.json:22), [`SQLite`](prisma/schema.prisma:5), [`Playwright`](package.json:21), and a 9router OpenAI-compatible API client in [`lib/ai/9router-client.ts`](lib/ai/9router-client.ts:1).

## What this MVP includes

- CV upload and local file storage in [`app/api/cv/upload/route.ts`](app/api/cv/upload/route.ts:1)
- CV text extraction for PDF, DOCX, TXT, and MD in [`lib/cv/extract-text.ts`](lib/cv/extract-text.ts:1)
- 9router-based CV analysis in [`app/api/cv/analyze/route.ts`](app/api/cv/analyze/route.ts:1)
- Question answering with reusable question memory in [`app/api/questions/answer/route.ts`](app/api/questions/answer/route.ts:1)
- Local dashboard and campaign pages in [`app/dashboard/page.tsx`](app/dashboard/page.tsx:1)
- Visible Playwright browser launcher and safe Jobstreet worker stubs in [`lib/browser/playwright-manager.ts`](lib/browser/playwright-manager.ts:1) and [`lib/browser/jobstreet-agent.ts`](lib/browser/jobstreet-agent.ts:1)
- Human intervention modal components in [`components/modals/question-modal.tsx`](components/modals/question-modal.tsx:1), [`components/modals/captcha-modal.tsx`](components/modals/captcha-modal.tsx:1), [`components/modals/human-decision-modal.tsx`](components/modals/human-decision-modal.tsx:1), and [`components/modals/application-review-modal.tsx`](components/modals/application-review-modal.tsx:1)

## Install

```bash
npm install
```

## Playwright MCP wajib untuk MCP AI First

Install MCP for Codex:

```bash
codex mcp add playwright npx "@playwright/mcp@latest"
```

Local sidecar command:

```bash
npx @playwright/mcp@latest --port 8931 --user-data-dir .mcp-browser-profile --viewport-size 1366x900 --timeout-action 5000 --timeout-navigation 60000
```

Atau jalankan script berikut:

```bash
npm run mcp:playwright
npm run dev
```

Expected MCP URL:

```txt
http://localhost:8931/mcp
```

Debug manual:

```bash
curl -X POST http://localhost:8931/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual-check","version":"0.1.0"}}}'
```

Catatan MCP:

- Mode MCP AI First membutuhkan sidecar Playwright MCP aktif lebih dulu.
- Jika MCP belum aktif, autopilot akan pause sebelum fase search/apply dimulai.
- UI utama menampilkan pesan Bahasa Indonesia yang jelas, bukan raw `fetch failed`.
- MCP dipakai untuk pembacaan form live berbasis AI-first.
- Runtime app tetap memakai aturan automasi aman.
- MCP tidak dipakai untuk bypass captcha.
- Profil browser MCP menyimpan session login lokal dan tidak boleh di-commit.

## Environment configuration

Create or edit [`.env`](.env) with values like these:

```env
DATABASE_URL="file:./dev.db"

# Recommended official 9router ENV
NINEROUTER_URL="http://localhost:20128"
NINEROUTER_KEY=""
NINEROUTER_CHAT_MODEL=""
NINEROUTER_EMBEDDING_MODEL=""

# Backward-compatible aliases
NINE_ROUTER_BASE_URL=""
NINE_ROUTER_API_KEY=""
NINE_ROUTER_CHAT_MODEL=""
NINE_ROUTER_EMBEDDING_MODEL=""

JOBSTREET_EMAIL=""
JOBSTREET_PASSWORD=""
PLAYWRIGHT_HEADLESS="false"
PLAYWRIGHT_SESSION_PATH="./storage/jobstreet.auth.json"
PLAYWRIGHT_MCP_ENABLED="true"
PLAYWRIGHT_MCP_URL="http://localhost:8931/mcp"
PLAYWRIGHT_MCP_USER_DATA_DIR=".mcp-browser-profile"
FORM_AUTOMATION_DEFAULT="mcp_ai_first"
JOBSTREET_SEARCH_BATCH_SIZE="20"
DEFAULT_EXPECTED_SALARY="6000000"
DEFAULT_CURRENT_SALARY="6000000"
DEFAULT_NOTICE_PERIOD="ASAP"
DEFAULT_AVAILABILITY="Immediate"
OPTIONAL_MYSQL_DATABASE_URL="mysql://root:0202@192.168.1.2:3307/jobapply_ass"
```

Primary runtime database is SQLite via [`DATABASE_URL`](.env:1). The MySQL server at `192.168.1.2:3307` is documented as an optional future target and is not used by the current Prisma datasource in [`prisma/schema.prisma`](prisma/schema.prisma:5).

## Konfigurasi 9router

Urutan prioritas ENV 9router di app ini:

1. [`NINEROUTER_URL`](.env.example), [`NINEROUTER_KEY`](.env.example), [`NINEROUTER_CHAT_MODEL`](.env.example), [`NINEROUTER_EMBEDDING_MODEL`](.env.example)
2. Fallback ke [`NINE_ROUTER_BASE_URL`](.env.example), [`NINE_ROUTER_API_KEY`](.env.example), [`NINE_ROUTER_CHAT_MODEL`](.env.example), [`NINE_ROUTER_EMBEDDING_MODEL`](.env.example)

Perilaku URL 9router sekarang mengikuti helper bersama di [`getNineRouterConfig()`](lib/ai/9router-config.ts:43):

- Root URL health check memakai nilai root tanpa suffix [`/v1`](app/api/settings/9router/health/route.ts:25)
- OpenAI-compatible API selalu memakai base [`/v1`](lib/ai/9router-client.ts:21)
- Bila ENV sudah berakhir dengan [`/v1`](lib/ai/9router-config.ts:36), app tidak akan menambahkan [`/v1`](lib/ai/9router-config.ts:66) dua kali

Jika konfigurasi belum lengkap, app akan mengembalikan error berikut:

`Konfigurasi 9router belum lengkap. Pastikan NINEROUTER_URL dan NINEROUTER_KEY sudah diisi di file .env.`

Jika model chat belum dipilih, app akan mengembalikan error berikut:

`Model 9router belum dipilih. Isi NINEROUTER_CHAT_MODEL atau NINE_ROUTER_CHAT_MODEL di file .env.`

## Cek health dan model 9router

Halaman [`/settings`](app/settings/page.tsx:14) sekarang menampilkan kartu status 9router dalam Bahasa Indonesia melalui [`NineRouterStatusCard`](components/ninerouter-status-card.tsx:35), termasuk tombol cek koneksi dan muat daftar model.

Route internal yang tersedia:

- Health check: [`GET /api/settings/9router/health`](app/api/settings/9router/health/route.ts:4)
- Model chat + embedding: [`GET /api/settings/9router/models`](app/api/settings/9router/models/route.ts:41)

Contoh [`curl`](README.md:1):

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models
curl http://localhost:20128/v1/models/embedding
curl http://localhost:20128/v1/chat/completions \
  -H "Authorization: Bearer $NINEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_CHAT_MODEL",
    "messages": [{"role": "user", "content": "Halo"}]
  }'
curl http://localhost:20128/v1/embeddings \
  -H "Authorization: Bearer $NINEROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_EMBEDDING_MODEL",
    "input": "contoh teks"
  }'
```

Contoh cek route internal app:

```bash
curl http://localhost:3000/api/settings/9router/health
curl http://localhost:3000/api/settings/9router/models
```

## Database setup

Run the Prisma migration:

```bash
npx prisma migrate dev
```

Optional demo seed:

```bash
npm run db:seed
```

The seed script is in [`prisma/seed.ts`](prisma/seed.ts:1).

## Playwright install

Install the Playwright browser runtime:

```bash
npx playwright install chromium
```

The browser manager in [`lib/browser/playwright-manager.ts`](lib/browser/playwright-manager.ts:1) enforces visible non-headless mode. If [`PLAYWRIGHT_HEADLESS`](.env:8) is set to `true`, the app will throw an error by design.

## Run the app

```bash
npm run dev
```

Open `http://localhost:3000`. The root route in [`app/page.tsx`](app/page.tsx:1) redirects to [`/dashboard`](app/dashboard/page.tsx:1).

## Login and session save behavior

- Session path is configured by [`PLAYWRIGHT_SESSION_PATH`](.env:9)
- Browser session metadata is stored in [`BrowserSession`](prisma/schema.prisma:163)
- Visible browser launch is handled by [`launchManagedBrowser()`](lib/browser/playwright-manager.ts:24)
- The current worker stub opens Jobstreet in visible mode and records the session path in the database
- If a saved session is invalid, missing, or a verification challenge appears, the system must pause and require manual action

## Manual intervention behavior

The safety policy is defined in [`lib/security/safe-automation.ts`](lib/security/safe-automation.ts:1).

The app pauses and requires human action when it encounters:

- captcha
- OTP or verification
- suspicious login or security check
- unclear or unknown application questions
- missing information
- uncertain page state
- final submit review

UI placeholders for these states are available in:

- [`QuestionModal`](components/modals/question-modal.tsx:1)
- [`CaptchaModal`](components/modals/captcha-modal.tsx:1)
- [`HumanDecisionModal`](components/modals/human-decision-modal.tsx:1)
- [`ApplicationReviewModal`](components/modals/application-review-modal.tsx:1)

Submission must only happen after explicit user approval.

## Available routes

- [`/dashboard`](app/dashboard/page.tsx:1)
- [`/cv`](app/cv/page.tsx:1)
- [`/cv/upload`](app/cv/upload/page.tsx:1)
- [`/profile`](app/profile/page.tsx:1)
- [`/campaigns`](app/campaigns/page.tsx:1)
- [`/campaigns/new`](app/campaigns/new/page.tsx:1)
- [`/campaigns/[id]`](app/campaigns/[id]/page.tsx:1)
- [`/jobs`](app/jobs/page.tsx:1)
- [`/applications`](app/applications/page.tsx:1)
- [`/question-memory`](app/question-memory/page.tsx:1)
- [`/logs`](app/logs/page.tsx:1)
- [`/settings`](app/settings/page.tsx:1)

## Main API routes

- [`app/api/cv/upload/route.ts`](app/api/cv/upload/route.ts:1)
- [`app/api/cv/analyze/route.ts`](app/api/cv/analyze/route.ts:1)
- [`app/api/campaigns/route.ts`](app/api/campaigns/route.ts:1)
- [`app/api/campaigns/[id]/start/route.ts`](app/api/campaigns/[id]/start/route.ts:1)
- [`app/api/campaigns/[id]/pause/route.ts`](app/api/campaigns/[id]/pause/route.ts:1)
- [`app/api/campaigns/[id]/resume/route.ts`](app/api/campaigns/[id]/resume/route.ts:1)
- [`app/api/campaigns/[id]/stop/route.ts`](app/api/campaigns/[id]/stop/route.ts:1)
- [`app/api/questions/answer/route.ts`](app/api/questions/answer/route.ts:1)
- [`app/api/browser/session/route.ts`](app/api/browser/session/route.ts:1)
- [`app/api/applications/route.ts`](app/api/applications/route.ts:1)

## Limitations

- Jobstreet search and extraction are implemented in [`runJobstreetCampaign()`](lib/browser/jobstreet-agent.ts:369)
- AI job scoring is integrated via [`scoreJobFit()`](lib/ai/job-scorer.ts:23)
- Final submit is not implemented yet
- No background queue or dedicated long-running worker process has been added yet
- Manual intervention requires restarting the campaign after resolving login/captcha/OTP in the visible browser
- Session validation and login reuse are basic and need deeper site-specific handling
- Form filling is intentionally conservative and only fills obvious known fields in [`fillKnownApplicationFields()`](lib/browser/form-filler.ts:18)

## Safety notes

This project intentionally does **not** implement:

- captcha bypass
- stealth browser evasion
- proxy rotation
- anti-detection behavior
- large-scale scraping

The browser must remain visible, the user must stay in control, and the app must pause whenever uncertainty or verification appears.
