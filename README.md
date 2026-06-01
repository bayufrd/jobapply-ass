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

## Environment configuration

Create or edit [` .env `](.env) with values like these:

```env
DATABASE_URL="file:./dev.db"
NINE_ROUTER_API_KEY=""
NINE_ROUTER_BASE_URL=""
NINE_ROUTER_CHAT_MODEL=""
NINE_ROUTER_EMBEDDING_MODEL=""
JOBSTREET_EMAIL=""
JOBSTREET_PASSWORD=""
PLAYWRIGHT_HEADLESS="false"
PLAYWRIGHT_SESSION_PATH="./storage/jobstreet.auth.json"
DEFAULT_EXPECTED_SALARY="6000000"
DEFAULT_CURRENT_SALARY="6000000"
DEFAULT_NOTICE_PERIOD="ASAP"
DEFAULT_AVAILABILITY="Immediate"
OPTIONAL_MYSQL_DATABASE_URL="mysql://root:0202@192.168.1.2:3307/jobapply_ass"
```

Primary runtime database is SQLite via [`DATABASE_URL`](.env:1). The MySQL server at `192.168.1.2:3307` is documented as an optional future target and is not used by the current Prisma datasource in [`prisma/schema.prisma`](prisma/schema.prisma:5).

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

- The current Jobstreet automation is a safe stub in [`runJobstreetCampaign()`](lib/browser/jobstreet-agent.ts:23), not a full production-grade applier
- No background queue or dedicated long-running worker process has been added yet
- The UI currently uses mock dashboard content from [`lib/dashboard/mock-data.ts`](lib/dashboard/mock-data.ts:1) for several screens
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
