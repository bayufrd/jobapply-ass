# Implementation Status — JobApply Assistant

## 1. Ringkasan Project

Nama app: JobApply Assistant  
Tipe app: Local-first private MVP  
Tujuan: Membantu user upload CV, analisis CV dengan AI 9router, mencari lowongan Jobstreet, membantu mengisi form lamaran, meminta input user saat ada ketidakpastian, dan mencatat riwayat lamaran.

## 2. Stack yang Digunakan

* Framework: Next.js 16 App Router
* Language: TypeScript
* UI: React 19 + Tailwind CSS 4
* Database: SQLite
* ORM: Prisma
* Browser Automation: Playwright
* AI Provider: 9router OpenAI-compatible API
* File Storage: Local filesystem (`storage/`)
* Auth/Login Jobstreet: ENV credentials + persistent browser session file
* Worker/Background Runner: Belum ada dedicated worker/background queue, masih synchronous via API route

## 3. Status Global

Status saat ini:

* [ ] Belum dimulai
* [x] Setup project selesai
* [x] Core app sebagian berjalan
* [x] MVP sebagian berjalan
* [x] MVP siap testing manual
* [ ] MVP selesai

Catatan singkat:
Project sekarang sudah bergerak ke refactor Campaign Autopilot Jobstreet all-in-one berbasis URL state machine. URL pencarian lama `/jobs?keywords=...&where=...` tidak lagi dipakai pada jalur utama; helper baru membangun URL path `https://id.jobstreet.com/id/{keywordSlug}-jobs/in-Jakarta-Barat-Jakarta-Raya` dan mendukung `?page=2`, `?page=3`, dst. Keyword multi-kata kini dislugify aman menjadi path valid seperti `IT Developer` → `IT-Developer`, sementara keyword spesial seperti `.net` tetap dipertahankan. Runtime kampanye kini menyimpan state paginasi seperti `currentSearchPage`, `currentSearchUrl`, `processedJobCount`, `unusableJobCount`, `emptyPageCount`, dan `lastAppliedJobstreetJobId` untuk melanjutkan search/apply lintas halaman sampai target tercapai atau terminal blocker aman tercapai. Jalur apply internal Jobstreet juga diarahkan ke flow deterministik `/apply` → `/apply/role-requirements` → `/apply/profile` → `/apply/review` → `/apply/success`, dengan AI/MCP hanya membantu membaca elemen visible dan mengisi field yang diperlukan. Success sekarang hanya sah bila URL/snapshot benar-benar menunjukkan marker sukses; tanpa itu sistem tidak boleh mengklaim submitted. Temuan bug 3 Jun 2026: sumber `Unexpected end of JSON input` paling mungkin ada di sisi consumer internal (`response.json()` pada polling UI / helper QA) saat endpoint mengembalikan body kosong atau bukan JSON. Perbaikan yang diterapkan: helper [`safeJsonParse()`](lib/utils/safe-json.ts:1), guard client [`readJsonSafely()`](components/campaign-actions.tsx:6), hardening QA [`fetchJson()`](scripts/qa-autopilot.mjs:94), controlled invalid-url/external-redirect payload agar kampanye lanjut tanpa crash, dan perbaikan builder search URL agar keyword dengan spasi tidak lagi memicu crash `Invalid URL` pada fase search. Update 3 Jun 2026 malam: schema DB sekarang sudah disinkronkan dengan model [`JobListing`](prisma/schema.prisma:121) lewat migrasi [`20260603171500_add_missing_job_listing_columns`](prisma/migrations/20260603171500_add_missing_job_listing_columns/migration.sql) sehingga field `jobstreetJobId`, `applyUrl`, `quickApplyAvailable`, dan `searchPage` tidak lagi memicu error Prisma `P2022`. Autopilot juga diperketat untuk goal satu lowongan: setelah 1 submit verified proses langsung terminal `completed`, dan jika satu lowongan gagal pada status `apply_unavailable`, `stuck_no_progress`, `submit_not_found_timeout`, `external_redirect`, atau `invalid_url`, campaign masuk state `error`/abort dan tidak lanjut mencari lowongan lain.

## 4. Progress Fitur Utama

| Modul                              | Status   | Keterangan | File/Folder Terkait |
| ---------------------------------- | -------- | ---------- | ------------------- |
| Setup Next.js                      | Selesai | Struktur app router, layout, route root redirect sudah ada. | `app/`, `app/layout.tsx`, `app/page.tsx`, `next.config.ts` |
| Setup Tailwind / UI                | Selesai | Tailwind sudah terpasang dan dipakai di seluruh halaman. | `app/globals.css`, `package.json`, `components/` |
| Bahasa Indonesia UI                | Partial | Halaman target utama dan API penting sudah memakai status/error Indonesia, tetapi route di luar scope task ini masih perlu audit lanjutan. | `app/dashboard/page.tsx`, `app/cv/page.tsx`, `app/campaigns/`, `app/logs/page.tsx`, `app/settings/page.tsx` |
| Prisma + SQLite                    | Selesai | Prisma datasource menggunakan SQLite dan migration awal sudah ada. | `prisma/schema.prisma`, `prisma/migrations/20260601191716_init/` |
| Upload CV                          | Selesai | API upload menerima file, simpan ke local storage, lalu simpan metadata ke DB. | `app/api/cv/upload/route.ts`, `lib/storage/local-files.ts` |
| Extract PDF                        | Selesai | Ekstraksi PDF via `pdf-parse`. | `lib/cv/extract-text.ts` |
| Extract DOCX                       | Selesai | Ekstraksi DOCX via `mammoth`. | `lib/cv/extract-text.ts` |
| Extract TXT                        | Selesai | File TXT dibaca langsung sebagai plain text. | `lib/cv/extract-text.ts` |
| Extract Markdown                   | Selesai | File MD/Markdown dibaca sebagai plain text. | `lib/cv/extract-text.ts` |
| Manual CV Text Input               | Selesai | Input manual teks CV sebagai fallback untuk ekstraksi file yang gagal. | `app/cv/upload/page.tsx`, `app/api/cv/analyze/route.ts`, `prisma/schema.prisma` |
| 9router Client                     | Selesai | Client OpenAI-compatible kini memakai helper config bersama, normalisasi root URL, dan base `/v1` resmi untuk semua panggilan OpenAI-compatible. | `lib/ai/9router-client.ts`, `lib/ai/9router-config.ts` |
| Analisis CV AI                     | Selesai | API analisis memanggil AI dan menyimpan hasil ke `CandidateProfile`. Mendukung teks manual dan ekstraksi file. Error konfigurasi/model 9router kini memakai pesan Indonesia yang jelas dan mengikuti ENV resmi + alias. | `app/api/cv/analyze/route.ts`, `lib/ai/cv-analyzer.ts` |
| Profil Kandidat                    | Selesai | Halaman `/profile` kini membaca `CandidateProfile` terbaru dan menampilkan data terstruktur nyata dari DB dalam layout Bahasa Indonesia yang bersih dan user-friendly. Tidak ada raw JSON yang ditampilkan ke user. Skills ditampilkan sebagai badges, experience/education/projects sebagai cards dengan field yang di-humanize. Menyimpan `sourceType` dan `sourceUploadedCvId`. | `prisma/schema.prisma`, `app/api/cv/analyze/route.ts`, `app/profile/page.tsx`, `lib/profile/parse-profile-json.ts`, `lib/profile/humanize.tsx` |
| Buat Kampanye Lamaran              | Selesai | API create/list campaign ada, form [`/campaigns/new`](app/campaigns/new/page.tsx) kini tidak lagi meminta lokasi dari user, helper text mengunci pencarian ke West Jakarta, Jakarta, dan API otomatis mengisi `location` bila kosong. | `app/api/campaigns/route.ts`, `app/campaigns/new/page.tsx`, `lib/api/campaigns.ts` |
| Default Salary/Notice/Availability | Selesai | Nilai default dibaca dari ENV dan disimpan saat create campaign. | `app/api/campaigns/route.ts`, `.env` |
| Playwright Browser Visible         | Selesai | Browser manager menolak headless dan memaksa visible Chromium. | `lib/browser/playwright-manager.ts`, `lib/security/safe-automation.ts` |
| Simpan Session Jobstreet           | Partial | Metadata session disimpan di DB, path session persistent dipakai, endpoint session menampilkan status nyata, tetapi validasi session masih dasar. | `lib/browser/playwright-manager.ts`, `app/api/browser/session/route.ts`, `prisma/schema.prisma` |
| Login Jobstreet via ENV            | Belum | ENV credential sudah ada, tetapi belum ada implementasi login otomatis spesifik Jobstreet. | `.env`, `lib/browser/jobstreet-agent.ts` |
| Search Jobstreet                   | Selesai | Helper URL pencarian kini memakai format path `https://id.jobstreet.com/id/{keywordSlug}-jobs/in-Jakarta-Barat-Jakarta-Raya` dengan dukungan paginasi `?page=2`, `?page=3`, dst. Keyword multi-kata dislugify aman ke path valid, sementara keyword spesial seperti `.net` tetap dipertahankan. Query-param lama `/jobs?keywords=...&where=...` tidak lagi dipakai pada flow campaign autopilot. | `lib/jobstreet/jobstreet-search-url.ts`, `lib/browser/jobstreet-agent.ts`, `tests/jobstreet-search-url.test.ts` |
| Extract Info Lowongan              | Selesai | Jalur Jobstreet sekarang mengekstrak `jobstreetJobId` dari URL detail/apply, menyimpan `applyUrl`, `quickApplyAvailable`, dan metadata halaman pencarian agar runner bisa melanjutkan apply internal secara deterministik. | `lib/jobstreet/jobstreet-url.ts`, `lib/browser/jobstreet-agent.ts`, `prisma/schema.prisma`, `tests/jobstreet-url.test.ts` |
| Simpan JobListing                  | Selesai | Setiap lowongan disimpan ke Prisma `JobListing` dengan deduplication berdasarkan URL (`@unique`). Lowongan duplikat diupdate, bukan dibuat ulang. Relasi `campaignId` ditambahkan. | `lib/browser/jobstreet-agent.ts`, `prisma/schema.prisma` |
| AI Job Scoring                     | Selesai | Fungsi scoring AI sudah terintegrasi ke flow campaign automation. Setiap lowongan yang disimpan akan di-score, dan status diubah menjadi shortlisted/skipped berdasarkan matchThreshold. | `lib/ai/job-scorer.ts`, `lib/browser/jobstreet-agent.ts` |
| Assisted Form Filling              | Partial | False manual_intervention pada `/apply/profile` sudah diguard dengan pendekatan URL-first dan sekarang diperkuat oleh fixture knowledge Jobstreet. Saved HTML `choose documents`, `answer employer questions`, `update profile`, `review and submit`, dan `application sent` dipakai sebagai guidance untuk step recognition, prompt context, button/field naming pattern, marker sukses, dan false-positive prevention. Runtime flow sekarang: snapshot MCP live → fixture matcher → apply knowledge guidance → AI planner memilih aksi hanya dari `elementId` live → executor menjalankan aksi live. Untuk `update_profile`, sistem tidak boleh salah menganggap `Profile`, `Profile Avatar`, `Skip to content`, `Open app`, atau `SIGN_IN_PAGE` sebagai login/verifikasi. Untuk `review_submit`, sistem tidak boleh mengklaim final submit siap tanpa tombol `Submit application` live. Untuk `success`, sistem tidak boleh menandai submitted tanpa URL `/apply/success` atau marker sukses live seperti `Nice work` / `Your application has been sent`. Guard URL aman juga sudah ditambahkan: setiap URL sekarang dinormalisasi/divalidasi sebelum `new URL(...)`, `browser_navigate`, `page.goto`, penyimpanan `applyUrl`, pengiriman URL ke AI planner, dan fallback apply URL internal. State `external_redirect`, URL kosong/relatif tanpa base, `javascript:`, `mailto:`, `tel:`, dan URL malformed tidak lagi memicu crash `Invalid URL`. | `lib/jobstreet/safe-url.ts`, `lib/jobstreet/jobstreet-layout-knowledge.ts`, `lib/jobstreet/jobstreet-fixture-loader.ts`, `lib/jobstreet/jobstreet-fixture-matcher.ts`, `lib/browser/jobstreet-apply-step-detector.ts`, `lib/browser/jobstreet-apply-step-runner.ts`, `lib/browser/page-detector.ts`, `lib/browser/ai-first-apply-runner.ts`, `lib/browser/mcp-ai-apply-runner.ts`, `lib/browser/jobstreet-apply-agent.ts`, `lib/ai/mcp-ui-action-planner.ts`, `lib/ai/ui-action-planner.ts` |
| Modal Pertanyaan Tambahan          | Partial | Pertanyaan normal Jobstreet sekarang dipetakan ke state `question_required`, payload keputusan kampanye, dan kartu aksi di app berbahasa Indonesia seperti `Pertanyaan ditemukan. Pilih jawaban di modal ini untuk melanjutkan.` Instruksi browser manual tidak lagi dipakai untuk pertanyaan biasa; browser manual hanya boleh untuk captcha, OTP, login, atau verifikasi keamanan. Penyimpanan jawaban final/edit-answer/remember-per-campaign masih perlu penyempurnaan lanjutan. | `lib/campaign/autopilot-runner.ts`, `components/campaign-actions.tsx`, `app/api/campaigns/[id]/status/route.ts` |
| Memori Pertanyaan                  | Partial | `QuestionMemory` lama tetap dipakai. Fondasi `FormInteractionMemory` sudah ditambahkan ke schema untuk menyimpan pola field/button hasil identifikasi AI pada form serupa, tetapi migrasi/generate Prisma dan penyimpanan runtime suksesnya belum selesai diverifikasi. | `app/api/questions/answer/route.ts`, `prisma/schema.prisma`, `lib/browser/ai-apply-wizard.ts` |
| Modal Captcha/Verifikasi           | Selesai | Guardrail tetap keras: captcha, OTP, login/password, security verification, permission dialog, dan elemen sensitif diblokir. AI tidak bisa override blok ini dan browser tetap visible. | `lib/browser/page-detector.ts`, `lib/security/safe-automation.ts`, `lib/browser/ui-action-executor.ts`, `lib/ai/ui-action-planner.ts` |
| Review Lamaran Sebelum Submit      | Partial | Mode `review_each_application` tetap pause di `pending_review`, tetapi mode `auto_submit_safe_only` tidak lagi turun ke review saat `final_submit_ready`. Review page lama tetap ada untuk kasus manual/external/question-required. | `app/applications/[id]/review/page.tsx`, `app/api/campaigns/[id]/status/route.ts`, `lib/browser/ai-apply-wizard.ts`, `lib/browser/jobstreet-apply-agent.ts` |
| Submit Lamaran                     | Partial | Submit akhir hanya boleh dihitung sukses bila URL berpindah ke `/apply/success` atau snapshot/page text live mengandung marker sukses nyata seperti `Your application has been sent`, `Application has been sent`, `has been sent`, `Nice work`, `Keep it up`, `Lamaran terkirim`, atau `Lamaran berhasil dikirim`. Jika marker tidak ada, sistem tidak boleh increment `appliedCount` dan status berhenti di `submit_unverified`/blocker dengan log lokal lengkap. Per 3 Jun 2026, jalur parser JSON juga diguard agar body kosong/JSON rusak tidak lagi memunculkan `Unexpected end of JSON input` pada submit/polling/autopilot. | `lib/browser/success-markers.ts`, `lib/browser/mcp-ai-apply-runner.ts`, `app/api/applications/[id]/submit/route.ts`, `app/api/campaigns/[id]/status/route.ts`, `lib/utils/safe-json.ts` |
| Skip Lamaran                       | Selesai | Tombol "Lewati Lamaran" di halaman review mengubah status ke `skipped` dan mengembalikan job ke `shortlisted`. | `app/applications/[id]/review/page.tsx`, `app/api/applications/[id]/skip/route.ts` |
| Campaign Loop / Autopilot v2       | Partial | Root cause bug 3 Jun 2026 sudah dipersempit lagi: job eligible bisa gagal masuk fase apply bila scoring ulang gagal lalu job `shortlisted` tanpa skor diperlakukan sebagai skor `0` dan masuk cabang low-score. Perbaikan task ini: [`scoreJobIfNeeded()`](lib/campaign/autopilot-runner.ts:229) kini langsung mempertahankan job `shortlisted`, dan cabang low-score di [`runCampaignAutopilot()`](lib/campaign/autopilot-runner.ts:713) mengecualikan job eligible tanpa skor agar urutan log `campaign.phase_apply_started` → `campaign.phase_apply_job_selected` → `campaign.phase_apply_job_started` → `application.started` → `campaign.apply_runner_dispatch` tetap bisa tercapai. Endpoint start lama [`POST /api/campaigns/[id]/start`](app/api/campaigns/[id]/start/route.ts:6) sekarang juga langsung mendelegasikan ke [`runCampaignAutopilot()`](lib/campaign/autopilot-runner.ts:350), sehingga kampanye baru tidak lagi berhenti di jalur search-only/save-only. Regression test baru ditambahkan di [`tests/autopilot-apply-dispatch.test.ts`](tests/autopilot-apply-dispatch.test.ts:101). Verifikasi browser nyata target 1/5/100 masih belum selesai; QA live untuk campaign `cmpy6ituy006c9k35xtreuri7` via MCP masih dapat terblokir baseline Applied Jobs, sedangkan QA [`agent-browser`](scripts/qa-agent-browser.mjs:1) sudah ditambahkan sebagai driver eksternal visible-browser untuk membuktikan flow apply tanpa mengganti arsitektur Playwright MCP internal. | `lib/campaign/autopilot-runner.ts`, `app/api/campaigns/[id]/start/route.ts`, `lib/campaign/job-status.ts`, `components/campaign-actions.tsx`, `tests/autopilot-phase-transition.test.ts`, `tests/autopilot-apply-dispatch.test.ts`, `tests/campaign-state.test.ts`, `scripts/qa-autopilot.mjs`, `scripts/qa-agent-browser.mjs`, `lib/api/json-response.ts`, `lib/utils/safe-json.ts` |
| Apply Calibration / Dry Run        | Selesai (Perlu Verifikasi Manual) | One-time dry run apply untuk mendeteksi flow type, platform, form fields, buttons, questions, dan submit candidates tanpa melakukan submit. Mendukung deteksi internal Jobstreet, external redirect, email apply, WhatsApp apply. Manual intervention (login/captcha/OTP) menghentikan flow dan membiarkan browser terbuka. | `lib/browser/jobstreet-apply-calibrator.ts`, `app/api/jobs/[id]/apply/calibrate/route.ts`, `app/api/jobs/[id]/calibration/route.ts`, `app/jobs/[id]/calibration/page.tsx` |
| Log Aktivitas                      | Selesai | Setiap `AutomationLog` sekarang juga ditulis ke local JSONL file di `storage/logs/` melalui `appendLocalLog()`. Selain log kampanye, QA autopilot juga menulis master log `qa-autopilot-*.log`, log MCP `mcp-run-*.log`, dan log dev server `dev-server-*.log`. QA [`agent-browser`](scripts/qa-agent-browser.mjs:1) menambah log `qa-agent-browser-*.log` dan `agent-browser-run-*.log` untuk bukti visible-browser eksternal. Sensitive field seperti password/token/cookie/apiKey/session dimask otomatis. Per 3 Jun 2026, parser QA untuk endpoint internal juga mengembalikan object terkontrol `empty_response_body`/`invalid_json_response` alih-alih crash, lengkap dengan `method`, `url`, `statusCode`, `statusText`, `contentType`, `actionName`, dan raw headers. | `lib/logging/automation-log.ts`, `lib/logging/local-file-log.ts`, `app/api/campaigns/[id]/local-log/route.ts`, `scripts/qa-autopilot.mjs`, `scripts/qa-agent-browser.mjs`, `components/campaign-actions.tsx` |
| Pause/Resume/Stop Campaign         | Partial | API route status update dan log nyata sudah ada, tetapi resume belum melanjutkan automation session sesungguhnya. Jalur search legacy di [`runJobstreetCampaign()`](lib/browser/jobstreet-agent.ts:521) kini sudah memiliki guard status `stopped` dan guard browser/context/page tertutup agar tidak terus melempar error `Target page, context or browser has been closed` setelah user menghentikan kampanye atau menutup browser. Kontrol kampanye di halaman detail kini terintegrasi dengan campaign loop. | `app/api/campaigns/[id]/pause/route.ts`, `app/api/campaigns/[id]/resume/route.ts`, `app/api/campaigns/[id]/stop/route.ts`, `lib/browser/jobstreet-agent.ts`, `components/campaign-actions.tsx` |
| Screenshot Saat Submit             | Selesai | Screenshot sebelum submit, setelah submit, dan saat error/intervensi disimpan ke `storage/screenshots` dan ditautkan ke `Application.screenshotPath`. | `lib/browser/jobstreet-apply-agent.ts`, `prisma/schema.prisma` |
| Runtime State Debug Endpoint       | Selesai | Endpoint debug baru mengembalikan state runtime kampanye, current job, application terbaru, log terbaru, page kind MCP terakhir, tombol visible MCP, pertanyaan MCP, submit candidate MCP, plan AI terakhir, dan action terakhir tanpa membocorkan secret. | `app/api/debug/campaigns/[id]/runtime-state/route.ts` |
| README Setup                       | Selesai | README kini mencakup setup Playwright MCP sidecar, script `mcp:playwright`, ENV MCP, batasan keamanan, dan catatan profile session lokal. | `README.md`, `package.json`, `.env.example`, `.gitignore` |

## 5. Struktur Folder Saat Ini

Struktur penting saat ini:

```txt
app/
  api/
    applications/
      [id]/
        submit/  (NEW)
        skip/  (NEW)
    browser/session/
    campaigns/
      [id]/
        loop/  (NEW)
    cv/
    jobs/
      [id]/
        apply/
          calibrate/  (NEW)
          start/
        calibration/  (NEW)
    questions/
  applications/
    [id]/
      review/
  campaigns/
  cv/
  dashboard/
  jobs/
    [id]/
      calibration/  (NEW)
  logs/
  profile/
  question-memory/
  settings/
components/
  campaign-actions.tsx  (NEW)
  modals/
lib/
  ai/
  api/
  browser/
    jobstreet-apply-agent.ts  (UPDATED: submitApplication, safe submit button)
    jobstreet-apply-calibrator.ts  (NEW)
    form-filler.ts
    page-detector.ts
  campaign/
    loop-runner.ts  (NEW)
  cv/
  dashboard/
  db/
  logging/
  security/
  storage/
prisma/
  migrations/
storage/
  cv/
  screenshots/
```

## 6. Database / Prisma Status

### Model yang Sudah Ada

* [x] CandidateProfile
* [x] UploadedCV (updated: `sourceType`, `manualTextUsed`)
* [x] Campaign (updated: `jobListings` relation)
* [x] JobListing (updated: `campaignId`, `snippet`, `campaign` relation)
* [x] Application
* [x] CampaignDecisionRule
* [x] QuestionMemory
* [x] AutomationLog
* [x] BrowserSession
* [x] UserSetting
* [x] ApplicationCalibration

### Migrasi

Status migrasi:

```bash
npx prisma migrate dev
```

Catatan:
Migration terbaru menambahkan dukungan Campaign Autopilot v2. Perubahan schema utama:
* `Campaign` mendapat field automation state seperti `automationMode`, `lowScoreMode`, `autoSubmitSafeOnly`, `currentStep`, `decisionStatus`, `decisionPayloadJson`, `currentJobId`, `currentJobTitle`, `currentJobCompany`
* `CampaignDecisionRule` model baru untuk mengingat keputusan user hanya dalam kampanye yang sama (`low_score`, `salary_mismatch`, `location_mismatch`, `external_redirect`, `unknown_question`)
* `ApplicationCalibration` tetap dipakai sebagai kalibrasi internal sebelum assisted apply

Migration sebelumnya:
* `add_job_listing_campaign_tracking`: `JobListing.campaignId`, `JobListing.snippet`, relasi campaign/jobListings

## 7. Environment Variables

Status `.env`:

| Variable                         | Status | Keterangan |
| -------------------------------- | ------ | ---------- |
| DATABASE_URL                     | Ada | Dipakai Prisma SQLite. |
| NINEROUTER_URL                   | Didukung | ENV resmi prioritas utama untuk root URL 9router. Bila berakhir dengan `/v1`, helper akan menormalkan ke root lalu menambahkan `/v1` hanya untuk OpenAI-compatible API. |
| NINEROUTER_KEY                   | Didukung | ENV resmi prioritas utama untuk API key 9router. Jangan expose value. |
| NINEROUTER_CHAT_MODEL            | Didukung | ENV resmi prioritas utama untuk model chat aktif. |
| NINEROUTER_EMBEDDING_MODEL       | Didukung | ENV resmi prioritas utama untuk model embedding aktif. |
| NINE_ROUTER_BASE_URL             | Didukung | Alias backward-compatible bila ENV resmi tidak ada. |
| NINE_ROUTER_API_KEY              | Didukung | Alias backward-compatible bila ENV resmi tidak ada. |
| NINE_ROUTER_CHAT_MODEL           | Didukung | Alias backward-compatible bila ENV resmi tidak ada. |
| NINE_ROUTER_EMBEDDING_MODEL      | Didukung | Alias backward-compatible bila ENV resmi tidak ada. |
| JOBSTREET_EMAIL                  | Ada | Credential tersedia, tetapi login otomatis belum diimplementasikan. |
| JOBSTREET_PASSWORD               | Ada | Credential tersedia, tetapi login otomatis belum diimplementasikan. |
| PLAYWRIGHT_HEADLESS              | Ada | Harus `false` untuk mematuhi safe automation policy. |
| PLAYWRIGHT_SESSION_PATH          | Ada | Dipakai untuk persistent session path. |
| JOBSTREET_DEFAULT_LOCATION       | Hardcoded di kode | Untuk MVP, pencarian utama dikunci ke `West Jakarta, Jakarta` dengan slug `West-Jakarta-Jakarta`, bukan dari `.env`. |
| DEFAULT_EXPECTED_SALARY          | Ada | Dipakai sebagai default campaign. |
| DEFAULT_CURRENT_SALARY           | Ada | Dipakai sebagai default campaign. |
| DEFAULT_NOTICE_PERIOD            | Ada | Dipakai sebagai default campaign. |
| DEFAULT_AVAILABILITY             | Ada | Dipakai sebagai default campaign. |

Jangan tulis value rahasia asli di file ini.

## 8. Halaman UI yang Sudah Ada

| Route            | Status | Keterangan |
| ---------------- | ------ | ---------- |
| /dashboard       | Selesai | Tidak lagi memakai mock; statistik, kampanye terbaru, dan log terbaru dibaca langsung dari Prisma. |
| /cv              | Selesai | Menampilkan riwayat CV nyata dari DB dan status analisis terbaru. |
| /cv/upload       | Selesai | Form upload dan input manual teks CV. Tombol analisis nyata mendukung teks manual dan ekstraksi file. Validasi panjang teks dan fallback otomatis. |
| /profile         | Selesai | Menampilkan `CandidateProfile` terbaru dalam layout Bahasa Indonesia yang bersih dan user-friendly. Skills sebagai badges, experience/education/projects sebagai cards dengan field yang di-humanize. Raw CV text tersembunyi dalam collapsible section. Tombol "Analisis Ulang CV" tersedia. |
| /campaigns       | Selesai | List kampanye membaca SQLite, bukan mock data. |
| /campaigns/new   | Selesai | Form submit nyata ke API create campaign, tidak lagi meminta lokasi dari user, dan menampilkan info bahwa pencarian dikunci ke West Jakarta, Jakarta. |
| /campaigns/[id]  | Selesai | Detail kampanye kini memakai panel Autopilot v2: tombol `Jalankan Kampanye Autopilot`/`Jeda`/`Lanjutkan`/`Hentikan`/`Buka Log`/`Lihat Lowongan`, polling status 3 detik, status panel realtime-like, timeline event Bahasa Indonesia, kartu keputusan low score, kartu question/review required, dan progres target apply. |
| /jobs            | Selesai | Membaca `JobListing` nyata dari Prisma. Semua lowongan tetap bisa diinteraksikan walau skor rendah. Tombol yang tersedia: `Lamar`, `Kalibrasi`, `Paksa Lamar`, `Lewati`, plus warning bahwa AI menyarankan dilewati tetapi user tetap boleh melamar. Alasan AI ditampilkan dalam Bahasa Indonesia. |
| /jobs/[id]/calibration | Selesai | Halaman hasil kalibrasi dry run. Menampilkan tipe flow, platform, URL saat ini, field terdeteksi (input/textarea/select), pertanyaan terdeteksi, tombol terdeteksi, kandidat tombol submit, risiko submit, dan rekomendasi. Label Bahasa Indonesia. |
| /applications    | Selesai | Membaca `Application` nyata dari Prisma. Menampilkan campaign, job listing, status, notes, match score, tombol "Review" dan "Buka Jobstreet". Empty state Bahasa Indonesia. |
| /applications/[id]/review | Selesai | Halaman review lamaran menampilkan info lowongan, skor AI, kampanye, field yang diisi, pertanyaan dijawab (dengan confidence dan sumber), pertanyaan pending, catatan, screenshot, dan aksi aktif (Lewati Lamaran/Setujui dan Kirim/Buka Jobstreet). Tombol "Setujui dan Kirim" aktif untuk status `pending_review` tanpa pending questions. Tombol "Lewati Lamaran" aktif untuk status `pending_review` dan `paused`. Konfirmasi dialog sebelum submit/skip. Menampilkan hasil submit (success/error/paused). |
| /question-memory | Selesai | Membaca `QuestionMemory` nyata dari Prisma. Menampilkan question, answer, confidence, usage count, source, updated date. Empty state Bahasa Indonesia. |
| /logs            | Selesai | Membaca `AutomationLog` nyata dari DB, urut terbaru lebih dulu. |
| /settings        | Selesai | Menampilkan status session browser, kartu status 9router Bahasa Indonesia, tombol cek koneksi, tombol muat daftar model, daftar model chat/embedding, default ENV, dan `UserSetting` nyata. |

## 9. API Routes yang Sudah Ada

| API Route                              | Status | Keterangan |
| -------------------------------------- | ------ | ---------- |
| app/api/cv/upload/route.ts             | Selesai | Upload + ekstraksi + simpan `UploadedCV`. |
| app/api/cv/analyze/route.ts            | Selesai | Analisis CV dan simpan `CandidateProfile`. Mendukung teks manual dan ekstraksi file. Menyimpan `sourceType`, `manualTextUsed`, dan `sourceUploadedCvId`. Validasi panjang teks dan fallback otomatis. |
| app/api/campaigns/route.ts             | Selesai | GET list dan POST create campaign. |
| app/api/campaigns/[id]/start/route.ts  | Selesai | Start kampanye membuka browser visible, melakukan pencarian Jobstreet, mengekstrak detail lowongan, menyimpan ke `JobListing`, melakukan AI scoring, dan mengembalikan hasil lengkap. Status kampanye diupdate berdasarkan hasil (completed/error/paused). |
| app/api/campaigns/[id]/pause/route.ts  | Selesai | Update status campaign ke `paused` dan menulis log nyata. |
| app/api/campaigns/[id]/resume/route.ts | Partial | Mengubah status ke `running` dan menulis log nyata, tetapi belum benar-benar melanjutkan automation. |
| app/api/campaigns/[id]/stop/route.ts   | Selesai | Update status campaign ke `stopped` dan menulis log nyata. |
| app/api/questions/answer/route.ts      | Selesai | AI answer + upsert question memory. |
| app/api/browser/session/route.ts       | Selesai | Mengembalikan metadata session browser, mode visible, configured path, dan pesan status jujur. |
| app/api/settings/9router/health/route.ts  | Selesai | Health check 9router ke `${rootUrl}/api/health` dengan respons Bahasa Indonesia tanpa membocorkan secret. |
| app/api/settings/9router/models/route.ts  | Selesai | Discovery model chat dan embedding via `${apiBaseUrl}/models` dan `${apiBaseUrl}/models/embedding`, memakai `data[].id`. |
| app/api/jobs/[id]/apply/start/route.ts | Selesai | Assisted apply kini bisa dipanggil untuk low score melalui override. Jika skor di bawah threshold tanpa override, API mengembalikan `decision_required` alih-alih menyembunyikan aksi. |
| app/api/jobs/[id]/route.ts | Selesai | PATCH status lowongan untuk aksi manual seperti `Lewati` dari halaman lowongan. |
| app/api/applications/[id]/route.ts     | Selesai | GET single application dengan relasi campaign dan jobListing untuk halaman review. |
| app/api/applications/[id]/submit/route.ts | Selesai (Perlu Verifikasi Manual) | POST submit lamaran dengan approval user eksplisit (`{ approved: true }`). Submit hanya dianggap sukses bila final click dan marker keberhasilan benar-benar terverifikasi. Jika belum bisa diverifikasi, status dipause dan UI memberi warning, bukan false success. |
| app/api/applications/[id]/skip/route.ts | Selesai | POST skip lamaran. Update status ke `skipped`, kembalikan JobListing ke `shortlisted`, tulis log. |
| app/api/campaigns/[id]/loop/route.ts   | Digantikan | Loop lama tetap ada untuk kompatibilitas, tetapi flow utama sekarang memakai Autopilot v2. |
| app/api/campaigns/[id]/status/route.ts | Selesai | GET status kampanye realtime-like untuk polling UI. Sekarang juga mengembalikan `appliedCount`, `verifiedSubmittedCount`, `latestApplication`, `blocker`, `lastSuccessMarker`, dan path local log agar runner QA dan UI bisa menghentikan flow hanya pada success terverifikasi atau blocker nyata. Client polling kini menampilkan diagnostik endpoint/aksi jika body kosong atau JSON invalid. |
| app/api/campaigns/[id]/autopilot/start/route.ts | Selesai | Menjalankan satu langkah bounded Autopilot v2 dari awal flow kampanye. Mendukung start/restart untuk status `ready`, `paused`, `stopped`, dan `error`; restart dari `stopped` membersihkan state runtime transien lalu lanjut ke lowongan eligible berikutnya. Kini memakai helper JSON bersama agar state `error`/controlled tidak pernah mengembalikan body kosong. |
| app/api/campaigns/[id]/autopilot/continue/route.ts | Selesai | Melanjutkan satu langkah bounded berikutnya saat aman untuk lanjut. Kini memakai helper JSON bersama agar state `error`, `completed`, dan controlled lain selalu non-empty. |
| app/api/campaigns/[id]/autopilot/decision/route.ts | Selesai | Menyimpan keputusan user untuk low score/decision state kampanye, termasuk opsi skip serupa untuk kampanye ini saja. Kini selalu mengembalikan payload JSON dengan `ok`/`error` yang konsisten. |
| app/api/jobs/[id]/apply/calibrate/route.ts | Selesai (Perlu Verifikasi Manual) | POST kalibrasi dry run. Tetap tersedia untuk debugging manual dan bukan lagi bagian jalur apply utama Jobstreet internal. |
| app/api/jobs/[id]/calibration/route.ts | Selesai | GET hasil kalibrasi terbaru untuk job listing. Mengembalikan data `ApplicationCalibration` terbaru dengan relasi job listing. |
| app/api/qa/campaigns/[id]/run/route.ts | Selesai | Endpoint QA untuk memaksa `mcp_ai_first`, `auto_submit_safe_only`, restart runtime transien kampanye, lalu menjalankan bounded autopilot step pertama. Dipakai oleh script one-command QA. Kini memakai helper JSON bersama untuk success, controlled state, dan error agar tidak ada response kosong. |
| app/api/qa/campaigns/[id]/status/route.ts | Selesai | Endpoint polling QA yang mengembalikan status kampanye, `verifiedSubmittedCount`, blocker, decision payload, marker sukses terakhir, latest application, latest logs, dan path local log tanpa membocorkan secret. |

## 10. Automation / Playwright Status

### MCP AI-first runner

* One-command QA runner baru tersedia lewat [`npm run qa:autopilot`](package.json:15).
* Runner otomatis memastikan direktori `storage/logs/` ada, membuat log `qa-autopilot-*.log`, lalu mencoba start MCP sidecar dan Next.js dev server bila port belum aktif.
* Jika Chromium Playwright belum tersedia, runner mencoba `npx playwright install chromium` sekali otomatis; bila gagal, output akhir memberi instruksi jelas dalam Bahasa Indonesia.
* Jika port MCP `8931` sudah aktif, runner tidak lagi langsung menganggap MCP sehat; runner tetap memanggil [`/api/debug/mcp`](app/api/debug/mcp/route.ts:1) untuk deep health.
* Jika health mengembalikan snapshot kosong/stale `about:blank`, runner sekarang mengklasifikasikannya sebagai stale MCP page, menulis event lokal `mcp.health_unusable` / `mcp.health_stale_blank_page`, membunuh proses pada port `8931`, restart MCP otomatis maksimal 2 kali, menunggu port listen lagi, lalu mengulang deep health.
* Campaign hanya boleh mulai setelah `snapshotUsable = true`, `expectedHealthMarkerFound = true`, dan `currentSnapshotUrl` mengarah ke health `data:` URL; bila sesudah restart tetap tidak usable, runner gagal dengan log `qa.failed_mcp_unusable_after_restart`.
* Runner polling status QA tiap 3 detik, berhenti saat ada submit terverifikasi, blocker nyata, atau timeout/no-progress tercapai.
* **Mode `mcp_ai_first` sekarang hard-blocked dari legacy Playwright browser launch.** Jika campaign memakai `mcp_ai_first`, semua operasi browser harus melalui MCP tool (`browser_navigate`, `browser_snapshot`, `browser_click`, dll). Tidak ada `chromium.launchPersistentContext` atau `getBrowserContext` yang boleh dipanggil.
* **Browser profile separation diterapkan.** MCP browser memakai `.mcp-browser-profile/`, legacy Playwright (bila masih dipakai untuk mode lain) memakai `.playwright-browser-profile/`. Direktori `storage/` tidak lagi dipakai sebagai `userDataDir` browser untuk menghindari konflik session.
* **Manual intervention sekarang evidence-based.** Detector MCP hanya mengembalikan `manual_intervention_required` jika `confidence >= 0.85`, `evidence` non-empty, dan tipe terdeteksi jelas (`login`, `captcha`, `otp`, `security_verification`). Jika planner AI meminta manual intervention tanpa evidence, dikategorikan sebagai `state_mismatch` dan di-pause dengan log `manual_intervention.rejected_no_evidence`.
* **Controlled paused states sekarang mengembalikan HTTP 200.** Endpoint [`/api/campaigns/[id]/autopilot/start`](app/api/campaigns/[id]/autopilot/start/route.ts:1) dan [`/api/qa/campaigns/[id]/run`](app/api/qa/campaigns/[id]/run/route.ts:1) tidak lagi melempar HTTP 500 untuk `manual_intervention_required`, `question_required`, `submit_unverified`, `mcp_unavailable`, atau `state_mismatch`. Semuanya mengembalikan HTTP 200 dengan field `status`, `blockerType`, `blockerEvidence`, `decisionRequired`, `latestLogs`, dan `localLogPath`.
* **QA response enrichment.** Response dari QA route sekarang menyertakan `currentStep`, `currentJob` (title/company/url), `latestApplication`, latest 30 automation logs, last MCP snapshot preview, last AI plan, local campaign log path, `blockerType`, dan `blockerEvidence` jika ada blocker.


Jelaskan status browser automation:

* Browser visible mode: Sudah diterapkan. Headless mode ditolak dan browser harus tetap terlihat.
* Session save/load: Path persistent session dipakai dan metadata session disimpan ke `BrowserSession`, tetapi load/validasi session masih dasar.
* Manual login/security: Hanya captcha, OTP, login, dan security verification yang boleh meminta tindakan user di browser.
* Login via ENV: Belum diimplementasikan.
* Jobstreet search: Sudah diimplementasikan dengan helper URL path-based `https://id.jobstreet.com/id/{keywordSlug}-jobs/in-Jakarta-Barat-Jakarta-Raya` dan dukungan paginasi `?page=2`, `?page=3`, dst.
* Search + apply one-by-one: Jalur utama sekarang adalah cari lowongan → proses job eligible satu per satu → lanjut ke halaman pencarian berikutnya saat halaman sekarang habis → berhenti hanya saat target tercapai atau terminal blocker aman tercapai. Endpoint start lama [`POST /api/campaigns/[id]/start`](app/api/campaigns/[id]/start/route.ts:6) kini juga masuk ke jalur autopilot ini, bukan lagi mengeksekusi search-only flow terpisah.
* Save to DB: Sudah diimplementasikan dengan deduplication berdasarkan URL (`@unique`).
* AI job scoring: Sudah diimplementasikan. Skor rendah tidak lagi memblokir tombol lamar; perilaku ditentukan oleh `lowScoreMode`.
* Form automation default: Default kampanye baru sekarang `formAutomationMode = ai_first`/`mcp_ai_first` dengan arah utama `auto_submit_safe_only`. Endpoint QA memaksa campaign target untuk memakai `mcp_ai_first` dan `auto_submit_safe_only` saat menjalankan autopilot otomatis.
* Jobstreet fixture guidance: Saved HTML Jobstreet kini dipakai sebagai layout knowledge untuk `choose_documents`, `employer_questions`, `update_profile`, `review_submit`, dan `success`. Fixture hanya dipakai sebagai guidance AI/regression source, bukan hardcoded blind logic. Runtime action tetap wajib memakai URL live, snapshot MCP live, dan `elementId` live yang terlihat.
* MCP preflight before search/apply: Untuk `formAutomationMode = mcp_ai_first`, helper [`checkPlaywrightMcpHealth()`](lib/mcp/mcp-health.ts:83) sekarang melakukan initialize/connect, `tools/list`, `browser_navigate` ke local `data:` page, tunggu 500ms, `browser_snapshot`, lalu bila snapshot masih stale/blank akan navigate ulang, tunggu 1000ms, dan snapshot ulang sebelum dinyatakan gagal.
* MCP stale blank classification: Snapshot dengan `Page URL: about:blank` dan tree kosong sekarang diklasifikasikan sebagai `mcp_stale_or_empty_page`, bukan browser dependency missing.
* MCP browser dependency guard: Browser dependency missing sekarang hanya dilaporkan jika raw error eksplisit memuat indikasi `browser executable doesn't exist`, `Chromium`, `Chrome`, `playwright install`, atau `Executable doesn't exist`. Pesan user-facing-nya: `Browser Playwright belum siap. Jalankan npx playwright install chromium.`
* MCP health marker gate: Snapshot dianggap usable hanya jika text memuat `MCP health check`, atau `button "OK"`, atau parsed button berisi `OK`; `about:blank` tidak pernah dianggap usable.
* MCP Streamable HTTP client: Root cause HTTP 400 sekarang ditangani di [`PlaywrightMcpClient`](lib/mcp/playwright-mcp-client.ts:363) dengan menyimpan `Mcp-Session-Id` dari initialize, mengirim `MCP-Protocol-Version` pada semua request berikutnya, retry sekali bila server mengembalikan `404` untuk sesi lama, serta mempertahankan default protocol `2025-06-18` sampai server menegosiasikan versi lain.
* MCP response parser + accessibility snapshot normalization: [`normalizeSnapshotPayload()`](lib/mcp/playwright-mcp-client.ts:233) sekarang selalu menyimpan raw text snapshot, memakai accessibility text sebagai sumber valid, mengekstrak URL/title dari text bila perlu, dan mem-parse role/name/ref seperti `button "Continue" [ref=e12]` menjadi `elementId = ref` yang bisa dieksekusi ulang.
* MCP action payload mapping: Executor MCP sekarang mengirim payload yang lebih sesuai schema Playwright MCP seperti `browser_click({ element, ref })`, `browser_fill({ element, ref, text })`, `browser_select({ element, ref, value })`, dan `browser_check({ element, ref, checked })`, dengan `elementId` internal diperlakukan sebagai MCP `ref`.
* MCP diagnostic route: Route [`GET /api/debug/mcp`](app/api/debug/mcp/route.ts:4) sekarang mengembalikan field lebih jelas: `connectOk`, `toolsListOk`, `navigateOk`, `snapshotOk`, `snapshotUsable`, `browserDependencyOk`, `staleBlankPage`, `currentSnapshotUrl`, `expectedHealthMarkerFound`, `retryCount`, `parsedButtons`, `snapshotTextPreview`, dan `message`.
* MCP technical logging: [`runMcpAiApplyRunner()`](lib/browser/mcp-ai-apply-runner.ts:183) sekarang menulis `mcp_ai.snapshot_invalid` saat snapshot kosong/tidak valid, menyertakan `accessibilityTextPreview`, `rawTextPreview`, `elementCount`, `buttonCount`, dan `questionCount`, lalu berhenti sebelum planner agar AI tidak diminta mendiagnosis environment.
* Safe URL normalization: Helper baru [`normalizeSafeUrl()`](lib/jobstreet/safe-url.ts:69) memvalidasi URL sebelum dipakai oleh [`new URL(...)`](lib/jobstreet/jobstreet-url.ts:25), MCP [`browser_navigate`](lib/browser/mcp-ai-apply-runner.ts:440), dan Playwright [`page.goto(...)`](lib/browser/jobstreet-apply-agent.ts:1387). Event log baru: `url.normalize_started`, `url.normalize_failed`, `jobstreet.external_redirect_detected`, `jobstreet.external_redirect_invalid_url`, `jobstreet.apply_url_fallback_built`, `mcp_ai.planner_skipped_invalid_state`.
* External redirect guard: Jika langkah terdeteksi `external_redirect` atau page kind `unknown` dengan fixture confidence `0`, runner MCP tidak lagi memanggil planner secara buta. URL live divalidasi dulu; bila invalid/kosong, job dilewati aman. Bila valid tetapi eksternal, sistem tidak menganggap itu flow internal Jobstreet dan menahan status pada keputusan terkontrol, bukan crash `Invalid URL`.
* Search batch size: Helper [`getSafeMaxJobs()`](lib/browser/jobstreet-agent.ts:78) sekarang tetap dibatasi hard cap 20 per halaman dan dipakai bersama safety limit paginasi `maxSearchPages = 50`, `maxConsecutiveEmptyPages = 3`, dan `maxNoProgressSeconds = 60`.
* URL-step detector Jobstreet: Detector URL sekarang menjadi sumber kebenaran utama untuk `/apply`, `/apply/role-requirements`, `/apply/profile`, `/apply/review`, dan `/apply/success`. Helper URL baru juga mengekstrak `jobstreetJobId` dari semua variasi URL internal Jobstreet dan membangun fallback apply URL internal bila klik `Lamar cepat` tidak bernavigasi seperti yang diharapkan.
* Manual intervention detector: [`detectManualIntervention()`](lib/browser/page-detector.ts:251) kini memakai visible text dan visible interactive elements sebagai prioritas utama. Password input, OTP input, captcha, halaman `/oauth/login`, dan security verification visible menjadi sinyal kuat; teks lemah seperti `Profile Avatar`, `Open app`, `SIGN_IN_PAGE`, atau `/oauth/login` di script/header tidak boleh memicu pause.
* AI-first apply runner: [`runAiFirstApplyRunner()`](lib/browser/ai-first-apply-runner.ts:1) kini menulis log URL-step seperti `jobstreet_apply.step_detected_from_url`, `manual_intervention.candidate_detected`, `manual_intervention.false_positive_rejected`, dan `manual_intervention.confirmed` untuk membedakan kandidat false-positive vs intervensi manual nyata.
* MCP AI-first runner: [`runMcpAiApplyRunner()`](lib/browser/mcp-ai-apply-runner.ts:181) sekarang menulis log diagnostik spesifik `mcp_ai.connect_started`, `mcp_ai.connect_ok`, `mcp_ai.connect_failed`, `mcp_ai.navigate_started`, `mcp_ai.navigate_ok`, `mcp_ai.snapshot_started`, `mcp_ai.snapshot_ok`, `mcp_ai.snapshot_failed`, `mcp_ai.tool_call_failed`, dan `mcp_ai.runner_failed`. Metadata log menyertakan `mcpUrl`, `stage`, `toolName`, `campaignId`, `jobListingId`, `applicationId`, judul lowongan, company, job URL, dan metadata teknis saat ada error MCP.
* AI planner: AI dipakai spesifik untuk menemukan tombol Continue/Submit dan mengisi field kosong yang relevan, bukan untuk menebak seluruh flow saat URL sudah jelas. Pada langkah `update_profile`, sistem scroll ke bawah lebih dulu lalu AI/MCP dipaksa mencari tombol `Continue`/`Lanjut`, dan jika URL tidak berpindah ke `/apply/review` dalam 8 detik hasilnya `stuck_no_progress` dengan keputusan in-app "Step Update Jobstreet Profile belum berpindah ke Review. Sistem mencoba klik Continue.", bukan pesan login/verifikasi.
* Question detection: Pertanyaan normal kini diarahkan ke keputusan in-app, bukan instruksi umum untuk memeriksa browser.
* Yes/No handling: Bila jawaban diketahui dari CV/default/memory, AI dapat menjawab. Bila tidak yakin, status harus pause ke keputusan user di halaman kampanye.
* Captcha/manual intervention pause: Tetap ada dan hanya untuk kasus keamanan/manual yang sah.
* Calibration in Autopilot: Dihapus dari jalur utama Autopilot. Kalibrasi tetap dipertahankan sebagai tool manual/debug di [`/jobs/[id]/calibration`](app/jobs/[id]/calibration/page.tsx).
* Final submit: Untuk `auto_submit_safe_only`, submit final diarahkan untuk diklik otomatis di page Playwright yang sama bila safety gate lolos, tetapi pencarian tombol submit sekarang dibatasi maksimal 8 detik dan tidak boleh loop tanpa akhir.
* Submit verification: Status `submitted` hanya boleh di-set setelah marker sukses terverifikasi. Bila belum terverifikasi, kampanye pause ke status `submit_unverified`; bila tombol submit tidak ditemukan dalam 8 detik, hasilnya `submit_not_found_timeout` dengan keputusan in-app yang eksplisit.
* Campaign Loop / Autopilot v2: Jalur apply kini menerapkan bounded decisions per langkah. Target status per langkah sekarang juga mencakup `stuck_no_progress` dan `submit_not_found_timeout`, sementara log baru menandai `application.step_timer_started`, `application.step_timeout`, `application.no_progress_detected`, `application.no_progress_limit_reached`, `application.ai_fallback_once_started`, `application.ai_fallback_once_failed`, `application.submit_resolver_timeout`, `application.job_stuck_skipped`, dan `campaign.autopilot_continue_after_stuck`.
* Screenshot on submit: Sudah diimplementasikan untuk alur submit aman dan kasus error/intervensi.
* Apply calibration dry run: Tetap tersedia sebagai tool developer/debugging, bukan blocker jalur Autopilot.
* Resume after intervention: Belum ada flow resume browser session yang benar-benar melanjutkan konteks halaman yang sama.

## 11. AI Integration Status

Jelaskan status integrasi 9router:

* Chat completions: Sudah ada melalui OpenAI-compatible client dengan base URL resmi `/v1` dari helper bersama.
* CV analysis: Sudah ada dan terhubung ke API route.
* Job scoring: Sudah terintegrasi ke flow campaign utama.
* AI-first UI planner: Sedang menjadi jalur utama automation form. Planner sekarang dipaksa JSON-only, visible-elements-only, tidak boleh mengarang selector, tidak boleh klik captcha/login/OTP/security, dan tidak boleh mengisi password.
* Planner actions: Jalur AI sekarang mendukung `click`, `fill`, `select`, `check`, `choose_radio`, `ask_user`, `skip_job`, dan `final_submit` pada level rencana.
* Question answering: Sudah ada, menyimpan memory, dan dipakai untuk membantu saran jawaban pada pertanyaan tambahan.
* Structured JSON output: Sudah ada parsing JSON + schema validation untuk planner dan modul AI lain.
* Bahasa Indonesia: Reasoning user-facing, pertanyaan untuk user, dan opsi keputusan diarahkan ke Bahasa Indonesia.
* Config helper 9router: Sudah ada di [`lib/ai/9router-config.ts`](lib/ai/9router-config.ts:1).
* Health check: Sudah ada di [`app/api/settings/9router/health/route.ts`](app/api/settings/9router/health/route.ts:1).
* Model discovery: Sudah ada di [`app/api/settings/9router/models/route.ts`](app/api/settings/9router/models/route.ts:1).
* Retry handling: Belum matang; AI-first runner baru membatasi retry lokal pada per-lowongan.

## 12. Human-in-the-loop Status

Jelaskan fitur yang melibatkan keputusan user:

* Modal pertanyaan tambahan: Arah utama sekarang adalah semua pertanyaan normal ditangani di halaman kampanye dengan pilihan sederhana seperti Accept, Reject, Yes, No, Edit Answer, dan Skip Job.
* Modal captcha/verifikasi: Tetap dipakai untuk captcha, OTP, login, dan security verification. Ini satu-satunya jalur yang masih sah untuk meminta user menyelesaikan sesuatu langsung di browser.
* Review page: Tetap ada sebagai fallback/manual path, tetapi bukan jalur utama submit Autopilot.
* Approve and submit: Route manual [`POST /api/applications/[id]/submit`](app/api/applications/[id]/submit/route.ts:1) tetap dipertahankan sebagai fallback.
* Edit answer: Tombol dan copy mulai diarahkan ke flow kampanye, tetapi penyimpanan edit jawaban end-to-end masih belum selesai.
* Skip job: Sudah menjadi salah satu keputusan user utama di UI kampanye.
* Pause campaign: API ada dan terintegrasi dengan panel Autopilot.
* Resume campaign: Jalur utama sekarang lewat [`autopilot/continue`](app/api/campaigns/[id]/autopilot/continue/route.ts:1) yang bounded per request.
* Decision memory per campaign: Sudah ada lewat `CampaignDecisionRule` untuk kasus seperti low score/skip similar. Penyimpanan keputusan pertanyaan tambahan masih perlu diperdalam untuk MVP penuh.

## 13. Log Aktivitas

Status log:

* Log disimpan ke database: Ya.
* Log file lokal: Ya. Setiap event penting sekarang juga ditulis ke JSONL file lokal di `storage/logs/campaign-{campaignId}.log`, `storage/logs/mcp-{YYYY-MM-DD}.log`, dan `storage/logs/app-{YYYY-MM-DD}.log`.
* Log tampil di UI: Ya, dashboard dan halaman `/logs` membaca data DB nyata.
* Log per campaign: Didukung oleh relasi dan field `campaignId`.
* Log per job: Didukung oleh relasi dan field `jobListingId`.
* Log campaign loop baru: Event fase kampanye sekarang juga mencakup `campaign.phase_search_started`, `campaign.search_limit_info`, `campaign.phase_search_completed`, `campaign.phase_apply_started`, `campaign.phase_apply_job_started`, `campaign.phase_apply_job_finished`, dan `campaign.phase_next_job`.
* Log MCP baru: Event MCP sekarang mencakup `mcp.preflight_started`, `mcp.preflight_ok`, `mcp.preflight_failed`, `mcp.health_started`, `mcp.health_unusable`, `mcp.health_stale_blank_page`, `mcp.restart_requested`, `mcp.kill_port_started`, `mcp.kill_port_done`, `mcp.restart_started`, `mcp.restart_ready`, `mcp.restart_done`, `mcp.restart_failed`, `mcp.health_after_restart`, `mcp.health_passed_after_restart`, `qa.failed_mcp_unusable_after_restart`, `mcp_ai.connect_started`, `mcp_ai.connect_ok`, `mcp_ai.connect_failed`, `mcp_ai.navigate_started`, `mcp_ai.navigate_ok`, `mcp_ai.snapshot_started`, `mcp_ai.snapshot_ok`, `mcp_ai.snapshot_failed`, `mcp_ai.tool_call_failed`, dan `mcp_ai.runner_failed`.
* API local log campaign: Tersedia route [`GET /api/campaigns/[id]/local-log`](app/api/campaigns/[id]/local-log/route.ts:1) dengan query `?tail=300` untuk membaca tail local file log kampanye.
* Masking secret: Sensitive key seperti `password`, `token`, `cookie`, `apiKey`, `authorization`, `session`, `accessToken`, dan `refreshToken` dimask sebelum ditulis ke local log.
* Log calibration: Tetap ada untuk tool debug/manual, tetapi bukan pusat alur Autopilot.
* Screenshot path tersimpan: Screenshot submit/error/intervensi tetap ditautkan ke `Application.screenshotPath`.

Contoh event log yang digunakan:

```txt
campaign.start
campaign.completed
campaign.pause
campaign.resume
campaign.stop
campaign.paused
campaign.error
browser.launch
jobstreet.ready
jobstreet.search_started
jobstreet.search_page_loaded
jobstreet.search_manual_intervention
jobstreet.job_card_found
jobstreet.job_detail_opened
jobstreet.job_saved
jobstreet.job_skipped_duplicate
jobstreet.job_scoring_started
jobstreet.job_scored
jobstreet.job_shortlisted
jobstreet.job_skipped_score
jobstreet.job_scoring_failed
jobstreet.search_completed
jobstreet.search_failed
manual_intervention
application.started
application.job_opened
application.searching_apply_button
application.apply_button_clicked
application.apply_button_not_found
application.form_detected
application.field_filled
application.question_detected
application.question_answered
application.question_needs_user_input
application.manual_intervention_required
application.review_required
application.failed
application.submit_requested
application.before_submit_review
application.submitted
application.submit_failed
application.submit_manual_intervention
application.skipped
application.calibration_started
application.calibration_job_opened
application.calibration_apply_button_found
application.calibration_apply_button_clicked
application.calibration_apply_button_not_found
application.calibration_flow_classified
application.calibration_form_snapshot_saved
application.calibration_external_redirect
application.calibration_manual_intervention
application.calibration_failed
campaign.loop_started
campaign.loop_next_job
campaign.loop_paused
campaign.loop_completed
campaign.target_reached
campaign.applied_count_incremented
```

## 14. Testing Manual

Tuliskan hasil testing manual terakhir:

Tanggal: 2026-06-03 (abort-on-error + target-1 autopilot + missing JobListing columns migration)
Command yang dijalankan:

```bash
npx prisma migrate dev --name add-missing-job-listing-columns
node --test ./tests/autopilot-apply-dispatch.test.ts
```

Hasil command lokal pada task ini:

* [x] [`npx prisma migrate dev --name add-missing-job-listing-columns`](prisma/migrations/20260603171500_add_missing_job_listing_columns/migration.sql:1) berhasil. DB lokal kini memiliki kolom `JobListing.jobstreetJobId`, `applyUrl`, `quickApplyAvailable`, dan `searchPage`, sehingga error Prisma `P2022` pada [`app/api/campaigns/[id]/status/route.ts`](app/api/campaigns/[id]/status/route.ts:84) tidak lagi relevan setelah migrasi dijalankan.
* [x] [`node --test ./tests/autopilot-apply-dispatch.test.ts`](tests/autopilot-apply-dispatch.test.ts:1) lulus setelah perubahan abort-on-error dan terminal target-1 di [`runCampaignAutopilot()`](lib/campaign/autopilot-runner.ts:1005).
* [ ] [`npm run lint`](package.json:10) belum dijalankan ulang pada batch verifikasi task ini.
* [ ] [`npx tsc --noEmit`](package.json:45) belum dijalankan ulang pada batch verifikasi task ini.
* [x] [`npx prisma generate`](prisma/schema.prisma:1) ikut berjalan sukses sebagai bagian dari [`npx prisma migrate dev`](prisma/migrations/20260603171500_add_missing_job_listing_columns/migration.sql:1).
* [ ] [`node --test ./tests/campaign-state.test.ts ./tests/campaign-pagination-state.test.ts`](tests/campaign-state.test.ts:1) belum dijalankan ulang pada batch verifikasi task ini.
* [ ] [`node --experimental-strip-types --test ./tests/api-json-response.test.ts ./tests/safe-json.test.ts ./tests/safe-url.test.ts ./tests/jobstreet-url.test.ts ./tests/autopilot-phase-transition.test.ts`](tests/autopilot-phase-transition.test.ts:1) belum dijalankan ulang persis dengan command full regression batch task ini.
* [ ] [`npm run qa:agent-browser -- --campaign=cmpy6ituy006c9k35xtreuri7 --target=1`](package.json:17) belum dijalankan ulang pada batch verifikasi task ini.
* [ ] [`npm run qa:autopilot -- --campaign=cmpy6ituy006c9k35xtreuri7 --target=1 --skip-applied-baseline`](package.json:15) belum dijalankan ulang pada batch verifikasi task ini.

Cakupan verifikasi unit/regresi pada task ini:

* [x] Search URL Jobstreet `.net` mempertahankan karakter spesial.
* [x] Search URL `fullstack developer`, `backend developer`, dan `react` memakai slug baru `in-Jakarta-Barat-Jakarta-Raya`.
* [x] Paginasi page 1 tanpa query, page 2 memakai `?page=2`.
* [x] [`normalizeSafeUrl()`](lib/jobstreet/safe-url.ts:69) menolak empty string, `null`, `javascript:`, `mailto:`, `tel:`, dan URL malformed.
* [x] [`normalizeSafeUrl()`](lib/jobstreet/safe-url.ts:69) me-resolve relative path seperti `/id/job/92277246` dan `/id/job/92277246/apply` ke host internal Jobstreet.
* [x] [`extractJobstreetJobId()`](lib/jobstreet/jobstreet-url.ts:14) mendukung detail URL, apply URL, role requirements URL, profile URL, review URL, success URL, dan relative path internal.
* [x] [`buildJobstreetApplyUrl()`](lib/jobstreet/jobstreet-url.ts:31) menghasilkan fallback URL internal Jobstreet yang deterministik.
* [x] Apply step detector mengenali `/apply`, `/apply/role-requirements`, `/apply/profile`, `/apply/review`, dan `/apply/success`.
* [x] Campaign pagination state: page exhausted → page 2, empty pages → stop setelah batas, target reached → terminal state.
* [x] Success verification: `/apply/success` dan marker text sukses sah; false success tidak boleh increment count.
* [x] Guard planner MCP: state `external_redirect`, URL invalid, atau `pageKind = unknown` + fixture confidence `0` sekarang harus skip planner secara bounded.

Catatan:
* Browser tetap visible.
* Tidak ada bypass captcha, stealth automation, atau proxy rotation.
* Verifikasi QA live target 1/5/100 masih menjadi pekerjaan berikutnya sebelum mengklaim all-in-one runner benar-benar lulus end-to-end.

## 15. Error / Bug Saat Ini

| Tanggal | Error | Penyebab Dugaan | Status | File Terkait |
| ------- | ----- | --------------- | ------ | ------------ |
| 2026-06-03 | UI kampanye hanya menampilkan `empty_response_body` tanpa endpoint/aksi pemicu | Guard client sebelumnya belum menyertakan metadata request, sehingga source response kosong tidak bisa diidentifikasi dari UI | Fixed | `components/campaign-actions.tsx`, `scripts/qa-autopilot.mjs`, `tests/api-json-response.test.ts` |
| 2026-06-03 | Autopilot sudah menemukan lowongan eligible (`IT Developer`) tetapi tidak pernah masuk ke log `campaign.phase_apply_job_started`, `application.started`, `mcp_ai.runner_started`, atau `mcp_ai.navigate_started` | Root cause yang tervalidasi pada task ini: job yang sudah `shortlisted` tetapi gagal scoring ulang dikembalikan dengan `matchScore = null`, lalu di [`runCampaignAutopilot()`](lib/campaign/autopilot-runner.ts:713) diperlakukan sebagai skor `0` sehingga masuk cabang low-score dan tidak pernah mencapai blok dispatch apply walaupun urutan log apply sebenarnya sudah ada di [`autopilot-runner.ts`](lib/campaign/autopilot-runner.ts:800). Perbaikan: [`scoreJobIfNeeded()`](lib/campaign/autopilot-runner.ts:235) kini langsung mempertahankan job `shortlisted`, logika low-score mengecualikan job eligible tanpa skor, dan flow target-1 sekarang berhenti total setelah submit verified pertama. | Fixed (regression test lulus, verifikasi live end-to-end masih pending) | `lib/campaign/autopilot-runner.ts`, `tests/autopilot-apply-dispatch.test.ts` |
| 2026-06-03 | Beberapa route autopilot/QA berisiko mengembalikan payload tidak konsisten saat error/controlled state | Route masih langsung memakai `NextResponse.json(...)` per-file tanpa wrapper bersama, sehingga sulit menjaga kontrak `ok/error/controlled` yang seragam | Fixed | `lib/api/json-response.ts`, `app/api/campaigns/[id]/autopilot/start/route.ts`, `app/api/campaigns/[id]/autopilot/continue/route.ts`, `app/api/campaigns/[id]/autopilot/decision/route.ts`, `app/api/qa/campaigns/[id]/run/route.ts`, `app/api/campaigns/[id]/local-log/route.ts` |
| 2026-06-03 | Endpoint status dan proses save/search job crash dengan Prisma `P2022` karena kolom `main.JobListing.jobstreetJobId` belum ada di SQLite | Schema [`JobListing`](prisma/schema.prisma:121) sudah memakai field baru, tetapi DB lokal belum mendapat migrasi kolom `jobstreetJobId`, `applyUrl`, `quickApplyAvailable`, dan `searchPage` | Fixed (perlu menjalankan migrasi pada environment lain) | `prisma/schema.prisma`, `prisma/migrations/20260603171500_add_missing_job_listing_columns/migration.sql`, `app/api/campaigns/[id]/status/route.ts`, `lib/browser/jobstreet-agent.ts` |
| 2026-06-03 | Saat satu lowongan error, autopilot masih lanjut mencari/memproses lowongan lain padahal goal sekarang hanya 1 lamaran | Cabang hasil [`apply_unavailable` / `stuck_no_progress` / `submit_not_found_timeout`](lib/campaign/autopilot-runner.ts:1157) sebelumnya mengembalikan `skipped_continue` dan memaksa lanjut ke next job | Fixed | `lib/campaign/autopilot-runner.ts` |
| 2026-06-03 | Campaign Autopilot crash dengan `Invalid URL` saat MCP mendeteksi `external_redirect` / page kind `unknown`, atau saat keyword pencarian berisi spasi seperti `IT Developer` | URL kosong/relative/malformed masih bisa lolos ke `new URL(...)`, dan builder search URL sempat menyisipkan keyword mentah multi-kata ke path sehingga phase search bisa membentuk URL tidak valid | Fixed (targeted test [`tests/jobstreet-search-url.test.ts`](tests/jobstreet-search-url.test.ts:1) lulus; QA live masih pending) | `lib/jobstreet/safe-url.ts`, `lib/jobstreet/jobstreet-url.ts`, `lib/jobstreet/jobstreet-search-url.ts`, `lib/browser/mcp-ai-apply-runner.ts`, `lib/browser/jobstreet-apply-agent.ts`, `lib/campaign/autopilot-runner.ts`, `app/api/campaigns/[id]/status/route.ts`, `tests/safe-url.test.ts`, `tests/jobstreet-url.test.ts`, `tests/jobstreet-search-url.test.ts` |
| 2026-06-03 | Blocker login/session MCP untuk direct apply `92457600` sebelumnya gelap dan QA resume belum punya jalur eksplisit | Endpoint sesi browser hanya metadata-only, belum ada validasi live ke Jobstreet via MCP; QA CLI juga belum punya `resume-after-manual` dan belum mengecek sesi live sebelum rerun | Partial: live session-check dan resume intent sudah ditambahkan, tetapi verifikasi live terbaru masih menunjukkan sesi MCP belum login valid dan resume dihentikan aman sebelum apply | `app/api/browser/session/route.ts`, `lib/jobstreet/session-check.ts`, `app/api/qa/campaigns/[id]/run/route.ts`, `scripts/qa-autopilot.mjs`, `tests/jobstreet-session-check.test.ts` |
| 2026-06-02 | QA stuck karena campaign terus memanggil continue berkali-kali saat currentStep sudah no_jobs_remaining | `no_jobs_remaining` disimpan sebagai `paused` dan status endpoint mengembalikan `canContinue: true` | Fixed | `lib/campaign/autopilot-runner.ts`, `app/api/campaigns/[id]/status/route.ts`, `scripts/qa-autopilot.mjs` |
| 2026-06-02 | Resume campaign belum melanjutkan browser automation yang sebelumnya terhenti | Route resume masih hanya mengubah status dan menulis log | Open | `app/api/campaigns/[id]/resume/route.ts` |
| 2026-06-02 | URL pencarian Jobstreet lama masih memakai query param `keywords/where` | Format lama tidak cocok dengan requirement MVP Jobstreet all-in-one | Fixed | `lib/jobstreet/jobstreet-search-url.ts`, `lib/browser/jobstreet-agent.ts`, `tests/jobstreet-search-url.test.ts` |
| 2026-06-02 | Keyword spesial seperti `.net` berisiko rusak saat slugify search URL | Builder sebelumnya cenderung menormalisasi keyword terlalu agresif | Fixed | `lib/jobstreet/jobstreet-search-url.ts`, `tests/jobstreet-search-url.test.ts` |
| 2026-06-02 | Runner lama belum punya helper stabil untuk mengekstrak `jobstreetJobId` dari semua URL apply internal | URL detail, apply, review, dan success memiliki variasi path/query yang perlu diperlakukan konsisten | Fixed | `lib/jobstreet/jobstreet-url.ts`, `tests/jobstreet-url.test.ts` |
| 2026-06-02 | `npx tsc --noEmit` gagal karena runner lama masih membandingkan step name lawas (`choose_documents`, `review_submit`, dll.) dengan detector URL-step baru | Refactor detector mengubah nama langkah menjadi `apply`, `role-requirements`, `profile`, `review`, `success` | Fixed | `lib/browser/ai-first-apply-runner.ts`, `lib/browser/mcp-ai-apply-runner.ts` |
| 2026-06-02 | `npm run lint` ikut memindai asset vendored di [`.venv/`](.venv) sehingga gagal bukan karena kode app | Scope ignore ESLint belum mengecualikan virtualenv lokal | Fixed | `eslint.config.mjs` |
| 2026-06-02 | Paginasi hasil search belum diverifikasi live pada browser nyata sampai page 2/page 3 | Unit test pagination state sudah ada, tetapi QA/browser nyata belum dijalankan | Open | `lib/campaign/campaign-pagination-state.ts`, `lib/campaign/autopilot-runner.ts`, `tests/campaign-pagination-state.test.ts` |
| 2026-06-02 | Mapping keputusan in-app ke jawaban final backend belum sepenuhnya matang | UI sudah diarahkan ke Accept/Reject/Yes/No, tetapi penyimpanan jawaban/edit answer/remember masih perlu pendalaman | Open | `components/campaign-actions.tsx`, `app/api/campaigns/[id]/autopilot/decision/route.ts` |
| 2026-06-02 | Selector/label Jobstreet bisa berubah sehingga deteksi `Lamar cepat` atau tombol continue/submit dapat rusak | Jobstreet UI dan copy visible dapat berubah sewaktu-waktu | Open/Risk | `lib/browser/jobstreet-agent.ts`, `lib/browser/jobstreet-apply-step-runner.ts`, `lib/browser/mcp-ai-apply-runner.ts` |
| 2026-06-02 | Browser tetap terbuka saat manual intervention | Ini sesuai kebijakan keamanan, tetapi resume session sesudah intervensi belum penuh | Open/Limitation | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | QA end-to-end target 1/5/100 belum dijalankan ulang terhadap Jobstreet nyata setelah refactor URL-state/pagination | Repositori sudah lulus targeted regression tertentu, tetapi browser nyata belum membuktikan submit sukses terverifikasi | Open | `scripts/qa-autopilot.mjs`, `scripts/qa-agent-browser.mjs`, `app/api/qa/campaigns/[id]/run/route.ts`, `lib/campaign/autopilot-runner.ts` |

## 16. Risiko / Batasan

Tuliskan batasan saat ini:

* Tidak melakukan captcha bypass.
* Tidak melakukan stealth automation.
* Tidak melakukan proxy rotation.
* Browser harus tetap visible.
* Jobstreet UI/copy visible dapat berubah sewaktu-waktu sehingga deteksi tombol/field bisa rusak.
* Submit hanya boleh diklaim sukses bila URL `/apply/success` atau marker sukses live benar-benar terlihat.
* Paginasi sudah diimplementasikan, tetapi verifikasi live multi-page dan target besar masih belum selesai.
* Submit final harus melalui approval user atau jalur submit aman, tetapi pencarian tombol submit kini dibatasi 8 detik dan wajib berakhir dengan keputusan bounded, bukan loop tunggu tanpa akhir.
* App hanya untuk penggunaan pribadi/lokal.
* Selector extraction menggunakan multiple strategies untuk ketahanan, tetapi perubahan besar pada UI Jobstreet mungkin memerlukan update manual.
* Form filling menggunakan defensive selector strategy, tetapi form yang sangat berbeda dari ekspektasi mungkin tidak terisi penuh.
* Question detection bergantung pada label/legend/heading yang terlihat, mungkin tidak menangkap semua pertanyaan.
* AI question answering memerlukan konfigurasi 9router yang valid.
* Form multi-step/accordion belum ditangani.

## 17. Yang Belum Dikerjakan

Checklist fitur yang belum selesai:

* [ ] Implementasi login Jobstreet otomatis atau semi-otomatis yang benar-benar memakai credential/session secara aman.
* [x] Live session-check MCP untuk Jobstreet + resume intent QA direct apply. (Implemented via [`GET()`](app/api/browser/session/route.ts:10), [`analyzeJobstreetSessionSnapshot()`](lib/jobstreet/session-check.ts:29), dan flag [`--resume-after-manual`](scripts/qa-autopilot.mjs:58))
* [x] Final submit lamaran setelah approval user. (Implemented with full-page resolver + re-read flow, still needs manual verification against live Jobstreet)
* [x] Tautkan screenshot error/intervensi ke record aplikasi yang relevan. (Screenshots now saved and linked)
* [x] Apply calibration dry run. (Implemented, needs manual verification against live Jobstreet)
* [ ] Verifikasi end-to-end submit, campaign loop, dan calibration terhadap Jobstreet nyata.
* [ ] Mode pengisian eksternal untuk flow external redirect.
* [ ] Resume automation setelah intervensi manual (bukan hanya status-level, tetapi melanjutkan browser session yang sama).
* [x] Resume QA direct apply tanpa kehilangan payload lowongan target. (Rerun sekarang menulis event [`campaign.resume_after_manual_intervention_started`](app/api/qa/campaigns/[id]/run/route.ts:186) dan mempertahankan direct seed untuk `92457600`)
* [ ] Pagination hasil pencarian Jobstreet untuk kampanye besar.
* [ ] UI real-time untuk menampilkan status manual intervention dan tombol "Lanjutkan Kampanye" setelah user menyelesaikan intervensi.
* [ ] Edit jawaban dari halaman review.
* [x] Skip lamaran dari halaman review. (Implemented)
* [ ] Verifikasi manual stateful wizard + watchdog terhadap slide apply Jobstreet nyata, termasuk kasus stuck di slide pertama dan kasus final submit yang sulit diverifikasi.
* [ ] Form multi-step/accordion handling lanjutan untuk variasi layout yang belum tercakup deterministic wizard.

## 18. Prioritas Berikutnya

Tuliskan 3–5 langkah paling masuk akal berikutnya.

1. Analisis log terbaru [`qa-agent-browser-2026-06-03T16-56-14-232Z.log`](storage/logs/qa-agent-browser-2026-06-03T16-56-14-232Z.log) dan pasangan [`agent-browser-run-*.log`](storage/logs) untuk menentukan blocker live terbaru: apakah gagal di local app, deteksi tombol, Jobstreet login, captcha, OTP, atau no-progress.
2. Jalankan full verification batch: [`npm run lint`](package.json:10), [`npx tsc --noEmit`](package.json:45), [`npx prisma generate`](prisma/schema.prisma:1), [`node --test ./tests/campaign-state.test.ts ./tests/campaign-pagination-state.test.ts`](tests/campaign-state.test.ts:1), dan [`node --experimental-strip-types --test ./tests/api-json-response.test.ts ./tests/safe-json.test.ts ./tests/safe-url.test.ts ./tests/jobstreet-url.test.ts ./tests/autopilot-phase-transition.test.ts`](tests/autopilot-phase-transition.test.ts:1).
3. Jalankan ulang [`npm run qa:agent-browser -- --campaign=cmpy6ituy006c9k35xtreuri7 --target=1`](package.json:17) dan [`npm run qa:autopilot -- --campaign=cmpy6ituy006c9k35xtreuri7 --target=1 --skip-applied-baseline`](package.json:15), lalu bandingkan bukti visible-browser vs MCP internal.
4. Verifikasi urutan log apply `campaign.phase_apply_started` → `campaign.phase_apply_job_selected` → `campaign.phase_apply_job_started` → `application.started` → `campaign.apply_runner_dispatch` → `mcp_ai.runner_started` pada run live berikutnya.
5. Jika flow sudah sampai Jobstreet tetapi berhenti di login/captcha/OTP/security, pertahankan pause aman `manual_intervention_required` tanpa bypass dan dokumentasikan blocker final secara eksplisit.

## 19. Prompt Lanjutan yang Direkomendasikan

Tuliskan prompt pendek untuk task berikutnya.

```txt
Continue from IMPLEMENTATION_STATUS.md. Focus on the Jobstreet MCP login/session blocker for direct apply `92457600`:
1. Use [`/api/browser/session?checkLive=1`](app/api/browser/session/route.ts:10) to verify the visible MCP browser session live.
2. Ask the user to complete manual login only in the visible MCP Chromium if state is `login_required`.
3. Rerun [`npm run qa:autopilot -- --campaign=cmpybm8rh00009k0b057yhrg0 --job-url=https://id.jobstreet.com/id/job/92457600 --target=1 --force-direct-apply --resume-after-manual --skip-applied-baseline`](package.json:15).
4. Verify whether the flow reaches `https://id.jobstreet.com/id/job/92457600/apply` or later steps.
5. Do not claim success without URL `/apply/success` or strong success marker evidence.
6. Update IMPLEMENTATION_STATUS.md after finishing.
```

## 20. Catatan untuk AI Assistant Berikutnya

Tuliskan hal penting yang harus diketahui AI assistant berikutnya:

* Jangan ubah arsitektur tanpa alasan kuat.
* Jangan implement captcha bypass.
* UI harus Bahasa Indonesia.
* App ini local-first untuk pribadi.
* Gunakan 9router OpenAI-compatible API.
* Integrasi 9router kini dipusatkan di `lib/ai/9router-config.ts` dan `lib/ai/9router-client.ts`; prioritaskan `NINEROUTER_*`, fallback ke `NINE_ROUTER_*`.
* Health check internal ada di `app/api/settings/9router/health/route.ts` dan model discovery ada di `app/api/settings/9router/models/route.ts`.
* Dashboard, CV, profile, campaigns, logs, jobs, applications, question-memory, dan settings sudah tidak memakai mock data lagi.
* `JobListing` sekarang memiliki `campaignId` opsional dan `snippet` field.
* `JobListing.url` memiliki `@unique` constraint untuk deduplication.
* `Campaign` memiliki relasi `jobListings` ke `JobListing`.
* Selector Jobstreet menggunakan multiple strategies (data-automation, semantic HTML, generic fallback). Jika selector rusak, update `extractJobCards()` dan `extractJobDetail()` di `lib/browser/jobstreet-agent.ts`.
* AI job scoring sudah terintegrasi ke campaign runner. Setiap lowongan yang disimpan akan di-score, dan status diubah menjadi shortlisted/skipped berdasarkan matchThreshold.
* Manual intervention message sudah diupdate untuk memandu user menyelesaikan login/captcha/OTP di browser yang terbuka, lalu klik Lanjutkan Kampanye.
* Browser tidak ditutup saat manual intervention terdeteksi. Untuk QA direct apply, rerun sekarang memakai flag [`--resume-after-manual`](scripts/qa-autopilot.mjs:58) dan live session-check sebelum memulai ulang.
* Endpoint sesi browser [`GET()`](app/api/browser/session/route.ts:10) sekarang mendukung `?checkLive=1&campaignId=...&targetUrl=...` dan menulis event `jobstreet.session_check_started`, `jobstreet.session_valid`, atau `jobstreet.session_invalid`.
* Apply calibration dry run: `calibrateJobApply()` di `lib/browser/jobstreet-apply-calibrator.ts` melakukan deteksi flow, platform, form fields, dan submit candidates tanpa submit. Hasil disimpan ke `ApplicationCalibration`.
* `/profile` UI sudah dipoles: tidak ada raw JSON yang ditampilkan ke user normal, skills sebagai badges, experience/education/projects sebagai cards dengan field yang di-humanize, raw CV text tersembunyi dalam collapsible section.
* Helper functions untuk profile: `parseProfileJson` (safe JSON parser), `humanizeKey` (convert camelCase/snake_case ke readable label), `renderFlexibleObject` (render object sebagai description list dengan formatting yang baik).
* Assisted apply flow ada di `lib/browser/jobstreet-apply-agent.ts` dengan fungsi `startJobApplication()`.
* Final submit ada di `lib/browser/jobstreet-apply-agent.ts` dengan fungsi `submitApplication()`. Safe submit button matching menggunakan allowed/blocked labels.
* Form filler ada di `lib/browser/form-filler.ts` dengan fungsi `fillKnownApplicationFields()`, `detectFormQuestions()`, dan `detectSubmitButton()`.
* Page detector ada di `lib/browser/page-detector.ts` dengan fungsi `detectManualIntervention()` yang mendeteksi login, captcha, OTP, security check, dan uncertain page.
* Campaign loop runner ada di `lib/campaign/loop-runner.ts` dengan fungsi `prepareNextApplication()`.
* Campaign actions client component ada di `components/campaign-actions.tsx`.
* API route untuk start apply ada di `app/api/jobs/[id]/apply/start/route.ts`.
* API route untuk submit ada di `app/api/applications/[id]/submit/route.ts`. Memerlukan `{ approved: true }` di body.
* API route untuk skip ada di `app/api/applications/[id]/skip/route.ts`.
* API route untuk campaign loop ada di `app/api/campaigns/[id]/loop/route.ts`.
* API route untuk single application ada di `app/api/applications/[id]/route.ts`.
* Halaman review lamaran ada di `app/applications/[id]/review/page.tsx`. Tombol Setujui dan Kirim aktif, Lewati Lamaran aktif.
* Next.js 16 menggunakan `Promise<{ id: string }>` untuk params di API routes.
* Final submit SUDAH diimplementasikan dengan approval user. Browser visible, safe submit button, berhenti jika intervensi. Belum diverifikasi end-to-end.
* Campaign loop SUDAH diimplementasikan. Menyiapkan satu lamaran per iterasi, menunggu approval user. Belum diverifikasi end-to-end.
* Update file ini setiap selesai perubahan.

## 21. Workflow GitHub Wajib untuk Agent

Setiap agent/AI developer yang mengerjakan repository ini wajib mengikuti workflow GitHub berikut setelah menyelesaikan task.

### Aturan Utama

* Setelah melakukan perubahan kode, agent wajib memperbarui `IMPLEMENTATION_STATUS.md`.
* `IMPLEMENTATION_STATUS.md` harus mencerminkan kondisi nyata repository setelah perubahan.
* Setelah `IMPLEMENTATION_STATUS.md` diperbarui, agent wajib melakukan:

  1. cek status git
  2. review perubahan penting
  3. jalankan command verifikasi yang relevan
  4. `git add -A`
  5. `git commit`
  6. `git push`
* Agent tidak perlu menunggu instruksi tambahan untuk commit dan push setelah task selesai.
* Commit message harus jelas dan mengikuti perubahan yang dilakukan.

### Command Wajib

Gunakan urutan berikut:

```bash
git status
npm run lint
npx prisma generate
git add -A
git status
git commit -m "[UPDATE] describe implemented changes"
git push
```

Jika ada migration/database schema change, jalankan juga:

```bash
npx prisma migrate dev
```

Jika ada perubahan Playwright/browser automation, jalankan juga:

```bash
npx playwright install chromium
```

### Format Commit Message

Gunakan format berikut:

```txt
[UPDATE] untuk penambahan fitur
[FIX] untuk perbaikan bug
[REFACTOR] untuk refactor struktur/kode
[DOCS] untuk dokumentasi
[DELETE] untuk penghapusan file/fitur
```

Contoh:

```bash
git commit -m "[UPDATE] add real dashboard data and 9router health check"
git commit -m "[FIX] resolve CV upload validation error"
git commit -m "[DOCS] update implementation status after verification"
```

### Guardrail Keamanan

Sebelum commit dan push, agent wajib memastikan file rahasia tidak ikut ter-commit.

Jangan commit file berikut kecuali user secara eksplisit meminta:

```txt
.env
.env.local
.env.*.local
*.db
*.sqlite
storage/cv/*
storage/screenshots/*
storage/jobstreet.auth.json
node_modules/
.next/
```

Jika file rahasia muncul di `git status`, agent wajib:

1. menghentikan proses commit,
2. update `.gitignore`,
3. remove file rahasia dari staging jika sudah terlanjur masuk,
4. lanjut commit hanya setelah aman.

Command aman:

```bash
git restore --staged .env .env.local storage/jobstreet.auth.json || true
git status
```

### Jika Verifikasi Gagal

Jika `npm run lint`, migration, build, atau test gagal:

* Jangan push perubahan yang rusak kecuali task memang khusus menyimpan progress WIP.
* Perbaiki error terlebih dahulu.
* Jika tidak bisa diperbaiki, update `IMPLEMENTATION_STATUS.md` pada bagian Error/Bug Saat Ini.
* Commit boleh dilakukan sebagai WIP hanya jika perubahan penting perlu disimpan, dengan commit message:

```bash
git commit -m "[WIP] document current blocker and partial implementation"
```

### Catatan untuk Agent

* Jangan pernah menulis value asli API key, password, token, cookie, atau session ke `IMPLEMENTATION_STATUS.md`.
* Jangan commit credential Jobstreet.
* Jangan commit API key 9router.
* Jangan commit file session browser jika berisi login user.
* Semua perubahan harus tetap mengikuti batasan project:

  * tidak ada captcha bypass
  * tidak ada stealth automation
  * tidak ada proxy rotation
  * tidak ada scraping besar-besaran
  * submit final tetap butuh approval user

## 22. QA End-to-End Autopilot — Campaign cmpw0lf1q00009kzenh71ae42

### Target QA

Campaign URL:
`http://localhost:3000/campaigns/cmpw0lf1q00009kzenh71ae42`

Target:
- Minimal 5 lamaran berhasil submitted dan terverifikasi.
- Tidak boleh ada false success.
- `Campaign.appliedCount` hanya bertambah jika submit benar-benar verified.
- `Application.status` hanya menjadi `submitted` jika ada marker sukses setelah submit.
- `JobListing.status` hanya menjadi `submitted` jika `Application` terkait submitted.

### Checklist QA

- [ ] Dev server berjalan.
- [ ] Database bisa diakses.
- [ ] Prisma client sudah generate.
- [ ] 9router health aktif.
- [ ] Chat model aktif.
- [ ] Browser Playwright visible terbuka.
- [ ] Session Jobstreet aktif / user sudah login.
- [ ] Campaign `cmpw0lf1q00009kzenh71ae42` ditemukan.
- [ ] Campaign mode = `auto_submit_safe_only`.
- [ ] Campaign `formAutomationMode` = `mcp_ai_first`.
- [ ] Campaign `targetApplyCount` minimal 5 atau dinaikkan ke 5 jika kurang.
- [ ] Autopilot dapat mencari lowongan.
- [ ] Autopilot membuka lowongan pertama.
- [ ] AI membaca form apply.
- [ ] AI mengisi field dari `CandidateProfile`/`Campaign`/`QuestionMemory`.
- [ ] Jika ada Yes/No/question, decision muncul di UI, bukan instruksi “cek browser”.
- [ ] Submit Application diklik otomatis jika aman.
- [ ] Submit sukses diverifikasi.
- [ ] `Application` #1 status `submitted`.
- [ ] `Application` #2 status `submitted`.
- [ ] `Application` #3 status `submitted`.
- [ ] `Application` #4 status `submitted`.
- [ ] `Application` #5 status `submitted`.
- [ ] `Campaign.appliedCount` bertambah minimal 5.
- [ ] Autopilot lanjut lowongan berikutnya otomatis setelah submit verified.
- [ ] Lowongan yang stuck/`apply_unavailable` tidak diulang otomatis.
- [ ] Submit yang tidak verified tidak dihitung sebagai submitted.
- [ ] Tidak ada pesan normal-flow “Periksa browser” kecuali captcha/login/OTP/security.
- [ ] Logs menunjukkan alur jelas dari search sampai submit verified.
- [ ] Screenshot submit/error tersimpan bila relevan.
- [ ] QA result ditulis lengkap di `IMPLEMENTATION_STATUS.md`.

### Data Hasil QA

Isi setelah testing:

| No | Job Title | Company | JobListing ID | Application ID | Status | SubmittedAt | Evidence / Log Event | Catatan |
| -- | --------- | ------- | ------------- | -------------- | ------ | ----------- | -------------------- | ------- |
| 1 | IT Fullstack Developer | PT Sinar Sukses Mandiri | `cmpyc0wnl00229kvgsatdxtkv` | `cmpyhaghh00ee9kvgx7516n91` | failed | — | `jobstreet.external_redirect_invalid_url`, `application.apply_unavailable` | Bukti live terdahulu menunjukkan URL apply jatuh ke `about:blank`, lalu lowongan ditandai `apply_unavailable` dan tidak dihitung submit. |
| 2 | — | — | — | — | QA rerun verified | — | `campaign.qa_run_requested`, `mcp.preflight_ok` | Rerun QA untuk campaign `cmpybm8rh00009k0b057yhrg0` berhasil start ulang dari status `completed` setelah patch pada [`app/api/qa/campaigns/[id]/run/route.ts`](app/api/qa/campaigns/[id]/run/route.ts). |
| 3 | — | — | — | — | Pagination verified live | — | `campaign.page_exhausted_continue_next_page`, `campaign.next_search_page` | QA live `2026-06-03T20:41:32Z` membuktikan flow reset dari page 1 lalu lanjut nyata ke page 2 dan page 3; fix propagasi `currentSearchPage`/`currentSearchUrl` kini terverifikasi live. |
| 4 | QA Direct Apply 92457600 | — | `cmpyjxu8o00ic9kvgq7oqhtmg` | — | failed | — | `campaign.phase_apply_job_selected`, `qa.failed`, `blockerEvidence.type=login` | QA live `2026-06-03T21:33:43Z` membuktikan forced direct-apply kini benar-benar memilih lowongan seeded `92457600` lagi setelah patch internal-ID repick pada [`pickNextJob()`](lib/campaign/autopilot-runner.ts:288); blocker lama `direct_apply_candidate_missing` tidak muncul lagi. |
| 5 | QA Direct Apply 92457600 | — | `cmpyjxu8o00ic9kvgq7oqhtmg` | — | manual_intervention_required | — | `currentStep=apply_failed`, `decisionRequired.type=stuck_no_progress`, `blockerEvidence.type=login` | Run live terbaru berhenti pada intervensi manual login/security dengan bukti MCP bahwa halaman/login URL terdeteksi pada target direct Jobstreet. Ini blocker live yang valid; belum ada bukti URL sudah mencapai `/apply` atau `/apply/success`. |
| 6 | — | — | — | — | Regression verified | — | `node --test ./tests/autopilot-apply-dispatch.test.ts`, `npx tsc --noEmit` | Test baru pada [`tests/autopilot-apply-dispatch.test.ts`](tests/autopilot-apply-dispatch.test.ts:194) memverifikasi failed application yang hanya punya `jobListingId` internal tidak lagi memblokir forced direct repick; validasi TypeScript juga lulus. |
| 7 | QA Direct Apply 92457600 | — | `cmpyjxu8o00ic9kvgq7oqhtmg` | — | login_required | — | [`/api/browser/session?checkLive=1`](app/api/browser/session/route.ts:10), `jobstreet.session_invalid` | Live session check `2026-06-03T21:59:03Z` memverifikasi browser MCP visible memang belum punya sesi Jobstreet yang cukup untuk lanjut; URL tetap `https://id.jobstreet.com/id/job/92457600`, evidence `Halaman login atau URL oauth/login terlihat`, `canResumeAutopilot=false`. |
| 8 | QA Direct Apply 92457600 | — | — | — | failed_safe_resume_guard | — | [`--resume-after-manual`](scripts/qa-autopilot.mjs:58), `qa.failed`, `Current URL: about:blank` | Rerun live `2026-06-03T21:59:33Z` dengan resume flag berhenti aman sebelum apply karena live check kedua menghasilkan snapshot `about:blank` / `unknown`, sehingga sistem menolak klaim resume dan tidak mencoba apply dengan sesi yang belum valid. |
| 9 | QA Direct Apply 92457600 | — | — | — | login_required (email fill inconsistent) | — | [`emailFillAttempted: true`](app/api/browser/session/route.ts:36), `jobstreet.login_email_fill_done` | Rerun `2026-06-03T23:21:20Z` setelah patch safe email-fill dan blank-recovery: blank recovery ran, email fill ran, tetapi final snapshot kembali blank/unknown; last-actionable-state patch added. |
| 10 | QA Direct Apply 92457600 | — | — | — | login_required (real Seek URL preserved) | — | `currentUrl: https://login.seek.com/...`, `emailFillAttempted: true` | Rerun `2026-06-03T23:25:55Z` setelah last-actionable patch: final state sekarang real `login_required` pada Seek OAuth URL, tetapi `emailFillAttempted: false` (email field not visible in that run). |
| 11 | QA Direct Apply 92457600 | — | — | — | login_required (email fill now consistent) | — | `currentUrl: https://login.seek.com/...`, `emailFillAttempted: true`, `emailFillCompleted: true`, `passwordInputDetected: true` | Rerun `2026-06-03T23:36:54Z` setelah widened email detection: email fill now ran consistently, final snapshot confirms password input still visible, proving MCP browser not authenticated yet. User must complete manual login in visible MCP browser before resume can succeed. |

### Status Akhir QA

`FAILED_WITH_VERIFIED_LIVE_BLOCKER`

Ringkasan aktual task ini:
- campaign diuji live: `cmpybm8rh00009k0b057yhrg0`
- target direct saat ini: `https://id.jobstreet.com/id/job/92457600`
- submitted verified: 0
- skipped: 0
- `apply_unavailable`: historis tetap ada pada run terdahulu
- stuck: 1 run direct terbaru berhenti di `stuck_no_progress`
- `manual_intervention`: 1 blocker live terbaru terdeteksi sebagai login/security
- `submit_unverified`: 0
- bukti live QA terbaru: [`storage/logs/qa-autopilot-2026-06-03T21-33-43-482Z.log`](storage/logs/qa-autopilot-2026-06-03T21-33-43-482Z.log), [`storage/logs/qa-autopilot-2026-06-03T21-59-33-408Z.log`](storage/logs/qa-autopilot-2026-06-03T21-59-33-408Z.log), [`storage/logs/campaign-cmpybm8rh00009k0b057yhrg0.log`](storage/logs/campaign-cmpybm8rh00009k0b057yhrg0.log)
- hasil fix terverifikasi: forced direct rerun tidak lagi gagal di `direct_apply_candidate_missing`; seeded listing `QA Direct Apply 92457600` berhasil dipilih kembali secara live setelah patch pada [`pickNextJob()`](lib/campaign/autopilot-runner.ts:288).
- hasil fix tambahan terverifikasi: live session-check endpoint dan resume guard sekarang mengungkap blocker auth/session secara eksplisit sebelum rerun apply, termasuk state `login_required` dan fallback aman bila snapshot MCP kembali `about:blank`.
- blocker utama terverifikasi sekarang: intervensi manual login/captcha/OTP/security pada sesi visible Chromium / MCP, bukan lagi exhausted search pool untuk jalur direct ini.
- hal yang belum boleh diklaim: belum ada bukti live bahwa run terbaru mencapai `https://id.jobstreet.com/id/job/92457600/apply`, belum ada bukti `/apply/success`, dan `appliedCount` tetap 0.
- integritas hasil: tidak ada false `submitted`, tidak ada false `completed_success`, dan tidak ada klaim submit tanpa marker sukses terverifikasi.
- next fix yang diperlukan: siapkan sesi Jobstreet login yang valid pada Chromium visible tanpa mengotomasi password/login/OTP, lalu rerun QA direct yang sama untuk memverifikasi apakah flow bisa lanjut minimal ke `/apply`.
