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
Project sekarang sudah bisa dijalankan sebagai fondasi MVP lokal yang jujur: upload CV, analisis CV, create campaign, dan start campaign yang membuka browser visible lalu melakukan pencarian lowongan Jobstreet secara nyata. Pencarian lowongan, ekstraksi detail, penyimpanan ke `JobListing`, AI scoring, dan assisted apply flow (hingga review) sudah diimplementasikan. Final submit sengaja belum diaktifkan.

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
| Assisted Form Filling              | Selesai | Filler field yang jelas sudah diimplementasikan dengan multiple selector strategies (name, placeholder, aria-label, data-automation). Mendukung nama, email, telepon, lokasi, gaji saat ini, gaji harapan, masa kerja, ketersediaan, dan ringkasan/surat lamaran. | `lib/browser/form-filler.ts`, `lib/browser/jobstreet-apply-agent.ts` |
| Modal Pertanyaan Tambahan          | Selesai | Deteksi pertanyaan form terimplementasi (label, legend, heading, data-automation). Pertanyaan dijawab dari QuestionMemory atau AI. Pertanyaan dengan confidence rendah atau requiresHumanReview disimpan sebagai pending. | `lib/browser/form-filler.ts`, `lib/browser/jobstreet-apply-agent.ts`, `lib/ai/question-answerer.ts` |
| Memori Pertanyaan                  | Selesai | API answer menyimpan/meningkatkan `QuestionMemory`. Pertanyaan yang dijawab AI dengan confidence tinggi juga disimpan ke memory. | `app/api/questions/answer/route.ts`, `prisma/schema.prisma` |
| Modal Captcha/Verifikasi           | Selesai | Deteksi login page, captcha, OTP, dan security check terimplementasi di page-detector. Flow assisted apply berhenti dan membuat Application status `paused` saat intervensi terdeteksi. | `lib/browser/page-detector.ts`, `lib/security/safe-automation.ts`, `lib/browser/jobstreet-apply-agent.ts` |
| Review Lamaran Sebelum Submit      | Selesai | Halaman `/applications/[id]/review` menampilkan detail lengkap: info lowongan, skor AI, field yang diisi, pertanyaan dijawab, pertanyaan pending, dan catatan. Tombol "Setujui dan Kirim" dinonaktifkan dengan catatan. | `app/applications/[id]/review/page.tsx`, `app/api/applications/[id]/route.ts` |
| Submit Lamaran                     | Belum | Stub sengaja berhenti sebelum final submit. Tombol submit dideteksi tetapi tidak diklik. | `lib/browser/jobstreet-apply-agent.ts` |
| Log Aktivitas                      | Selesai | Dashboard dan halaman `/logs` kini membaca `AutomationLog` nyata dari database. Log search Jobstreet dan assisted apply lengkap dengan semua event. | `lib/logging/automation-log.ts`, `prisma/schema.prisma`, `app/logs/page.tsx`, `app/dashboard/page.tsx` |
| Pause/Resume/Stop Campaign         | Partial | API route status update dan log nyata sudah ada, tetapi resume belum melanjutkan automation session sesungguhnya. | `app/api/campaigns/[id]/pause/route.ts`, `app/api/campaigns/[id]/resume/route.ts`, `app/api/campaigns/[id]/stop/route.ts` |
| Screenshot Saat Error              | Partial | Screenshot error kini dicoba disimpan ke `storage/screenshots`, tetapi belum ada penyimpanan ke field `Application.screenshotPath`. | `prisma/schema.prisma`, `lib/browser/jobstreet-agent.ts` |
| README Setup                       | Selesai | README sudah menjelaskan instalasi, ENV, Prisma, Playwright, route, dan batasan. | `README.md` |

## 5. Struktur Folder Saat Ini

Struktur penting saat ini:

```txt
app/
  api/
    applications/
      [id]/
    browser/session/
    campaigns/
    cv/
    jobs/
      [id]/
        apply/
          start/
    questions/
  applications/
    [id]/
      review/
  campaigns/
  cv/
  dashboard/
  jobs/
  logs/
  profile/
  question-memory/
  settings/
components/
  modals/
lib/
  ai/
  api/
  browser/
    jobstreet-apply-agent.ts  (NEW)
    form-filler.ts  (UPDATED)
    page-detector.ts  (UPDATED)
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
```

## 6. Database / Prisma Status

### Model yang Sudah Ada

* [x] CandidateProfile
* [x] UploadedCV (updated: `sourceType`, `manualTextUsed`)
* [x] Campaign (updated: `jobListings` relation)
* [x] JobListing (updated: `campaignId`, `snippet`, `campaign` relation)
* [x] Application
* [x] QuestionMemory
* [x] AutomationLog
* [x] BrowserSession
* [x] UserSetting

### Migrasi

Status migrasi:

```bash
npx prisma migrate dev
```

Catatan:
Migration `add_job_listing_campaign_tracking` berhasil dijalankan. Perubahan schema:
* `JobListing` mendapat field opsional `campaignId String?` dan `snippet String?`
* `JobListing` mendapat relasi `campaign Campaign?`
* `Campaign` mendapat relasi `jobListings JobListing[]`
* `JobListing.url` tetap mempertahankan `@unique` constraint untuk deduplication

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
| /campaigns/[id]  | Selesai | Detail kampanye menampilkan ringkasan lengkap, jumlah lowongan ditemukan, status pencarian terbaru, riwayat lamaran, dan log aktivitas. Kontrol aksi (Mulai/Jeda/Lanjutkan/Hentikan) berfungsi. |
| /jobs            | Selesai | Membaca `JobListing` nyata dari Prisma. Menampilkan title, company, location, salary, workType, match score, match reason, status, filter shortlist/dilewati/belum dinilai, tombol buka URL Jobstreet, dan tombol "Bantu Lamar" untuk shortlisted jobs. Tombol non-shortlist menampilkan pesan bantuan. Empty state Bahasa Indonesia. |
| /applications    | Selesai | Membaca `Application` nyata dari Prisma. Menampilkan campaign, job listing, status, notes, match score, tombol "Review" dan "Buka Jobstreet". Empty state Bahasa Indonesia. |
| /applications/[id]/review | Selesai | Halaman review lamaran menampilkan info lowongan, skor AI, kampanye, field yang diisi, pertanyaan dijawab (dengan confidence dan sumber), pertanyaan pending, catatan, dan aksi (Edit Jawaban/Lewati/Setujui dan Kirim/Buka Jobstreet). Tombol aksi dinonaktifkan dengan catatan "Submit final akan diaktifkan pada tahap berikutnya." |
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
| app/api/jobs/[id]/apply/start/route.ts | Selesai | Memulai assisted apply untuk shortlisted job. Validasi profil, campaign, status shortlist. Meluncurkan browser, membuka halaman lowongan, mendeteksi intervensi manual, mengklik tombol apply, mengisi field, mendeteksi pertanyaan, membuat Application record. |
| app/api/applications/[id]/route.ts     | Selesai | GET single application dengan relasi campaign dan jobListing untuk halaman review. |

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
* Submit button detection: Sudah diimplementasikan. Mendeteksi tombol submit tetapi TIDAK mengklik (safety boundary).
* Application record creation: Sudah diimplementasikan. Membuat Application dengan status `pending_review`, `paused`, atau `failed` tergantung hasil flow.
* Screenshot on error: Ada percobaan capture ke `storage/screenshots` saat error.
* Resume after intervention: Belum ada flow resume automation yang nyata.

## 11. AI Integration Status

Jelaskan status integrasi 9router:

* Chat completions: Sudah ada melalui OpenAI-compatible client dengan base URL resmi `/v1` dari helper bersama.
* CV analysis: Sudah ada dan terhubung ke API route.
* Job scoring: Sudah terintegrasi ke flow campaign utama. Setiap lowongan yang disimpan akan di-score, dan status diubah menjadi shortlisted/skipped berdasarkan matchThreshold.
* Question answering: Sudah ada, menyimpan memory, dan kini ikut memakai helper config 9router melalui client bersama. Terintegrasi ke assisted apply flow.
* Structured JSON output: Sudah ada parsing JSON + schema validation.
* Config helper 9router: Sudah ada di `lib/ai/9router-config.ts` dan mengembalikan `rootUrl`, `apiBaseUrl`, `apiKey`, `chatModel`, `embeddingModel`, `isConfigured`, dan `missingFields`.
* Health check: Sudah ada di `app/api/settings/9router/health/route.ts` dan memakai `${rootUrl}/api/health`.
* Model discovery: Sudah ada di `app/api/settings/9router/models/route.ts` dan memakai `${apiBaseUrl}/models` serta `${apiBaseUrl}/models/embedding`.
* Error handling: Sudah ada pesan Indonesia yang jelas untuk konfigurasi belum lengkap dan model chat belum dipilih.
* Retry handling: Belum ada.

## 12. Human-in-the-loop Status

Jelaskan fitur yang melibatkan keputusan user:

* Modal pertanyaan tambahan: Deteksi pertanyaan form terimplementasi. Pertanyaan dijawab dari memory atau AI. Pertanyaan pending disimpan ke Application.answersJson. Status `paused` untuk pertanyaan yang memerlukan input user.
* Modal captcha/verifikasi: Deteksi login page, captcha, OTP, dan security check terimplementasi. Flow berhenti dan membuat Application status `paused` saat intervensi terdeteksi.
* Modal review lamaran: Halaman `/applications/[id]/review` menampilkan detail lengkap. Tombol aksi dinonaktifkan dengan catatan.
* Approve and submit: Belum ada flow final submit nyata. Tombol "Setujui dan Kirim" dinonaktifkan.
* Edit answer: Tombol "Edit Jawaban" ada di halaman review tetapi dinonaktifkan.
* Skip job: Tombol "Lewati Lamaran" ada di halaman review tetapi dinonaktifkan.
* Pause campaign: API ada dan menulis log nyata.
* Resume campaign: API ada dan menulis log nyata, tetapi baru status-level.

## 13. Log Aktivitas

Status log:

* Log disimpan ke database: Ya.
* Log tampil di UI: Ya, dashboard dan halaman `/logs` membaca data DB nyata.
* Log per campaign: Didukung oleh relasi dan field `campaignId`.
* Log per job: Didukung oleh relasi dan field `jobListingId`.
* Log error: Ya, start/pause/resume/stop dan worker stub menulis log nyata.
* Log Jobstreet search: Lengkap dengan event `jobstreet.search_started`, `jobstreet.search_page_loaded`, `jobstreet.search_manual_intervention`, `jobstreet.job_card_found`, `jobstreet.job_detail_opened`, `jobstreet.job_saved`, `jobstreet.job_skipped_duplicate`, `jobstreet.job_scoring_started`, `jobstreet.job_scored`, `jobstreet.job_shortlisted`, `jobstreet.job_skipped_score`, `jobstreet.job_scoring_failed`, `jobstreet.search_completed`, `jobstreet.search_failed`.
* Log assisted apply: Lengkap dengan event `application.started`, `application.job_opened`, `application.searching_apply_button`, `application.apply_button_clicked`, `application.apply_button_not_found`, `application.form_detected`, `application.field_filled`, `application.question_detected`, `application.question_answered`, `application.question_needs_user_input`, `application.manual_intervention_required`, `application.review_required`, `application.failed`.
* Screenshot path tersimpan: Capture file error dicoba ke `storage/screenshots`, tetapi belum ditautkan ke model `Application`.

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
```

## 14. Testing Manual

Tuliskan hasil testing manual terakhir:

Tanggal: 2026-06-02 (04:42 WIB)
Command yang dijalankan:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name add_job_listing_campaign_tracking
npx playwright install chromium
npm run lint
npx tsc --noEmit
```

Hasil:

* [x] App opens
* [x] Upload CV works
* [x] Analyze CV works (manual text and file extraction)
* [x] Profile saved with source tracking
* [x] Campaign created
* [x] Campaign listed
* [x] Logs shown
* [x] Start campaign opens browser
* [x] Jobstreet search navigates to search results page
* [x] Job cards extracted from search results
* [x] Job detail pages opened and data extracted
* [x] Job listings saved to Prisma with deduplication
* [x] `/jobs` displays real JobListing data from Prisma
* [x] `/campaigns/[id]` shows job count and search status
* [x] Logs written for all Jobstreet search events
* [x] Manual intervention detection works (captcha/OTP/security check)
* [x] Manual intervention message updated to guide user to continue campaign after resolving in browser
* [x] Re-running same campaign does not create duplicate jobs (URL deduplication)
* [x] AI job scoring integrated into campaign runner
* [x] Jobs scored and status updated to shortlisted/skipped based on matchThreshold
* [x] Scoring errors do not fail the campaign
* [x] `/jobs` page shows real data with filters (Semua/Shortlist/Dilewati/Belum dinilai)
* [x] `/jobs` page shows match score and match reason
* [x] `/jobs` page shows "Bantu Lamar" button for shortlisted jobs
* [x] `/jobs` page shows disabled help text for non-shortlisted jobs
* [x] `/applications` page shows real Application data from Prisma
* [x] `/applications` page shows "Review" button and match score
* [x] `/applications/[id]/review` shows full review page with job info, fields filled, questions answered, pending questions
* [x] `/applications/[id]/review` shows disabled action buttons with notes
* [x] `/question-memory` page shows real QuestionMemory data from Prisma
* [x] Dashboard status updated to "Pencarian Jobstreet: Aktif"
* [x] README limitations updated to reflect current state
* [x] Campaign new page message updated to reflect active search and scoring
* [x] `npx tsc --noEmit` passes (no TypeScript errors)
* [x] `npm run lint` passes (no ESLint errors)
* [x] `npx prisma generate` passes
* [x] `/profile` UI improved: no raw JSON visible by default
* [x] Skills render as badges with proper labels
* [x] Experience/education/projects render as structured cards
* [x] Field keys humanized (camelCase/snake_case → readable Bahasa Indonesia labels)
* [x] Raw CV text hidden in collapsible `<details>` section
* [x] Empty states use Bahasa Indonesia messages
* [x] Helper functions created: `parseProfileJson`, `humanizeKey`, `renderFlexibleObject`

Catatan:
* `npm install` tidak dijalankan ulang karena `node_modules` sudah tersedia.
* `npm run dev` tidak dijalankan ulang karena dev server sudah aktif; verifikasi dilakukan melalui server yang berjalan.
* `npx tsc --noEmit` lulus, mengonfirmasi tidak ada error TypeScript.
* `npm run lint` lulus, mengonfirmasi tidak ada error ESLint.
* Migrasi `add_job_listing_campaign_tracking` berhasil dijalankan.
* Selector Jobstreet menggunakan multiple strategies (data-automation attributes, semantic HTML, fallback generic) untuk ketahanan terhadap perubahan UI.
* Assisted apply flow menggunakan defensive selector strategy untuk form filling dan apply button detection.
* Page detector mendeteksi login page, captcha, OTP, dan security check.
* Application record dibuat dengan status yang sesuai (pending_review/paused/failed).
* Final submit tidak dilakukan; tombol submit dideteksi tetapi tidak diklik.

## 15. Error / Bug Saat Ini

| Tanggal | Error | Penyebab Dugaan | Status | File Terkait |
| ------- | ----- | --------------- | ------ | ------------ |
| 2026-06-02 | `sourceType` does not exist in Prisma type for `CandidateProfileCreateInput` and `UploadedCVUpdateInput` | Schema Prisma belum memiliki field source tracking | Resolved | `prisma/schema.prisma`, `app/api/cv/analyze/route.ts` |
| 2026-06-02 | Resume campaign belum melanjutkan browser automation yang sebelumnya terhenti | Route resume masih hanya mengubah status dan menulis log | Open | `app/api/campaigns/[id]/resume/route.ts` |
| 2026-06-02 | Screenshot error belum ditautkan ke record aplikasi | Capture file dicoba, tetapi belum disimpan ke `Application.screenshotPath` | Open | `prisma/schema.prisma`, `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Menjalankan `npm run dev` kedua menghasilkan error server duplikat | Sudah ada dev server aktif di port `3000` | Resolved/Informational | `package.json` |
| 2026-06-02 | Health check dan model discovery 9router belum diverifikasi end-to-end ke server eksternal pada task ini | Perubahan fokus pada wiring, route, dan UI; belum ada uji manual terhadap instance 9router target | Open | `app/api/settings/9router/health/route.ts`, `app/api/settings/9router/models/route.ts` |
| 2026-06-02 | Selector Jobstreet bisa rusak jika UI berubah | Jobstreet UI dapat berubah sewaktu-waktu | Open/Risk | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Browser tidak ditutup saat manual intervention terdeteksi | Browser tetap terbuka untuk memungkinkan user menyelesaikan login/captcha/OTP, tetapi session tidak dapat dilanjutkan otomatis setelah intervensi selesai | Open/Limitation | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Assisted apply belum menangani form multi-step/accordion | Jobstreet form lamaran mungkin memerlukan navigasi multi-step yang belum diimplementasikan | Open/Limitation | `lib/browser/jobstreet-apply-agent.ts` |
| 2026-06-02 | Edit jawaban dan skip lamaran belum berfungsi dari UI | Tombol ada tetapi dinonaktifkan | Open | `app/applications/[id]/review/page.tsx` |

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
* [ ] Final submit lamaran setelah approval user.
* [ ] Tautkan screenshot error/intervensi ke record aplikasi yang relevan dan perluas verifikasi manual end-to-end.
* [ ] Resume automation setelah intervensi manual (bukan hanya status-level, tetapi melanjutkan browser session yang sama).
* [ ] Pagination hasil pencarian Jobstreet untuk kampanye besar.
* [ ] UI real-time untuk menampilkan status manual intervention dan tombol "Lanjutkan Kampanye" setelah user menyelesaikan intervensi.
* [ ] Edit jawaban dari halaman review.
* [ ] Skip lamaran dari halaman review.
* [ ] Form multi-step/accordion handling.
* [ ] Screenshot capture saat assisted apply (saat ini hanya saat error campaign).

## 18. Prioritas Berikutnya

Tuliskan 3–5 langkah paling masuk akal berikutnya.

1. Implementasikan final submit dengan approval user (klik tombol submit di Jobstreet setelah user menyetujui).
2. Implementasikan edit jawaban dan skip lamaran dari halaman review.
3. Implementasikan form multi-step/accordion handling untuk form lamaran yang kompleks.
4. Implementasikan flow resume automation setelah intervensi manual (melanjutkan browser session yang sama, bukan hanya status-level).
5. Tambahkan pagination atau halaman berikutnya untuk pencarian lowongan agar kampanye besar bisa menemukan lebih banyak lowongan.

## 19. Prompt Lanjutan yang Direkomendasikan

Tuliskan prompt pendek untuk task berikutnya.

```txt
Continue from IMPLEMENTATION_STATUS.md. Focus on implementing final submit and review actions:
1. Implement final submit with user approval (click submit button on Jobstreet after user approves).
2. Implement edit answer and skip application from review page.
3. Add form multi-step/accordion handling for complex application forms.
4. Keep UI in Bahasa Indonesia.
5. Do not implement resume automation after manual intervention yet.
6. Update IMPLEMENTATION_STATUS.md after finishing.
7. Follow the mandatory GitHub workflow.
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
* `/profile` UI sudah dipoles: tidak ada raw JSON yang ditampilkan ke user normal, skills sebagai badges, experience/education/projects sebagai cards dengan field yang di-humanize, raw CV text tersembunyi dalam collapsible section.
* Helper functions untuk profile: `parseProfileJson` (safe JSON parser), `humanizeKey` (convert camelCase/snake_case ke readable label), `renderFlexibleObject` (render object sebagai description list dengan formatting yang baik).
* Assisted apply flow ada di `lib/browser/jobstreet-apply-agent.ts` dengan fungsi `startJobApplication()`.
* Form filler ada di `lib/browser/form-filler.ts` dengan fungsi `fillKnownApplicationFields()`, `detectFormQuestions()`, dan `detectSubmitButton()`.
* Page detector ada di `lib/browser/page-detector.ts` dengan fungsi `detectManualIntervention()` yang mendeteksi login, captcha, OTP, security check, dan uncertain page.
* API route untuk start apply ada di `app/api/jobs/[id]/apply/start/route.ts`.
* API route untuk single application ada di `app/api/applications/[id]/route.ts`.
* Halaman review lamaran ada di `app/applications/[id]/review/page.tsx`.
* Next.js 16 menggunakan `Promise<{ id: string }>` untuk params di API routes.
* Final submit TIDAK diimplementasikan. Tombol submit dideteksi tetapi tidak diklik. Ini adalah safety boundary.
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
