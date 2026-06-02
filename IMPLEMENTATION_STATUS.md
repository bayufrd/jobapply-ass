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
Project sekarang sudah berjalan sebagai fondasi MVP lokal yang jujur dengan Campaign Autopilot v2. User dapat membuat kampanye sekali lalu menjalankan alur autopilot terkontrol dari halaman kampanye: mencari lowongan, scoring, meminta keputusan user saat low score, mengingat keputusan serupa per kampanye, menjalankan kalibrasi internal bila perlu, memulai assisted apply, berhenti saat ada pertanyaan yang belum pasti, dan hanya menganggap submit berhasil jika final submit benar-benar terverifikasi. Browser tetap visible, tidak ada captcha bypass, tidak ada stealth automation, dan tidak ada proxy rotation.

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
| Buat Kampanye Lamaran              | Selesai | API create/list campaign ada, form `/campaigns/new` mengirim data nyata, dan default ENV dipakai bila field opsional kosong. | `app/api/campaigns/route.ts`, `app/campaigns/`, `lib/api/campaigns.ts` |
| Default Salary/Notice/Availability | Selesai | Nilai default dibaca dari ENV dan disimpan saat create campaign. | `app/api/campaigns/route.ts`, `.env` |
| Playwright Browser Visible         | Selesai | Browser manager menolak headless dan memaksa visible Chromium. | `lib/browser/playwright-manager.ts`, `lib/security/safe-automation.ts` |
| Simpan Session Jobstreet           | Partial | Metadata session disimpan di DB, path session persistent dipakai, endpoint session menampilkan status nyata, tetapi validasi session masih dasar. | `lib/browser/playwright-manager.ts`, `app/api/browser/session/route.ts`, `prisma/schema.prisma` |
| Login Jobstreet via ENV            | Belum | ENV credential sudah ada, tetapi belum ada implementasi login otomatis spesifik Jobstreet. | `.env`, `lib/browser/jobstreet-agent.ts` |
| Search Jobstreet                   | Selesai | Agent membuka Jobstreet, membangun URL pencarian dari keyword dan lokasi, navigasi ke halaman hasil, dan mengumpulkan job card dari halaman pertama. | `lib/browser/jobstreet-agent.ts` |
| Extract Info Lowongan              | Selesai | Agent membuka halaman detail setiap lowongan dan mengekstrak title, company, location, salary, workType, description. Mendukung multiple selector strategies dengan fallback. | `lib/browser/jobstreet-agent.ts` |
| Simpan JobListing                  | Selesai | Setiap lowongan disimpan ke Prisma `JobListing` dengan deduplication berdasarkan URL (`@unique`). Lowongan duplikat diupdate, bukan dibuat ulang. Relasi `campaignId` ditambahkan. | `lib/browser/jobstreet-agent.ts`, `prisma/schema.prisma` |
| AI Job Scoring                     | Selesai | Fungsi scoring AI sudah terintegrasi ke flow campaign automation. Setiap lowongan yang disimpan akan di-score, dan status diubah menjadi shortlisted/skipped berdasarkan matchThreshold. | `lib/ai/job-scorer.ts`, `lib/browser/jobstreet-agent.ts` |
| Assisted Form Filling              | Partial | Deterministic filler lama tetap menjadi fast path, tetapi sekarang sudah ditambah fondasi AI UI Agent: snapshot DOM visible aman, planner AI berbasis 9router, executor Playwright tervalidasi, dan wizard loop untuk membaca halaman lalu memilih aksi hanya dari elemen visible yang disediakan app. Integrasi fallback ke flow apply Jobstreet sudah mulai masuk, namun masih perlu verifikasi compile dan wiring UI status akhir. | `lib/browser/form-filler.ts`, `lib/browser/dom-snapshot.ts`, `lib/ai/ui-action-planner.ts`, `lib/browser/ui-action-executor.ts`, `lib/browser/ai-apply-wizard.ts`, `lib/browser/jobstreet-apply-agent.ts` |
| Modal Pertanyaan Tambahan          | Partial | Question handling lama tetap ada. AI wizard baru juga bisa pause saat butuh jawaban user, menyimpan pending question + suggested answer/evidence, dan menyiapkan payload agar pertanyaan serupa bisa dipakai ulang. UI popup detail tombol khusus belum selesai dihubungkan penuh. | `lib/browser/ai-apply-wizard.ts`, `lib/ai/question-answerer.ts`, `app/applications/[id]/review/page.tsx` |
| Memori Pertanyaan                  | Partial | `QuestionMemory` lama tetap dipakai. Fondasi `FormInteractionMemory` sudah ditambahkan ke schema untuk menyimpan pola field/button hasil identifikasi AI pada form serupa, tetapi migrasi/generate Prisma dan penyimpanan runtime suksesnya belum selesai diverifikasi. | `app/api/questions/answer/route.ts`, `prisma/schema.prisma`, `lib/browser/ai-apply-wizard.ts` |
| Modal Captcha/Verifikasi           | Selesai | Guardrail tetap keras: captcha, OTP, login/password, security verification, permission dialog, dan elemen sensitif diblokir. AI tidak bisa override blok ini dan browser tetap visible. | `lib/browser/page-detector.ts`, `lib/security/safe-automation.ts`, `lib/browser/ui-action-executor.ts`, `lib/ai/ui-action-planner.ts` |
| Review Lamaran Sebelum Submit      | Partial | Review page lama masih ada. AI wizard sudah membedakan `final_submit` vs `continue`, dan akan mengembalikan `pending_review` untuk mode review/manual atau external final submit. Detail status AI di halaman kampanye baru mulai disiapkan dari status API, tetapi komponen UI belum selesai dipoles. | `app/applications/[id]/review/page.tsx`, `app/api/campaigns/[id]/status/route.ts`, `lib/browser/ai-apply-wizard.ts` |
| Submit Lamaran                     | Partial | Submit deterministic aman masih tersedia. AI wizard menambahkan loop observe → plan → validate → execute → verify dan hanya mengizinkan final submit saat confidence tinggi, required field aman, dan mode `auto_submit_safe_only`. External final submit tetap harus pause/review. Perlu verifikasi akhir lint/tsc dan uji manual Jobstreet. | `lib/browser/jobstreet-apply-agent.ts`, `lib/browser/ai-apply-wizard.ts`, `lib/browser/ui-action-executor.ts`, `app/api/applications/[id]/submit/route.ts` |
| Skip Lamaran                       | Selesai | Tombol "Lewati Lamaran" di halaman review mengubah status ke `skipped` dan mengembalikan job ke `shortlisted`. | `app/applications/[id]/review/page.tsx`, `app/api/applications/[id]/skip/route.ts` |
| Campaign Loop / Autopilot v2       | Partial | Autopilot v2 tetap menjadi orchestrator utama. Apply flow deterministic masih dicoba dulu, lalu fallback ke AI UI Agent saat tombol apply tidak ditemukan atau wizard stuck sebelum final review. Runtime state untuk paused/question/review/manual intervention dari AI mulai dipropagasikan ke campaign status API. Masih perlu verifikasi compile final, route status UI, dan test manual end-to-end. | `lib/campaign/autopilot-runner.ts`, `app/api/campaigns/[id]/autopilot/start/route.ts`, `app/api/campaigns/[id]/autopilot/continue/route.ts`, `app/api/campaigns/[id]/autopilot/decision/route.ts`, `app/api/campaigns/[id]/status/route.ts`, `components/campaign-actions.tsx`, `lib/browser/jobstreet-apply-agent.ts` |
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
| app/api/campaigns/[id]/status/route.ts | Selesai | GET status kampanye realtime-like untuk polling UI. Mengembalikan `campaign`, `counts`, `currentStep`, `currentJob`, `lastDecisionRequired`, `latestLogs`, `canContinue`, dan `nextRecommendedAction`. |
| app/api/campaigns/[id]/autopilot/start/route.ts | Selesai | Menjalankan satu langkah bounded Autopilot v2 dari awal flow kampanye. |
| app/api/campaigns/[id]/autopilot/continue/route.ts | Selesai | Melanjutkan satu langkah bounded berikutnya saat aman untuk lanjut. |
| app/api/campaigns/[id]/autopilot/decision/route.ts | Selesai | Menyimpan keputusan user untuk low score/decision state kampanye, termasuk opsi skip serupa untuk kampanye ini saja. |
| app/api/jobs/[id]/apply/calibrate/route.ts | Selesai (Perlu Verifikasi Manual) | POST kalibrasi dry run. Tetap tersedia untuk debugging manual, tetapi pada Autopilot v2 kalibrasi dijalankan internal bila diperlukan. |
| app/api/jobs/[id]/calibration/route.ts | Selesai | GET hasil kalibrasi terbaru untuk job listing. Mengembalikan data `ApplicationCalibration` terbaru dengan relasi job listing. |

## 10. Automation / Playwright Status

Jelaskan status browser automation:

* Browser visible mode: Sudah diterapkan. Headless mode ditolak.
* Session save/load: Path persistent session dipakai dan metadata session disimpan ke `BrowserSession`, tetapi load/validasi session masih dasar.
* Manual login: Masih mungkin diperlukan; bila intervensi terdeteksi sistem menulis log `application.manual_intervention_required` dan mengembalikan pesan Indonesia yang jelas. Deteksi login page ditambahkan ke page-detector.
* Login via ENV: Belum diimplementasikan.
* Jobstreet search: Sudah diimplementasikan. Agent membangun URL pencarian dari keyword dan lokasi, navigasi ke halaman hasil, dan mengumpulkan job card dari halaman pertama.
* Job card extraction: Sudah diimplementasikan dengan multiple selector strategies (data-automation attributes, semantic HTML, fallback generic detection).
* Job detail extraction: Sudah diimplementasikan. Membuka halaman detail setiap lowongan dan mengekstrak title, company, location, salary, workType, description.
* Save to DB: Sudah diimplementasikan dengan deduplication berdasarkan URL (`@unique`). Lowongan duplikat diupdate.
* AI job scoring: Sudah diimplementasikan. Setiap lowongan yang disimpan akan di-score oleh AI, dan status diubah menjadi shortlisted/skipped berdasarkan matchThreshold. Scoring error tidak menggagalkan campaign.
* Campaign relasi: `JobListing.campaignId` menghubungkan lowongan ke kampanye yang menemukannya.
* Safe limits: Maksimal 10-20 lowongan per run, tidak ada paginasi endless.
* Form filling: Sudah diimplementasikan dengan multiple selector strategies (name, placeholder, aria-label, data-automation). Mendukung 9 field utama termasuk nama, email, telepon, lokasi, gaji, masa kerja, ketersediaan, dan ringkasan.
* Question detection: Sudah diimplementasikan. Mendeteksi pertanyaan dari label, legend, heading dalam form context, dan data-automation attributes. Pertanyaan dijawab dari QuestionMemory atau AI.
* Question answering: Sudah diimplementasikan. Mengecek QuestionMemory terlebih dahulu (confidence >= 0.7), lalu memanggil AI. Jawaban dengan confidence >= 0.7 dan tidak requiresHumanReview disimpan ke memory.
* Pending questions: Pertanyaan dengan confidence rendah atau requiresHumanReview disimpan ke Application.answersJson sebagai pending questions. Status Application menjadi `paused`.
* Captcha/manual intervention pause: Sudah ada deteksi dan hasil `requiresManualIntervention(...)`. Deteksi login page ditambahkan. Pesan Indonesia yang jelas dikembalikan.
* Apply button detection: Sudah diimplementasikan dengan 4 strategy: text-based, data-automation, href matching, dan generic fallback.
* Missing apply button handling: Jika tombol lamar tidak ditemukan saat kalibrasi autopilot, job ditandai `apply_unavailable`, timeline menulis event skip sekali, dan autopilot lanjut ke lowongan berikutnya tanpa pause campaign.
* Submit button detection: Diperketat. Prioritas selector kini fokus ke area review/form final, label submit final yang diizinkan, dan menghindari tombol navigasi seperti `Continue`, `Next`, `Review`, `Back`, `Cancel`, atau `Save`. Ditambahkan helper `findFinalSubmitButton(page)` dengan confidence `high | medium | low`. Auto-submit hanya jalan bila confidence `high`.
* Final submit: Flow utama Autopilot kini memakai same-page submit dari wizard apply yang sama, bukan reopen URL lowongan. Jika kampanye memakai `automationMode = auto_submit_safe_only` atau `autoSubmitSafeOnly = true`, sistem akan klik final `Submit application` otomatis di page Playwright yang sama setelah safety gate lolos.
* Submit verification: Setelah klik submit, sistem menunggu perubahan DOM/network, mengambil screenshot setelah klik, lalu memverifikasi marker sukses seperti `Application submitted`, `Lamaran terkirim`, `Anda telah melamar`, atau `Thank you for applying`. Jika klik terjadi tetapi verifikasi gagal, status harus `paused`, bukan `submitted`, dan `Campaign.appliedCount` tidak boleh bertambah.
* Skip application: Sudah diimplementasikan. Mengubah status ke `skipped`, mengembalikan JobListing ke `shortlisted`.
* Campaign Loop / Autopilot v2: Diperluas untuk dua mode kampanye: `review_each_application` dan `auto_submit_safe_only`. Mode review tetap pause di `pending_review`. Mode Auto Submit Aman lanjut submit otomatis bila aman, lalu langsung lanjut ke lowongan berikutnya sampai target tercapai.
* Low score behavior: Sudah mendukung `ask`, `auto_skip`, dan `auto_apply`. Lowongan skor rendah tidak menyembunyikan aksi apply; perilaku ditentukan dari setting kampanye.
* Application record creation: Sudah diimplementasikan. Membuat `Application` dengan status `submitted`, `pending_review`, `paused`, `failed`, atau `apply_unavailable` sesuai hasil wizard.
* Screenshot on submit: Sudah diimplementasikan. Screenshot sebelum submit wajib disimpan untuk Auto Submit Aman, diikuti screenshot setelah klik submit, setelah sukses, dan saat error/intervensi. File ditautkan ke `Application.screenshotPath`.
* Apply calibration dry run: Sudah diimplementasikan. `calibrateJobApply()` di `lib/browser/jobstreet-apply-calibrator.ts` membuka browser visible, mendeteksi intervensi manual, menemukan dan mengklik tombol apply, mengklasifikasi flow type (jobstreet_internal/external_redirect/email_apply/whatsapp_apply/unknown) dan platform (jobstreet/google_form/greenhouse/lever/workday/company_site/unknown), mengambil snapshot form (inputs/textareas/selects/questions/buttons/submit candidates), menyimpan hasil ke `ApplicationCalibration`. Tidak melakukan submit. Browser tetap terbuka untuk review user.
* Apply button detection (calibration): Sudah diimplementasikan dengan 6 strategy: getByRole button text, getByRole link text, CSS text-based, href pattern, data-automation attributes, dan generic scan fallback.
* Resume after intervention: Belum ada flow resume automation yang nyata.

## 11. AI Integration Status

Jelaskan status integrasi 9router:

* Chat completions: Sudah ada melalui OpenAI-compatible client dengan base URL resmi `/v1` dari helper bersama.
* CV analysis: Sudah ada dan terhubung ke API route.
* Job scoring: Sudah terintegrasi ke flow campaign utama. Setiap lowongan yang disimpan akan di-score, dan status diubah menjadi shortlisted/skipped berdasarkan matchThreshold.
* Job scoring reasoning bahasa Indonesia: Diperketat. Prompt sekarang mewajibkan JSON-only dan semua reasoning user-facing dalam Bahasa Indonesia. Ada fallback sanitasi ringan bila model masih mengembalikan frasa Inggris.
* Question answering: Sudah ada, menyimpan memory, dan kini ikut memakai helper config 9router melalui client bersama. Terintegrasi ke assisted apply flow.
* Question answering reasoning bahasa Indonesia: Diperketat. Reasoning dan evidence user-facing dipaksa Bahasa Indonesia dengan prompt dan fallback sanitasi.
* Structured JSON output: Sudah ada parsing JSON + schema validation.
* Config helper 9router: Sudah ada di `lib/ai/9router-config.ts` dan mengembalikan `rootUrl`, `apiBaseUrl`, `apiKey`, `chatModel`, `embeddingModel`, `isConfigured`, dan `missingFields`.
* Health check: Sudah ada di `app/api/settings/9router/health/route.ts` dan memakai `${rootUrl}/api/health`.
* Model discovery: Sudah ada di `app/api/settings/9router/models/route.ts` dan memakai `${apiBaseUrl}/models` serta `${apiBaseUrl}/models/embedding`.
* Error handling: Sudah ada pesan Indonesia yang jelas untuk konfigurasi belum lengkap dan model chat belum dipilih.
* Retry handling: Belum ada.

## 12. Human-in-the-loop Status

Jelaskan fitur yang melibatkan keputusan user:

* Modal pertanyaan tambahan: Deteksi pertanyaan form terimplementasi. Pertanyaan dijawab dari CV, default kampanye, `QuestionMemory`, atau AI. Pertanyaan pending disimpan ke `Application.answersJson`. Status `paused` untuk pertanyaan yang memerlukan input user. Autopilot tidak boleh auto-submit selama masih ada pending question.
* Modal captcha/verifikasi: Deteksi login page, captcha, OTP, dan security check terimplementasi. Flow berhenti dan membuat `Application` status `paused` saat intervensi terdeteksi. Screenshot disimpan.
* Modal review lamaran: Halaman `/applications/[id]/review` menampilkan detail lengkap. Untuk lamaran auto-submitted, halaman menampilkan status `submitted`, screenshot setelah submit, dan catatan bahwa lamaran dikirim otomatis oleh mode Auto Submit Aman.
* Approve and submit: Route manual `POST /api/applications/[id]/submit` tetap dipertahankan sebagai fallback. Flow ini masih membuka ulang halaman lowongan dan dipakai untuk submit manual user, tetapi bukan path utama Autopilot.
* Edit answer: Tombol "Edit Jawaban" ada di halaman review tetapi dinonaktifkan (belum diimplementasikan).
* Skip job: Tombol "Lewati Lamaran" aktif di halaman review. Mengubah status ke `skipped` dan mengembalikan JobListing ke `shortlisted`.
* Pause campaign: API ada dan menulis log nyata. Terintegrasi dengan panel Autopilot v2.
* Resume campaign: Flow utama sekarang lewat `autopilot/continue` yang bounded per request dan aman untuk dipoll/di-trigger ulang dari UI.
* Campaign loop lama: Digantikan oleh Campaign Autopilot v2 sebagai flow utama user-facing.
* Decision memory per campaign: Sudah ada. Jika user memilih `Selalu Lewati Kasus Serupa di Kampanye Ini`, sistem menyimpan `CampaignDecisionRule` dan hanya berlaku untuk kampanye aktif tersebut.

## 13. Log Aktivitas

Status log:

* Log disimpan ke database: Ya.
* Log tampil di UI: Ya, dashboard dan halaman `/logs` membaca data DB nyata.
* Log per campaign: Didukung oleh relasi dan field `campaignId`.
* Log per job: Didukung oleh relasi dan field `jobListingId`.
* Log error: Ya, start/pause/resume/stop dan worker stub menulis log nyata.
* Log Jobstreet search: Lengkap dengan event `jobstreet.search_started`, `jobstreet.search_page_loaded`, `jobstreet.search_manual_intervention`, `jobstreet.job_card_found`, `jobstreet.job_detail_opened`, `jobstreet.job_saved`, `jobstreet.job_skipped_duplicate`, `jobstreet.job_scoring_started`, `jobstreet.job_scored`, `jobstreet.job_shortlisted`, `jobstreet.job_skipped_score`, `jobstreet.job_scoring_failed`, `jobstreet.search_completed`, `jobstreet.search_failed`.
* Log assisted apply: Lengkap dengan event `application.started`, `application.job_opened`, `application.searching_apply_button`, `application.apply_button_clicked`, `application.apply_button_not_found`, `application.form_detected`, `application.field_filled`, `application.question_detected`, `application.question_answered`, `application.question_needs_user_input`, `application.manual_intervention_required`, `application.review_required`, `application.failed`, dan event timeline baru seperti `application.final_submit_detected`, `application.auto_submit_safe_started`, `application.submit_clicked`, `application.submit_post_click_diagnostics`, `application.submit_unverified`.
* Log submit: Lengkap dengan event `application.submit_requested`, `application.before_submit_review`, `application.submitted`, `application.submit_failed`, `application.submit_manual_intervention`. Untuk Auto Submit Aman, event timeline user-facing yang diharapkan adalah `Final submit terdeteksi`, `Auto submit aman dijalankan`, `Submit diklik`, `Submit berhasil diverifikasi`, atau `Submit belum dapat diverifikasi`.
* Log campaign loop: Lengkap dengan event `campaign.loop_started`, `campaign.loop_next_job`, `campaign.loop_paused`, `campaign.loop_completed`, `campaign.target_reached`, `campaign.applied_count_incremented`, plus kelanjutan Autopilot sesudah submit terverifikasi.
* Log skip: Event `application.skipped`.
* Log calibration: Lengkap dengan event `application.calibration_started`, `application.calibration_job_opened`, `application.calibration_apply_button_found`, `application.calibration_apply_button_clicked`, `application.calibration_apply_button_not_found`, `application.calibration_flow_classified`, `application.calibration_form_snapshot_saved`, `application.calibration_external_redirect`, `application.calibration_manual_intervention`, `application.calibration_failed`.
* Screenshot path tersimpan: Screenshot sebelum submit, setelah submit, dan saat error/intervensi disimpan ke `storage/screenshots` dan ditautkan ke `Application.screenshotPath`. Screenshot kalibrasi juga disimpan dan ditautkan ke `ApplicationCalibration.screenshotPath`.

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

Tanggal: 2026-06-02 (update dokumentasi sebelum verifikasi final)
Command yang dijalankan:

```bash
npm run lint
npx tsc --noEmit
npx prisma generate
```

Hasil:

* [ ] Menunggu verifikasi final command pada task ini.
* [x] Status `apply_unavailable` ditambahkan untuk lowongan yang tidak memiliki tombol lamar.
* [x] `pickNextJob()` tidak lagi memasukkan job `failed` atau `apply_unavailable` ke seleksi normal autopilot.
* [x] Autopilot memakai bounded skip loop dengan batas 5 lowongan unusable per run.
* [x] Jika kalibrasi gagal karena tombol lamar tidak ditemukan, job ditandai `apply_unavailable` dan autopilot lanjut ke lowongan berikutnya.
* [x] Timeline menambahkan event `campaign.autopilot_job_apply_unavailable` dengan pesan Bahasa Indonesia.
* [x] Halaman `/jobs` menambahkan aksi manual `Coba Lagi`, `Buka Jobstreet`, dan `Lewati` untuk job `apply_unavailable` atau `failed`.
* [ ] Belum diverifikasi manual terhadap Jobstreet nyata pada task ini.

Catatan:
* Lowongan dengan status `apply_unavailable` tidak di-retry otomatis oleh autopilot.
* Retry hanya terjadi jika user menekan `Coba Lagi` dari halaman `/jobs`.
* Jika 5 lowongan berturut-turut tidak bisa dilamar, kampanye dijeda dengan langkah `too_many_unusable_jobs`.
* Tidak ada bypass captcha, stealth automation, atau proxy rotation.

## 15. Error / Bug Saat Ini

| Tanggal | Error | Penyebab Dugaan | Status | File Terkait |
| ------- | ----- | --------------- | ------ | ------------ |
| 2026-06-02 | `sourceType` does not exist in Prisma type for `CandidateProfileCreateInput` and `UploadedCVUpdateInput` | Schema Prisma belum memiliki field source tracking | Resolved | `prisma/schema.prisma`, `app/api/cv/analyze/route.ts` |
| 2026-06-02 | Resume campaign belum melanjutkan browser automation yang sebelumnya terhenti | Route resume masih hanya mengubah status dan menulis log | Open | `app/api/campaigns/[id]/resume/route.ts` |
| 2026-06-02 | Campaign Autopilot sempat memilih ulang job `failed` dan mengulang log `Tombol lamar tidak ditemukan` | `pickNextJob()` memasukkan status `failed` dan kegagalan tombol lamar diperlakukan sebagai blocker kampanye | Resolved | `lib/campaign/autopilot-runner.ts`, `components/campaign-actions.tsx`, `app/api/campaigns/[id]/status/route.ts`, `app/jobs/page.tsx` |
| 2026-06-02 | Screenshot submit sudah ditautkan ke record aplikasi | Screenshot sebelum/submit/error disimpan dan ditautkan ke `Application.screenshotPath` | Resolved | `lib/browser/jobstreet-apply-agent.ts` |
| 2026-06-02 | Menjalankan `npm run dev` kedua menghasilkan error server duplikat | Sudah ada dev server aktif di port `3000` | Resolved/Informational | `package.json` |
| 2026-06-02 | Health check dan model discovery 9router belum diverifikasi end-to-end ke server eksternal pada task ini | Perubahan fokus pada wiring, route, dan UI; belum ada uji manual terhadap instance 9router target | Open | `app/api/settings/9router/health/route.ts`, `app/api/settings/9router/models/route.ts` |
| 2026-06-02 | Selector Jobstreet bisa rusak jika UI berubah | Jobstreet UI dapat berubah sewaktu-waktu | Open/Risk | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Browser tidak ditutup saat manual intervention terdeteksi | Browser tetap terbuka untuk memungkinkan user menyelesaikan login/captcha/OTP, tetapi session tidak dapat dilanjutkan otomatis setelah intervensi selesai | Open/Limitation | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Assisted apply belum menangani form multi-step/accordion | Jobstreet form lamaran mungkin memerlukan navigasi multi-step yang belum diimplementasikan | Open/Limitation | `lib/browser/jobstreet-apply-agent.ts` |
| 2026-06-02 | Edit jawaban belum berfungsi dari UI | Tombol "Edit Jawaban" ada tetapi dinonaktifkan | Open | `app/applications/[id]/review/page.tsx` |
| 2026-06-02 | Submit flow belum diverifikasi end-to-end terhadap Jobstreet nyata | Memerlukan testing manual dengan browser visible | Open | `lib/browser/jobstreet-apply-agent.ts`, `app/api/applications/[id]/submit/route.ts` |
| 2026-06-02 | Campaign loop belum diverifikasi end-to-end | Memerlukan testing manual dengan browser visible | Open | `lib/campaign/loop-runner.ts`, `app/api/campaigns/[id]/loop/route.ts` |
| 2026-06-02 | Apply calibration belum diverifikasi end-to-end | Memerlukan testing manual dengan browser visible terhadap Jobstreet nyata | Open | `lib/browser/jobstreet-apply-calibrator.ts`, `app/api/jobs/[id]/apply/calibrate/route.ts` |
| 2026-06-02 | External redirect flow belum diverifikasi | Flow external redirect hanya menyimpan metadata, perlu mode pengisian eksternal | Open/Limitation | `lib/browser/jobstreet-apply-calibrator.ts` |

## 16. Risiko / Batasan

Tuliskan batasan saat ini:

* Tidak melakukan captcha bypass.
* Tidak melakukan stealth automation.
* Tidak melakukan scraping besar-besaran.
* Maksimal 10-20 lowongan diperiksa per run.
* Hanya halaman pertama hasil pencarian yang diambil (tidak ada paginasi).
* Jobstreet UI dapat berubah sewaktu-waktu sehingga selector Playwright bisa rusak.
* Submit final harus melalui approval user.
* App hanya untuk penggunaan pribadi/lokal.
* Selector extraction menggunakan multiple strategies untuk ketahanan, tetapi perubahan besar pada UI Jobstreet mungkin memerlukan update manual.
* Form filling menggunakan defensive selector strategy, tetapi form yang sangat berbeda dari ekspektasi mungkin tidak terisi penuh.
* Question detection bergantung pada label/legend/heading yang terlihat, mungkin tidak menangkap semua pertanyaan.
* AI question answering memerlukan konfigurasi 9router yang valid.
* Form multi-step/accordion belum ditangani.

## 17. Yang Belum Dikerjakan

Checklist fitur yang belum selesai:

* [ ] Implementasi login Jobstreet otomatis atau semi-otomatis yang benar-benar memakai credential/session secara aman.
* [x] Final submit lamaran setelah approval user. (Implemented, needs manual verification against live Jobstreet)
* [x] Tautkan screenshot error/intervensi ke record aplikasi yang relevan. (Screenshots now saved and linked)
* [x] Apply calibration dry run. (Implemented, needs manual verification against live Jobstreet)
* [ ] Verifikasi end-to-end submit, campaign loop, dan calibration terhadap Jobstreet nyata.
* [ ] Mode pengisian eksternal untuk flow external redirect.
* [ ] Resume automation setelah intervensi manual (bukan hanya status-level, tetapi melanjutkan browser session yang sama).
* [ ] Pagination hasil pencarian Jobstreet untuk kampanye besar.
* [ ] UI real-time untuk menampilkan status manual intervention dan tombol "Lanjutkan Kampanye" setelah user menyelesaikan intervensi.
* [ ] Edit jawaban dari halaman review.
* [x] Skip lamaran dari halaman review. (Implemented)
* [ ] Form multi-step/accordion handling.

## 18. Prioritas Berikutnya

Tuliskan 3–5 langkah paling masuk akal berikutnya.

1. Verifikasi manual end-to-end: paksa satu job tanpa tombol lamar, jalankan Autopilot, lalu pastikan status menjadi `apply_unavailable`, kampanye tidak pause, dan lowongan berikutnya diproses.
2. Verifikasi manual end-to-end: jalankan apply calibration pada shortlisted job normal, pastikan flow type dan platform terdeteksi dengan benar, form fields tersnapshot, dan browser tidak melakukan submit.
3. Verifikasi manual end-to-end: submit lamaran dengan browser visible terhadap Jobstreet nyata, pastikan captcha/login detection berfungsi.
4. Implementasikan mode pengisian eksternal untuk flow external redirect (google_form, greenhouse, lever, workday, company_site).
5. Implementasikan edit jawaban dari halaman review.

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
