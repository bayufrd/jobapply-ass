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
Project sekarang sudah berjalan sebagai fondasi MVP lokal yang jujur dengan Campaign Autopilot v2. User dapat membuat kampanye sekali lalu menjalankan alur autopilot terkontrol dari halaman kampanye: mencari lowongan, scoring, memproses lowongan satu per satu dengan hard job lock, tidak mengambil ulang lowongan terminal/gagal/apply_unavailable, menjalankan assisted apply stateful terlebih dahulu, memanggil AI UI fallback sekali saat tombol lamar tidak ditemukan, menandai lowongan `apply_unavailable` bila fallback tetap gagal, berhenti saat ada pertanyaan yang belum pasti, dan hanya menganggap submit berhasil jika final submit benar-benar terverifikasi. Default mode kampanye sekarang `auto_submit_safe_only`, UI kampanye juga bisa auto-continue bounded tanpa user harus menekan `Lanjutkan` untuk setiap lowongan. Browser tetap visible, tidak ada captcha bypass, tidak ada stealth automation, dan tidak ada proxy rotation.

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
| Buat Kampanye Lamaran              | Selesai | API create/list campaign ada, form [`/campaigns/new`](app/campaigns/new/page.tsx) mengirim data nyata, default mode sekarang `auto_submit_safe_only`, dan warning Bahasa Indonesia menjelaskan kapan kampanye akan dijeda. | `app/api/campaigns/route.ts`, `app/campaigns/new/page.tsx`, `lib/api/campaigns.ts` |
| Default Salary/Notice/Availability | Selesai | Nilai default dibaca dari ENV dan disimpan saat create campaign. | `app/api/campaigns/route.ts`, `.env` |
| Playwright Browser Visible         | Selesai | Browser manager menolak headless dan memaksa visible Chromium. | `lib/browser/playwright-manager.ts`, `lib/security/safe-automation.ts` |
| Simpan Session Jobstreet           | Partial | Metadata session disimpan di DB, path session persistent dipakai, endpoint session menampilkan status nyata, tetapi validasi session masih dasar. | `lib/browser/playwright-manager.ts`, `app/api/browser/session/route.ts`, `prisma/schema.prisma` |
| Login Jobstreet via ENV            | Belum | ENV credential sudah ada, tetapi belum ada implementasi login otomatis spesifik Jobstreet. | `.env`, `lib/browser/jobstreet-agent.ts` |
| Search Jobstreet                   | Selesai | Agent membuka Jobstreet, membangun URL pencarian dari keyword dan lokasi, navigasi ke halaman hasil, dan mengumpulkan job card dari halaman pertama. | `lib/browser/jobstreet-agent.ts` |
| Extract Info Lowongan              | Selesai | Agent membuka halaman detail setiap lowongan dan mengekstrak title, company, location, salary, workType, description. Mendukung multiple selector strategies dengan fallback. | `lib/browser/jobstreet-agent.ts` |
| Simpan JobListing                  | Selesai | Setiap lowongan disimpan ke Prisma `JobListing` dengan deduplication berdasarkan URL (`@unique`). Lowongan duplikat diupdate, bukan dibuat ulang. Relasi `campaignId` ditambahkan. | `lib/browser/jobstreet-agent.ts`, `prisma/schema.prisma` |
| AI Job Scoring                     | Selesai | Fungsi scoring AI sudah terintegrasi ke flow campaign automation. Setiap lowongan yang disimpan akan di-score, dan status diubah menjadi shortlisted/skipped berdasarkan matchThreshold. | `lib/ai/job-scorer.ts`, `lib/browser/jobstreet-agent.ts` |
| Assisted Form Filling              | Partial | Flow apply Jobstreet kini memakai watchdog ketat: step timeout 8 detik, no-progress limit 2 aksi, AI fallback hanya 1 kali, scroll scan maksimal 2 pass, dan hard timeout 3 menit per lowongan. Jika slide/form pertama tidak berubah, sistem mengambil screenshot + DOM snapshot, meminta AI satu kali dengan intent aman, lalu wajib mengambil keputusan bounded: lanjut bila ada progres, atau tandai `apply_unavailable` / `stuck_no_progress` dan lanjut ke lowongan berikutnya bila aman. AI tetap hanya boleh memilih elemen visible dari snapshot Playwright. Masih perlu verifikasi manual terhadap slide Jobstreet nyata. | `lib/browser/form-filler.ts`, `lib/browser/dom-snapshot.ts`, `lib/ai/ui-action-planner.ts`, `lib/browser/ui-action-executor.ts`, `lib/browser/ai-apply-wizard.ts`, `lib/browser/apply-wizard-state.ts`, `lib/browser/jobstreet-apply-agent.ts`, `lib/browser/apply-watchdog.ts` |
| Modal Pertanyaan Tambahan          | Partial | Question handling lama tetap ada. AI wizard baru juga bisa pause saat butuh jawaban user, menyimpan pending question + suggested answer/evidence, dan menyiapkan payload agar pertanyaan serupa bisa dipakai ulang. UI popup detail tombol khusus belum selesai dihubungkan penuh. | `lib/browser/ai-apply-wizard.ts`, `lib/ai/question-answerer.ts`, `app/applications/[id]/review/page.tsx` |
| Memori Pertanyaan                  | Partial | `QuestionMemory` lama tetap dipakai. Fondasi `FormInteractionMemory` sudah ditambahkan ke schema untuk menyimpan pola field/button hasil identifikasi AI pada form serupa, tetapi migrasi/generate Prisma dan penyimpanan runtime suksesnya belum selesai diverifikasi. | `app/api/questions/answer/route.ts`, `prisma/schema.prisma`, `lib/browser/ai-apply-wizard.ts` |
| Modal Captcha/Verifikasi           | Selesai | Guardrail tetap keras: captcha, OTP, login/password, security verification, permission dialog, dan elemen sensitif diblokir. AI tidak bisa override blok ini dan browser tetap visible. | `lib/browser/page-detector.ts`, `lib/security/safe-automation.ts`, `lib/browser/ui-action-executor.ts`, `lib/ai/ui-action-planner.ts` |
| Review Lamaran Sebelum Submit      | Partial | Mode `review_each_application` tetap pause di `pending_review`, tetapi mode `auto_submit_safe_only` tidak lagi turun ke review saat `final_submit_ready`. Review page lama tetap ada untuk kasus manual/external/question-required. | `app/applications/[id]/review/page.tsx`, `app/api/campaigns/[id]/status/route.ts`, `lib/browser/ai-apply-wizard.ts`, `lib/browser/jobstreet-apply-agent.ts` |
| Submit Lamaran                     | Partial | Submit akhir kini strictly bounded. Resolver submit final dibatasi 8 detik: scan viewport, scroll ke bawah, scan kandidat tombol, minta planner AI final submit satu kali, lalu berhenti dengan status `submit_not_found_timeout` bila tidak ada kandidat high-confidence. Pesan normal-flow browser-check yang ambigu dihapus; user kini mendapat keputusan in-app yang jelas seperti `Coba Lagi`, `Lewati Lowongan`, `Anggap Sudah Terkirim`, dan opsional `Buka Browser`. `appliedCount` hanya naik setelah verifikasi sukses; submit yang sudah diklik tetapi belum terverifikasi tetap `paused`, bukan false success. Masih perlu uji manual Jobstreet nyata. | `lib/browser/jobstreet-apply-agent.ts`, `lib/browser/final-submit-resolver.ts`, `lib/browser/ai-apply-wizard.ts`, `lib/browser/apply-wizard-state.ts`, `lib/browser/ui-action-executor.ts`, `app/api/applications/[id]/submit/route.ts` |
| Skip Lamaran                       | Selesai | Tombol "Lewati Lamaran" di halaman review mengubah status ke `skipped` dan mengembalikan job ke `shortlisted`. | `app/applications/[id]/review/page.tsx`, `app/api/applications/[id]/skip/route.ts` |
| Campaign Loop / Autopilot v2       | Partial | Autopilot v2 kini wajib continue setelah job-level stuck yang bounded. Jika satu lowongan berakhir sebagai `apply_unavailable`, `stuck_no_progress`, atau `submit_not_found_timeout`, sistem menulis log terstruktur, menandai lowongan terminal untuk kampanye saat ini, lalu otomatis lanjut ke lowongan berikutnya. Kampanye hanya pause untuk captcha, OTP, login/security verification, pertanyaan wajib yang tidak dikenal, submit sudah diklik tetapi belum terverifikasi, atau terlalu banyak stuck berturut-turut. Limit stuck berturut-turut kini 5 lowongan dengan pesan pause eksplisit. UI status kampanye juga mulai menampilkan countdown step, no-progress count, AI fallback count, dan next automatic action. Propagasi UI status lanjutannya masih perlu verifikasi manual end-to-end. | `lib/campaign/autopilot-runner.ts`, `app/api/campaigns/[id]/autopilot/start/route.ts`, `app/api/campaigns/[id]/autopilot/continue/route.ts`, `app/api/campaigns/[id]/autopilot/decision/route.ts`, `app/api/campaigns/[id]/status/route.ts`, `components/campaign-actions.tsx`, `lib/browser/jobstreet-apply-agent.ts`, `lib/browser/apply-wizard-state.ts`, `lib/campaign/campaign-state.ts`, `lib/browser/apply-watchdog.ts` |
| Apply Calibration / Dry Run        | Selesai (Perlu Verifikasi Manual) | One-time dry run apply untuk mendeteksi flow type, platform, form fields, buttons, questions, dan submit candidates tanpa melakukan submit. Mendukung deteksi internal Jobstreet, external redirect, email apply, WhatsApp apply. Manual intervention (login/captcha/OTP) menghentikan flow dan membiarkan browser terbuka. | `lib/browser/jobstreet-apply-calibrator.ts`, `app/api/jobs/[id]/apply/calibrate/route.ts`, `app/api/jobs/[id]/calibration/route.ts`, `app/jobs/[id]/calibration/page.tsx` |
| Log Aktivitas                      | Selesai | Dashboard dan halaman `/logs` kini membaca `AutomationLog` nyata dari database. Log search Jobstreet, assisted apply, dan kalibrasi lengkap dengan semua event. | `lib/logging/automation-log.ts`, `prisma/schema.prisma`, `app/logs/page.tsx`, `app/dashboard/page.tsx` |
| Pause/Resume/Stop Campaign         | Partial | API route status update dan log nyata sudah ada, tetapi resume belum melanjutkan automation session sesungguhnya. Kontrol kampanye di halaman detail kini terintegrasi dengan campaign loop. | `app/api/campaigns/[id]/pause/route.ts`, `app/api/campaigns/[id]/resume/route.ts`, `app/api/campaigns/[id]/stop/route.ts`, `components/campaign-actions.tsx` |
| Screenshot Saat Submit             | Selesai | Screenshot sebelum submit, setelah submit, dan saat error/intervensi disimpan ke `storage/screenshots` dan ditautkan ke `Application.screenshotPath`. | `lib/browser/jobstreet-apply-agent.ts`, `prisma/schema.prisma` |
| README Setup                       | Selesai | README sudah menjelaskan instalasi, ENV, Prisma, Playwright, route, dan batasan. | `README.md` |

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
| /campaigns/new   | Selesai | Form submit nyata ke API create campaign dan mendukung fallback default dari ENV. |
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
| app/api/campaigns/[id]/status/route.ts | Selesai | GET status kampanye realtime-like untuk polling UI. Mengembalikan `campaign`, `counts`, `currentStep`, `currentJob`, `lastDecisionRequired`, `latestLogs`, `canContinue`, dan `nextRecommendedAction`. Rules start/continue kini memakai helper status bersama agar kampanye `stopped` bisa direstart dari UI autopilot. |
| app/api/campaigns/[id]/autopilot/start/route.ts | Selesai | Menjalankan satu langkah bounded Autopilot v2 dari awal flow kampanye. Mendukung start/restart untuk status `ready`, `paused`, `stopped`, dan `error`; restart dari `stopped` membersihkan state runtime transien lalu lanjut ke lowongan eligible berikutnya. |
| app/api/campaigns/[id]/autopilot/continue/route.ts | Selesai | Melanjutkan satu langkah bounded berikutnya saat aman untuk lanjut. |
| app/api/campaigns/[id]/autopilot/decision/route.ts | Selesai | Menyimpan keputusan user untuk low score/decision state kampanye, termasuk opsi skip serupa untuk kampanye ini saja. |
| app/api/jobs/[id]/apply/calibrate/route.ts | Selesai (Perlu Verifikasi Manual) | POST kalibrasi dry run. Tetap tersedia untuk debugging manual, tetapi pada Autopilot v2 kalibrasi dijalankan internal bila diperlukan. |
| app/api/jobs/[id]/calibration/route.ts | Selesai | GET hasil kalibrasi terbaru untuk job listing. Mengembalikan data `ApplicationCalibration` terbaru dengan relasi job listing. |

## 10. Automation / Playwright Status

Jelaskan status browser automation:

* Browser visible mode: Sudah diterapkan. Headless mode ditolak dan browser harus tetap terlihat.
* Session save/load: Path persistent session dipakai dan metadata session disimpan ke `BrowserSession`, tetapi load/validasi session masih dasar.
* Manual login/security: Hanya captcha, OTP, login, dan security verification yang boleh meminta tindakan user di browser.
* Login via ENV: Belum diimplementasikan.
* Jobstreet search: Sudah diimplementasikan dan menjadi bagian dari loop utama kampanye.
* Search + apply one-by-one: Arah implementasi sekarang adalah cari lowongan → pilih lowongan eligible berikutnya → langsung buka dan lamar → lanjut ke lowongan berikutnya sampai target tercapai.
* Save to DB: Sudah diimplementasikan dengan deduplication berdasarkan URL (`@unique`).
* AI job scoring: Sudah diimplementasikan. Skor rendah tidak lagi memblokir tombol lamar; perilaku ditentukan oleh `lowScoreMode`.
* Form automation default: Default kampanye baru sekarang `formAutomationMode = ai_first` dan `automationMode = auto_submit_safe_only`.
* AI-first apply runner: Jalur baru [`runAiFirstApplyRunner()`](lib/browser/ai-first-apply-runner.ts:1) kini memakai watchdog ketat dengan default `maxSameStepDurationMs = 8000`, `maxSubmitResolverDurationMs = 8000`, `maxNoProgressActions = 2`, `maxAiFallbackAttempts = 1`, `maxScrollScanAttempts = 2`, dan `maxTotalJobDurationMs = 180000`. Semua limit mendukung override ENV `APPLY_MAX_*`.
* AI planner: Planner menerima visible DOM snapshot, profil kandidat, kampanye, lowongan, `QuestionMemory`, dan wizard history. Output wajib JSON-only dan hanya boleh memakai `elementId` yang benar-benar terlihat.
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
* Log tampil di UI: Ya, dashboard dan halaman `/logs` membaca data DB nyata.
* Log per campaign: Didukung oleh relasi dan field `campaignId`.
* Log per job: Didukung oleh relasi dan field `jobListingId`.
* Log campaign loop baru: Target event utama sekarang mencakup `campaign.autopilot_searching_next_job`, `campaign.autopilot_processing_job`, dan `campaign.autopilot_next_job`.
* Log AI form: Target event utama sekarang mencakup `ai_form.reading_page`, `ai_form.action_selected`, `ai_form.action_executed`, `ai_form.question_needs_user`, `ai_form.yes_no_answered`, `ai_form.submit_ready`, `ai_form.auto_submit_clicked`, dan `ai_form.submit_verified`.
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

Tanggal: 2026-06-02 (update dokumentasi setelah strict watchdog bounded-flow fix, sebelum verifikasi final)
Command yang dijalankan:

```bash
npm run lint
npx tsc --noEmit
npx prisma generate
```

Hasil target verifikasi manual:

* [ ] Buat kampanye baru dengan default `auto_submit_safe_only` dan `ai_first`.
* [ ] Klik `Jalankan Kampanye Autopilot` sekali dari halaman kampanye.
* [ ] Konfirmasi sistem mencari Jobstreet lalu langsung memproses lowongan berikutnya satu per satu.
* [ ] Konfirmasi sistem membuka lowongan dan melamar tanpa kalibrasi manual di jalur utama.
* [ ] Konfirmasi slide/form pertama tidak pernah diam lebih dari 8 detik; UI menampilkan countdown seperti `AI membaca form — 4/8 detik`.
* [ ] Konfirmasi no-progress count bertambah saat DOM/form/URL tidak berubah dan AI fallback dicoba tepat satu kali.
* [ ] Konfirmasi jika tetap tidak ada progres setelah fallback, lowongan ditandai `apply_unavailable` atau `stuck_no_progress`, lalu autopilot lanjut ke lowongan berikutnya bila aman.
* [ ] Konfirmasi final submit resolver berhenti maksimal 8 detik bila tombol submit tidak ditemukan dan menampilkan keputusan in-app `Coba Lagi`, `Lewati Lowongan`, `Anggap Sudah Terkirim`, dan opsional `Buka Browser`.
* [ ] Konfirmasi status `submitted` hanya muncul setelah verifikasi sukses, dan tidak ada false success setelah submit ambigu.
* [ ] Konfirmasi tidak ada bahasa normal-flow seperti `cek browser`, `periksa browser`, atau `sistem akan mencoba membaca ulang halaman` selain kasus captcha/login/OTP/security.

Catatan:
* Kalibrasi tidak lagi menjadi blocker jalur utama Autopilot.
* Browser tetap visible.
* Tidak ada bypass captcha, stealth automation, atau proxy rotation.

## 15. Error / Bug Saat Ini

| Tanggal | Error | Penyebab Dugaan | Status | File Terkait |
| ------- | ----- | --------------- | ------ | ------------ |
| 2026-06-02 | Resume campaign belum melanjutkan browser automation yang sebelumnya terhenti | Route resume masih hanya mengubah status dan menulis log | Open | `app/api/campaigns/[id]/resume/route.ts` |
| 2026-06-02 | Strict watchdog bounded-flow belum diverifikasi end-to-end terhadap Jobstreet nyata | Wiring timeout/no-progress/UI status sudah ditambahkan, tetapi belum diuji pada flow real browser | Open | `lib/browser/apply-watchdog.ts`, `lib/browser/ai-first-apply-runner.ts`, `lib/campaign/autopilot-runner.ts`, `components/campaign-actions.tsx` |
| 2026-06-02 | Mapping keputusan in-app ke jawaban final backend belum sepenuhnya matang | UI sudah diarahkan ke Accept/Reject/Yes/No, tetapi penyimpanan jawaban/edit answer/remember masih perlu pendalaman | Open | `components/campaign-actions.tsx`, `app/api/campaigns/[id]/autopilot/decision/route.ts` |
| 2026-06-02 | Selector Jobstreet bisa rusak jika UI berubah | Jobstreet UI dapat berubah sewaktu-waktu | Open/Risk | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Browser tetap terbuka saat manual intervention | Ini sesuai kebijakan keamanan, tetapi resume session sesudah intervensi belum penuh | Open/Limitation | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | External redirect flow belum selesai untuk submit akhir | Default arah produk adalah pause keputusan in-app untuk website eksternal | Open/Limitation | `lib/browser/ai-first-apply-runner.ts`, `lib/browser/jobstreet-apply-calibrator.ts` |
| 2026-06-02 | Submit flow bounded belum diverifikasi end-to-end terhadap Jobstreet nyata | Resolver submit final 8 detik sudah ditambahkan, tetapi masih perlu testing manual dengan browser visible pada halaman Jobstreet asli | Open | `lib/browser/final-submit-resolver.ts`, `lib/browser/ai-first-apply-runner.ts`, `lib/browser/jobstreet-apply-agent.ts` |

## 16. Risiko / Batasan

Tuliskan batasan saat ini:

* Tidak melakukan captcha bypass.
* Tidak melakukan stealth automation.
* Tidak melakukan scraping besar-besaran.
* Maksimal 10-20 lowongan diperiksa per run.
* Hanya halaman pertama hasil pencarian yang diambil (tidak ada paginasi).
* Jobstreet UI dapat berubah sewaktu-waktu sehingga selector Playwright bisa rusak.
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
* [x] Final submit lamaran setelah approval user. (Implemented with full-page resolver + re-read flow, still needs manual verification against live Jobstreet)
* [x] Tautkan screenshot error/intervensi ke record aplikasi yang relevan. (Screenshots now saved and linked)
* [x] Apply calibration dry run. (Implemented, needs manual verification against live Jobstreet)
* [ ] Verifikasi end-to-end submit, campaign loop, dan calibration terhadap Jobstreet nyata.
* [ ] Mode pengisian eksternal untuk flow external redirect.
* [ ] Resume automation setelah intervensi manual (bukan hanya status-level, tetapi melanjutkan browser session yang sama).
* [ ] Pagination hasil pencarian Jobstreet untuk kampanye besar.
* [ ] UI real-time untuk menampilkan status manual intervention dan tombol "Lanjutkan Kampanye" setelah user menyelesaikan intervensi.
* [ ] Edit jawaban dari halaman review.
* [x] Skip lamaran dari halaman review. (Implemented)
* [ ] Verifikasi manual stateful wizard + watchdog terhadap slide apply Jobstreet nyata, termasuk kasus stuck di slide pertama dan kasus final submit yang sulit diverifikasi.
* [ ] Form multi-step/accordion handling lanjutan untuk variasi layout yang belum tercakup deterministic wizard.

## 18. Prioritas Berikutnya

Tuliskan 3–5 langkah paling masuk akal berikutnya.

1. Verifikasi manual end-to-end strict watchdog pada Jobstreet nyata, terutama kasus stuck di slide pertama dan stuck di form pertama.
2. Verifikasi manual submit resolver bounded 8 detik pada halaman final submit Jobstreet nyata dan pastikan tidak ada false success.
3. Matangkan keputusan in-app agar Accept/Reject/Yes/No/Edit Answer benar-benar tersimpan, bisa diingat per kampanye, dan melanjutkan loop otomatis.
4. Implementasikan mode pengisian dan keputusan in-app untuk external redirect sampai batas aman.
5. Rapikan sisa wiring runtime agar status watchdog yang tampil di UI selalu sinkron dengan langkah browser terakhir.

## 19. Prompt Lanjutan yang Direkomendasikan

Tuliskan prompt pendek untuk task berikutnya.

```txt
Continue from IMPLEMENTATION_STATUS.md. Focus on verifying the apply_unavailable autopilot fix and the remaining live browser flows:
1. Manual verification: force or pick 1 job without an apply button, run Autopilot, and confirm the job becomes apply_unavailable, campaign does not pause, and autopilot continues to the next job.
2. Manual verification: confirm repeated polling does not re-pick the same apply_unavailable/failed job automatically.
3. Manual verification: test apply calibration dry run against live Jobstreet with visible browser on a normal job.
4. Manual verification: test submit flow against live Jobstreet with visible browser.
5. Implement external form filling mode for external redirect flows (google_form, greenhouse, lever, workday, company_site).
6. Implement edit answer from review page.
7. Keep UI in Bahasa Indonesia.
8. Update IMPLEMENTATION_STATUS.md after finishing.
9. Follow the mandatory GitHub workflow.
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
* Browser tidak ditutup saat manual intervention terdeteksi, tetapi session tidak dapat dilanjutkan otomatis setelah intervensi selesai (perlu restart campaign).
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
