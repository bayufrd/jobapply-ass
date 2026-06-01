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
* [ ] MVP siap testing manual
* [ ] MVP selesai

Catatan singkat:
Project sudah memiliki struktur Next.js, Prisma SQLite, route UI utama, beberapa API route, integrasi 9router, dan stub Playwright. Upload CV, ekstraksi teks, analisis CV, pembuatan campaign, penyimpanan session metadata, dan logging database sudah ada di kode. Namun banyak area masih berupa placeholder UI atau stub otomatisasi yang berhenti di batas review manual. Automation Jobstreet belum benar-benar menyelesaikan flow search lowongan, ekstraksi detail, dan submit lamaran end-to-end.

## 4. Progress Fitur Utama

| Modul                              | Status   | Keterangan | File/Folder Terkait |
| ---------------------------------- | -------- | ---------- | ------------------- |
| Setup Next.js                      | Selesai | Struktur app router, layout, route root redirect sudah ada. | `app/`, `app/layout.tsx`, `app/page.tsx`, `next.config.ts` |
| Setup Tailwind / UI                | Selesai | Tailwind sudah terpasang dan dipakai di seluruh halaman. | `app/globals.css`, `package.json`, `components/` |
| Bahasa Indonesia UI                | Partial | Banyak label UI sudah Bahasa Indonesia, tetapi API/error message dan sebagian placeholder masih English. | `app/dashboard/page.tsx`, `app/cv/page.tsx`, `app/campaigns/`, `components/` |
| Prisma + SQLite                    | Selesai | Prisma datasource menggunakan SQLite dan migration awal sudah ada. | `prisma/schema.prisma`, `prisma/migrations/20260601191716_init/` |
| Upload CV                          | Selesai | API upload menerima file, simpan ke local storage, lalu simpan metadata ke DB. | `app/api/cv/upload/route.ts`, `lib/storage/local-files.ts` |
| Extract PDF                        | Selesai | Ekstraksi PDF via `pdf-parse`. | `lib/cv/extract-text.ts` |
| Extract DOCX                       | Selesai | Ekstraksi DOCX via `mammoth`. | `lib/cv/extract-text.ts` |
| Extract TXT                        | Selesai | File TXT dibaca langsung sebagai plain text. | `lib/cv/extract-text.ts` |
| Extract Markdown                   | Selesai | File MD/Markdown dibaca sebagai plain text. | `lib/cv/extract-text.ts` |
| 9router Client                     | Selesai | Client OpenAI-compatible sudah ada dan membaca ENV. | `lib/ai/9router-client.ts` |
| Analisis CV AI                     | Selesai | API analisis memanggil AI dan menyimpan hasil ke `CandidateProfile`. | `app/api/cv/analyze/route.ts`, `lib/ai/cv-analyzer.ts` |
| Profil Kandidat                    | Partial | Model DB dan proses create profile sudah ada, tapi halaman `/profile` masih placeholder. | `prisma/schema.prisma`, `app/api/cv/analyze/route.ts`, `app/profile/page.tsx` |
| Buat Kampanye Lamaran              | Selesai | API create/list campaign sudah ada. UI detail/new page perlu verifikasi lebih lanjut, tetapi route ada. | `app/api/campaigns/route.ts`, `app/campaigns/`, `lib/api/campaigns.ts` |
| Default Salary/Notice/Availability | Selesai | Nilai default dibaca dari ENV dan disimpan saat create campaign. | `app/api/campaigns/route.ts`, `.env` |
| Playwright Browser Visible         | Selesai | Browser manager menolak headless dan memaksa visible Chromium. | `lib/browser/playwright-manager.ts`, `lib/security/safe-automation.ts` |
| Simpan Session Jobstreet           | Partial | Metadata session disimpan di DB, path session persistent dipakai, tetapi validasi session masih dasar. | `lib/browser/playwright-manager.ts`, `app/api/browser/session/route.ts`, `prisma/schema.prisma` |
| Login Jobstreet via ENV            | Belum | ENV credential sudah ada, tetapi belum ada implementasi login otomatis spesifik Jobstreet. | `.env`, `lib/browser/jobstreet-agent.ts` |
| Search Jobstreet                   | Belum | Agent baru membuka homepage Jobstreet, belum melakukan search lowongan. | `lib/browser/jobstreet-agent.ts` |
| Extract Info Lowongan              | Belum | Belum ada extractor detail lowongan dari halaman Jobstreet. | `lib/browser/jobstreet-agent.ts`, `lib/browser/page-detector.ts` |
| AI Job Scoring                     | Partial | Fungsi scoring AI sudah ada, tetapi belum terlihat terintegrasi ke flow campaign automation. | `lib/ai/job-scorer.ts` |
| Assisted Form Filling              | Partial | Filler field yang jelas sudah ada, tetapi belum terbukti menangani form lamaran Jobstreet end-to-end. | `lib/browser/form-filler.ts`, `lib/browser/jobstreet-agent.ts` |
| Modal Pertanyaan Tambahan          | Partial | Komponen modal sudah ada, tetapi wiring runtime ke UI/automation belum terlihat lengkap. | `components/modals/question-modal.tsx`, `components/modals/human-decision-modal.tsx` |
| Memori Pertanyaan                  | Selesai | API answer menyimpan/meningkatkan `QuestionMemory`. | `app/api/questions/answer/route.ts`, `prisma/schema.prisma` |
| Modal Captcha/Verifikasi           | Partial | Komponen modal ada dan safety policy mendeteksi intervensi manual, tetapi belum terlihat flow UI real-time penuh. | `components/modals/captcha-modal.tsx`, `lib/security/safe-automation.ts`, `lib/browser/page-detector.ts` |
| Review Lamaran Sebelum Submit      | Partial | Komponen review ada dan automation stub berhenti di review boundary, tetapi approval UI ke submit nyata belum terhubung penuh. | `components/modals/application-review-modal.tsx`, `lib/browser/jobstreet-agent.ts` |
| Submit Lamaran                     | Belum | Stub sengaja berhenti sebelum final submit. | `lib/browser/jobstreet-agent.ts` |
| Log Aktivitas                      | Partial | Log tersimpan ke database, tetapi UI log nyata belum dipastikan memakai data DB. | `lib/logging/automation-log.ts`, `prisma/schema.prisma`, `app/logs/page.tsx` |
| Pause/Resume/Stop Campaign         | Partial | API route status update sudah ada, tetapi resume belum melanjutkan automation session sesungguhnya. | `app/api/campaigns/[id]/pause/route.ts`, `app/api/campaigns/[id]/resume/route.ts`, `app/api/campaigns/[id]/stop/route.ts` |
| Screenshot Saat Error              | Belum | Field `screenshotPath` ada di model `Application`, tetapi belum terlihat implementasi capture screenshot. | `prisma/schema.prisma`, `lib/browser/jobstreet-agent.ts` |
| README Setup                       | Selesai | README sudah menjelaskan instalasi, ENV, Prisma, Playwright, route, dan batasan. | `README.md` |

## 5. Struktur Folder Saat Ini

Struktur penting saat ini:

```txt
app/
  api/
    applications/
    browser/session/
    campaigns/
    cv/
    questions/
  applications/
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
* [x] UploadedCV
* [x] Campaign
* [x] JobListing
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
Migration folder awal sudah ada di repository pada `prisma/migrations/20260601191716_init/`. Belum ada verifikasi ulang di task ini apakah command migrasi masih sukses dijalankan pada environment sekarang.

## 7. Environment Variables

Status `.env`:

| Variable                    | Status | Keterangan |
| --------------------------- | ------ | ---------- |
| DATABASE_URL                | Ada | Dipakai Prisma SQLite. |
| NINE_ROUTER_API_KEY         | Ada | Dipakai client 9router. Jangan expose value. |
| NINE_ROUTER_BASE_URL        | Ada | Base URL 9router tersedia. |
| NINE_ROUTER_CHAT_MODEL      | Ada | Model chat tersedia. |
| NINE_ROUTER_EMBEDDING_MODEL | Ada | Sudah terisi, tetapi pemakaian embedding belum terlihat aktif di flow utama. |
| JOBSTREET_EMAIL             | Ada | Credential tersedia, tetapi login otomatis belum diimplementasikan. |
| JOBSTREET_PASSWORD          | Ada | Credential tersedia, tetapi login otomatis belum diimplementasikan. |
| PLAYWRIGHT_HEADLESS         | Ada | Harus `false` untuk mematuhi safe automation policy. |
| PLAYWRIGHT_SESSION_PATH     | Ada | Dipakai untuk persistent session path. |
| DEFAULT_EXPECTED_SALARY     | Ada | Dipakai sebagai default campaign. |
| DEFAULT_CURRENT_SALARY      | Ada | Dipakai sebagai default campaign. |
| DEFAULT_NOTICE_PERIOD       | Ada | Dipakai sebagai default campaign. |
| DEFAULT_AVAILABILITY        | Ada | Dipakai sebagai default campaign. |

Jangan tulis value rahasia asli di file ini.

## 8. Halaman UI yang Sudah Ada

| Route            | Status | Keterangan |
| ---------------- | ------ | ---------- |
| /dashboard       | Partial | Halaman ada dan berfungsi sebagai dashboard UI, tetapi masih memakai mock data. |
| /cv              | Partial | Halaman ada, masih placeholder informatif. |
| /cv/upload       | Partial | Route UI ada, perlu verifikasi interaksi upload form aktual. |
| /profile         | Partial | Route ada, status implementasi detail belum penuh. |
| /campaigns       | Partial | Route ada, perlu verifikasi apakah data sudah realtime dari API/DB. |
| /campaigns/new   | Partial | Route ada, perlu verifikasi form create campaign end-to-end. |
| /campaigns/[id]  | Partial | Route ada, tetapi implementasi detail belum dipastikan lengkap. |
| /jobs            | Partial | Route ada, belum ada bukti integrasi search Jobstreet nyata. |
| /applications    | Partial | Route ada, API list ada, tetapi UI belum diverifikasi menggunakan data nyata. |
| /question-memory | Partial | Route ada, tetapi integrasi data ke UI belum diverifikasi. |
| /logs            | Partial | Route ada, tetapi belum dipastikan membaca `AutomationLog` dari DB. |
| /settings        | Partial | Route ada, implementasi detail belum diverifikasi. |

## 9. API Routes yang Sudah Ada

| API Route                              | Status | Keterangan |
| -------------------------------------- | ------ | ---------- |
| app/api/cv/upload/route.ts             | Selesai | Upload + ekstraksi + simpan `UploadedCV`. |
| app/api/cv/analyze/route.ts            | Selesai | Analisis CV dan simpan `CandidateProfile`. |
| app/api/campaigns/route.ts             | Selesai | GET list dan POST create campaign. |
| app/api/campaigns/[id]/start/route.ts  | Partial | Bisa start stub automation dan set status, tetapi belum menjalankan apply flow penuh. |
| app/api/campaigns/[id]/pause/route.ts  | Selesai | Update status campaign ke `paused`. |
| app/api/campaigns/[id]/resume/route.ts | Partial | Baru update status ke `running`, belum benar-benar melanjutkan automation. |
| app/api/campaigns/[id]/stop/route.ts   | Selesai | Update status campaign ke `stopped`. |
| app/api/questions/answer/route.ts      | Selesai | AI answer + upsert question memory. |
| app/api/browser/session/route.ts       | Selesai | Mengembalikan metadata session browser saat ini. |

## 10. Automation / Playwright Status

Jelaskan status browser automation:

* Browser visible mode: Sudah diterapkan. Headless mode ditolak.
* Session save/load: Path persistent session dipakai dan metadata session disimpan ke `BrowserSession`, tetapi load/validasi session masih dasar.
* Manual login: Secara praktik masih diperlukan; agent memberi ruang intervensi manual.
* Login via ENV: Belum diimplementasikan.
* Jobstreet search: Belum diimplementasikan.
* Job detail extraction: Belum diimplementasikan.
* Form filling: Ada helper untuk field yang jelas, masih partial.
* Captcha/manual intervention pause: Sudah ada deteksi dan hasil `requiresManualIntervention(...)`.
* Screenshot on error: Belum ada.
* Resume after intervention: Belum ada flow resume automation yang nyata.

## 11. AI Integration Status

Jelaskan status integrasi 9router:

* Chat completions: Sudah ada melalui OpenAI-compatible client.
* CV analysis: Sudah ada dan terhubung ke API route.
* Job scoring: Fungsi ada, belum tampak dipakai di flow campaign utama.
* Question answering: Sudah ada dan menyimpan memory.
* Structured JSON output: Sudah ada parsing JSON + schema validation.
* Error handling: Ada error throwing dasar jika ENV kosong atau response kosong; belum terlihat retry khusus.
* Retry handling: Belum ada.

## 12. Human-in-the-loop Status

Jelaskan fitur yang melibatkan keputusan user:

* Modal pertanyaan tambahan: Komponen ada, integrasi penuh belum diverifikasi.
* Modal captcha/verifikasi: Komponen ada, safety rules dan detector ada, wiring penuh belum diverifikasi.
* Modal review lamaran: Komponen ada, automation stub berhenti sebelum submit final.
* Approve and submit: Belum ada flow final submit nyata.
* Edit answer: Belum diverifikasi ada alur edit jawaban tersimpan dari UI.
* Skip job: Belum terlihat alur runtime lengkap.
* Pause campaign: API ada.
* Resume campaign: API ada, tetapi baru status-level.

## 13. Log Aktivitas

Status log:

* Log disimpan ke database: Ya.
* Log tampil di UI: Belum diverifikasi. Dashboard masih memakai mock log.
* Log per campaign: Didukung oleh relasi dan field `campaignId`.
* Log per job: Didukung oleh relasi dan field `jobListingId`.
* Log error: Ya, stub automation menulis log error.
* Screenshot path tersimpan: Belum terimplementasi nyata.

Contoh event log yang digunakan:

```txt
campaign.start
campaign.pause
campaign.resume
campaign.stop
browser.launch
jobstreet.ready
manual_intervention
submit.review_required
campaign.error
```

## 14. Testing Manual

Tuliskan hasil testing manual terakhir:

Tanggal: Belum diverifikasi di task ini  
Command yang dijalankan:

```bash
npm run dev
npx prisma migrate dev
npx prisma studio
npx playwright install
```

Hasil:

* [ ] App bisa dibuka
* [ ] Upload CV berhasil
* [ ] Analisis CV berhasil
* [ ] Campaign bisa dibuat
* [ ] Browser Playwright terbuka
* [ ] Login Jobstreet berhasil
* [ ] Search lowongan berhasil
* [ ] Form filling berjalan
* [ ] Modal pertanyaan muncul
* [ ] Review sebelum submit muncul
* [ ] Log tersimpan

Catatan: Pada task ini belum dilakukan pengujian manual ulang, jadi checklist di atas sengaja belum ditandai selesai.

## 15. Error / Bug Saat Ini

| Tanggal | Error | Penyebab Dugaan | Status | File Terkait |
| ------- | ----- | --------------- | ------ | ------------ |
| 2026-06-02 | Automation Jobstreet berhenti di review boundary dan tidak submit final | Desain stub aman memang memblok submit final tanpa approval user dan belum ada flow submit nyata | Open | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Resume campaign belum melanjutkan browser automation yang sebelumnya terhenti | Route resume hanya mengubah status database | Open | `app/api/campaigns/[id]/resume/route.ts` |
| 2026-06-02 | Search dan extraction lowongan Jobstreet belum berjalan | Logic site-specific belum diimplementasikan | Open | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Screenshot error belum tersimpan walau field DB sudah ada | Belum ada implementasi capture screenshot | Open | `prisma/schema.prisma`, `lib/browser/jobstreet-agent.ts` |

## 16. Risiko / Batasan

Tuliskan batasan saat ini:

* Tidak melakukan captcha bypass.
* Tidak melakukan stealth automation.
* Tidak melakukan scraping besar-besaran.
* Jobstreet UI dapat berubah sewaktu-waktu sehingga selector Playwright bisa rusak.
* Submit final harus melalui approval user.
* App hanya untuk penggunaan pribadi/lokal.

## 17. Yang Belum Dikerjakan

Checklist fitur yang belum selesai:

* [ ] Implementasi login Jobstreet otomatis atau semi-otomatis yang benar-benar memakai credential/session secara aman.
* [ ] Implementasi search lowongan Jobstreet, ekstraksi detail, dan penyimpanan `JobListing`.
* [ ] Integrasi `job-scorer` ke flow campaign untuk shortlist/skip job berdasarkan nilai AI.
* [ ] Finalisasi assisted form filling + review + submit lamaran setelah approval user.
* [ ] Implementasi screenshot saat error/intervensi dan tampilkan log nyata di UI.

## 18. Prioritas Berikutnya

Tuliskan 3–5 langkah paling masuk akal berikutnya.

1. Implementasikan flow search lowongan Jobstreet dan ekstraksi detail dasar ke `JobListing`.
2. Hubungkan `lib/ai/job-scorer.ts` ke campaign runner untuk scoring dan keputusan skip/lanjut.
3. Lengkapi alur human-in-the-loop untuk pertanyaan tambahan, captcha, dan review submit dari UI ke API.
4. Implementasikan screenshot error/manual intervention dan simpan path ke database/log.
5. Ganti mock dashboard/log dengan data nyata dari Prisma.

## 19. Prompt Lanjutan yang Direkomendasikan

Tuliskan prompt pendek untuk task berikutnya.

```txt
Continue from IMPLEMENTATION_STATUS.md. Focus only on implementing Jobstreet job search, basic job detail extraction, and saving JobListing records from the campaign runner. Do not implement final submit yet. Update IMPLEMENTATION_STATUS.md after finishing.
```

## 20. Catatan untuk AI Assistant Berikutnya

Tuliskan hal penting yang harus diketahui AI assistant berikutnya:

* Jangan ubah arsitektur tanpa alasan kuat.
* Jangan implement captcha bypass.
* UI harus Bahasa Indonesia.
* App ini local-first untuk pribadi.
* Gunakan 9router OpenAI-compatible API.
* Update file ini setiap selesai perubahan.
