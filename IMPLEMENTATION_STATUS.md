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
Project sekarang sudah bisa dijalankan sebagai fondasi MVP lokal yang jujur: halaman target utama membaca data nyata dari SQLite/Prisma, upload CV menyimpan file ke `storage/cv`, analisis CV menyimpan `CandidateProfile`, list/detail kampanye membaca database, log UI membaca `AutomationLog`, dan start campaign membuka browser Playwright visible lalu menulis log nyata. Automation Jobstreet tetap belum menyelesaikan search lowongan, ekstraksi detail, dan submit lamaran end-to-end, dan status itu sekarang ditampilkan apa adanya di UI maupun API.

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
| 9router Client                     | Selesai | Client OpenAI-compatible sudah ada dan membaca ENV. | `lib/ai/9router-client.ts` |
| Analisis CV AI                     | Partial | API analisis memanggil AI dan menyimpan hasil ke `CandidateProfile`. Error ENV 9router kini jujur, tetapi panggilan AI belum diverifikasi sukses di task ini. | `app/api/cv/analyze/route.ts`, `lib/ai/cv-analyzer.ts` |
| Profil Kandidat                    | Selesai | Halaman `/profile` kini membaca `CandidateProfile` terbaru dan menampilkan data terstruktur nyata dari DB. | `prisma/schema.prisma`, `app/api/cv/analyze/route.ts`, `app/profile/page.tsx` |
| Buat Kampanye Lamaran              | Selesai | API create/list campaign ada, form `/campaigns/new` mengirim data nyata, dan default ENV dipakai bila field opsional kosong. | `app/api/campaigns/route.ts`, `app/campaigns/`, `lib/api/campaigns.ts` |
| Default Salary/Notice/Availability | Selesai | Nilai default dibaca dari ENV dan disimpan saat create campaign. | `app/api/campaigns/route.ts`, `.env` |
| Playwright Browser Visible         | Selesai | Browser manager menolak headless dan memaksa visible Chromium. | `lib/browser/playwright-manager.ts`, `lib/security/safe-automation.ts` |
| Simpan Session Jobstreet           | Partial | Metadata session disimpan di DB, path session persistent dipakai, endpoint session menampilkan status nyata, tetapi validasi session masih dasar. | `lib/browser/playwright-manager.ts`, `app/api/browser/session/route.ts`, `prisma/schema.prisma` |
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
| Log Aktivitas                      | Selesai | Dashboard dan halaman `/logs` kini membaca `AutomationLog` nyata dari database. | `lib/logging/automation-log.ts`, `prisma/schema.prisma`, `app/logs/page.tsx`, `app/dashboard/page.tsx` |
| Pause/Resume/Stop Campaign         | Partial | API route status update dan log nyata sudah ada, tetapi resume belum melanjutkan automation session sesungguhnya. | `app/api/campaigns/[id]/pause/route.ts`, `app/api/campaigns/[id]/resume/route.ts`, `app/api/campaigns/[id]/stop/route.ts` |
| Screenshot Saat Error              | Partial | Screenshot error kini dicoba disimpan ke `storage/screenshots`, tetapi belum ada penyimpanan ke field `Application.screenshotPath`. | `prisma/schema.prisma`, `lib/browser/jobstreet-agent.ts` |
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
Migration folder awal tetap valid. Pada task ini `npx prisma migrate dev` berhasil dijalankan dan database SQLite dilaporkan sudah sinkron tanpa perubahan schema tambahan.

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
| /dashboard       | Selesai | Tidak lagi memakai mock; statistik, kampanye terbaru, dan log terbaru dibaca langsung dari Prisma. |
| /cv              | Selesai | Menampilkan riwayat CV nyata dari DB dan status analisis terbaru. |
| /cv/upload       | Partial | Form upload dan tombol analisis nyata sudah ada; upload terverifikasi, tetapi analisis sukses bergantung pada ENV 9router dan belum diuji end-to-end di task ini. |
| /profile         | Selesai | Menampilkan `CandidateProfile` terbaru dan data JSON terstruktur dari DB. |
| /campaigns       | Selesai | List kampanye membaca SQLite, bukan mock data. |
| /campaigns/new   | Selesai | Form submit nyata ke API create campaign dan mendukung fallback default dari ENV. |
| /campaigns/[id]  | Partial | Detail, progres, dan log kampanye nyata sudah tampil; kontrol aksi nyata ada, tetapi hasil start browser belum diuji manual dari UI di task ini. |
| /jobs            | Partial | Route ada, belum ada integrasi search Jobstreet nyata. |
| /applications    | Partial | Route ada, API list ada, tetapi UI belum diaudit di task ini. |
| /question-memory | Partial | Route ada, tetapi UI belum diaudit di task ini. |
| /logs            | Selesai | Membaca `AutomationLog` nyata dari DB, urut terbaru lebih dulu. |
| /settings        | Selesai | Menampilkan status session browser, konfigurasi 9router, default ENV, dan `UserSetting` nyata. |

## 9. API Routes yang Sudah Ada

| API Route                              | Status | Keterangan |
| -------------------------------------- | ------ | ---------- |
| app/api/cv/upload/route.ts             | Selesai | Upload + ekstraksi + simpan `UploadedCV`. |
| app/api/cv/analyze/route.ts            | Selesai | Analisis CV dan simpan `CandidateProfile`. |
| app/api/campaigns/route.ts             | Selesai | GET list dan POST create campaign. |
| app/api/campaigns/[id]/start/route.ts  | Partial | Start kampanye kini membuka browser visible via manager, menulis log nyata, lalu mengembalikan status jujur bila search Jobstreet belum diimplementasikan. |
| app/api/campaigns/[id]/pause/route.ts  | Selesai | Update status campaign ke `paused` dan menulis log nyata. |
| app/api/campaigns/[id]/resume/route.ts | Partial | Mengubah status ke `running` dan menulis log nyata, tetapi belum benar-benar melanjutkan automation. |
| app/api/campaigns/[id]/stop/route.ts   | Selesai | Update status campaign ke `stopped` dan menulis log nyata. |
| app/api/questions/answer/route.ts      | Selesai | AI answer + upsert question memory. |
| app/api/browser/session/route.ts       | Selesai | Mengembalikan metadata session browser, mode visible, configured path, dan pesan status jujur. |

## 10. Automation / Playwright Status

Jelaskan status browser automation:

* Browser visible mode: Sudah diterapkan. Headless mode ditolak.
* Session save/load: Path persistent session dipakai dan metadata session disimpan ke `BrowserSession`, tetapi load/validasi session masih dasar.
* Manual login: Masih mungkin diperlukan; bila intervensi terdeteksi sistem menulis log `manual_intervention`.
* Login via ENV: Belum diimplementasikan.
* Jobstreet search: Belum diimplementasikan, dan start campaign kini mengembalikan pesan jujur bahwa browser berhasil dibuka tetapi pencarian belum tersedia.
* Job detail extraction: Belum diimplementasikan.
* Form filling: Helper field masih ada, tetapi belum dipakai untuk submit nyata.
* Captcha/manual intervention pause: Sudah ada deteksi dan hasil `requiresManualIntervention(...)`.
* Screenshot on error: Ada percobaan capture ke `storage/screenshots` saat error.
* Resume after intervention: Belum ada flow resume automation yang nyata.

## 11. AI Integration Status

Jelaskan status integrasi 9router:

* Chat completions: Sudah ada melalui OpenAI-compatible client.
* CV analysis: Sudah ada dan terhubung ke API route.
* Job scoring: Fungsi ada, belum tampak dipakai di flow campaign utama.
* Question answering: Sudah ada dan menyimpan memory.
* Structured JSON output: Sudah ada parsing JSON + schema validation.
* Error handling: Ada error throwing dasar jika ENV kosong atau response kosong; route analisis kini menampilkan error Indonesia yang jelas bila ENV 9router belum lengkap.
* Retry handling: Belum ada.

## 12. Human-in-the-loop Status

Jelaskan fitur yang melibatkan keputusan user:

* Modal pertanyaan tambahan: Komponen ada, integrasi penuh belum diverifikasi.
* Modal captcha/verifikasi: Komponen ada, safety rules dan detector ada, wiring penuh belum diverifikasi.
* Modal review lamaran: Komponen ada, automation stub berhenti sebelum submit final.
* Approve and submit: Belum ada flow final submit nyata.
* Edit answer: Belum diverifikasi ada alur edit jawaban tersimpan dari UI.
* Skip job: Belum terlihat alur runtime lengkap.
* Pause campaign: API ada dan menulis log nyata.
* Resume campaign: API ada dan menulis log nyata, tetapi baru status-level.

## 13. Log Aktivitas

Status log:

* Log disimpan ke database: Ya.
* Log tampil di UI: Ya, dashboard dan halaman `/logs` membaca data DB nyata.
* Log per campaign: Didukung oleh relasi dan field `campaignId`.
* Log per job: Didukung oleh relasi dan field `jobListingId`.
* Log error: Ya, start/pause/resume/stop dan worker stub menulis log nyata.
* Screenshot path tersimpan: Capture file error dicoba ke `storage/screenshots`, tetapi belum ditautkan ke model `Application`.

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

Tanggal: 2026-06-02
Command yang dijalankan:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npx playwright install chromium
npm run lint
npm run dev
```

Hasil:

* [x] App opens
* [ ] Upload CV works
* [ ] Analyze CV works
* [ ] Profile saved
* [ ] Campaign created
* [ ] Campaign listed
* [x] Logs shown
* [ ] Start campaign opens browser
* [ ] Logs are written

Catatan:
* `npm install` tidak dijalankan ulang di task ini karena `node_modules` sudah tersedia dan app sudah berjalan.
* `npm run dev` gagal dijalankan sebagai proses kedua karena sudah ada dev server aktif di port `3000`; route kemudian diverifikasi lewat server yang sedang berjalan.
* Verifikasi HTTP berhasil untuk `/dashboard`, `/cv`, `/campaigns`, `/logs`, `/settings`, dan `/api/browser/session`.
* Upload CV, analisis CV, create campaign, dan start campaign belum diuji manual lewat browser pada task ini.

## 15. Error / Bug Saat Ini

| Tanggal | Error | Penyebab Dugaan | Status | File Terkait |
| ------- | ----- | --------------- | ------ | ------------ |
| 2026-06-02 | Resume campaign belum melanjutkan browser automation yang sebelumnya terhenti | Route resume masih hanya mengubah status dan menulis log | Open | `app/api/campaigns/[id]/resume/route.ts` |
| 2026-06-02 | Search dan extraction lowongan Jobstreet belum berjalan | Logic site-specific belum diimplementasikan | Open | `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Screenshot error belum ditautkan ke record aplikasi | Capture file dicoba, tetapi belum disimpan ke `Application.screenshotPath` | Open | `prisma/schema.prisma`, `lib/browser/jobstreet-agent.ts` |
| 2026-06-02 | Menjalankan `npm run dev` kedua menghasilkan error server duplikat | Sudah ada dev server aktif di port `3000` | Resolved/Informational | `package.json` |

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
* [ ] Tautkan screenshot error/intervensi ke record aplikasi yang relevan dan perluas verifikasi manual end-to-end.

## 18. Prioritas Berikutnya

Tuliskan 3–5 langkah paling masuk akal berikutnya.

1. Implementasikan flow search lowongan Jobstreet dan ekstraksi detail dasar ke `JobListing`.
2. Uji manual end-to-end flow upload CV, analisis 9router, create campaign, dan start campaign dari browser lokal.
3. Hubungkan `lib/ai/job-scorer.ts` ke campaign runner untuk scoring dan keputusan skip/lanjut.
4. Lengkapi alur human-in-the-loop untuk pertanyaan tambahan, captcha, dan review submit dari UI ke API.
5. Tautkan screenshot error/manual intervention ke record aplikasi atau log yang relevan.

## 19. Prompt Lanjutan yang Direkomendasikan

Tuliskan prompt pendek untuk task berikutnya.

```txt
Continue from IMPLEMENTATION_STATUS.md. Focus only on manual end-to-end verification of upload CV, analyze CV with 9router, create campaign, and start campaign browser logging. Fix only issues found during verification. Do not implement final submit yet. Update IMPLEMENTATION_STATUS.md after finishing.
```

## 20. Catatan untuk AI Assistant Berikutnya

Tuliskan hal penting yang harus diketahui AI assistant berikutnya:

* Jangan ubah arsitektur tanpa alasan kuat.
* Jangan implement captcha bypass.
* UI harus Bahasa Indonesia.
* App ini local-first untuk pribadi.
* Gunakan 9router OpenAI-compatible API.
* Dashboard, CV, profile, campaigns, logs, dan settings target scope task ini sudah tidak memakai mock data lagi.
* Update file ini setiap selesai perubahan.
