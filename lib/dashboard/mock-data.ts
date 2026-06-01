export const dashboardStats = [
  { label: "Kampanye Aktif", value: "Backend Jakarta Push", hint: "Auto apply dibantu · batas minimal 78" },
  { label: "Jumlah Lamaran Terkirim", value: "12", hint: "Target 25 lamaran" },
  { label: "Jumlah Lowongan Dilewati", value: "31", hint: "Di bawah batas minimal atau syarat belum terpenuhi" },
  { label: "Aksi yang Perlu Ditangani", value: "3", hint: "Menunggu tindakan user" },
];

export const latestLogs = [
  "Membuka lowongan Jobstreet dan mengambil detail yang terlihat.",
  "Dijeda pada pertanyaan rekruter tentang waktu relokasi.",
  "Menyimpan sesi browser setelah login manual selesai.",
  "Melewati lowongan karena gaji tidak sesuai dengan default kampanye.",
];

export const pendingActions = [
  "Setujui pengiriman akhir untuk Senior Node.js Developer di PT Arunika.",
  "Jawab pertanyaan izin kerja untuk lowongan Data Engineer.",
  "Lanjutkan kampanye setelah captcha selesai di browser yang terlihat.",
];

export const campaignCards = [
  {
    id: "camp-1",
    name: "Backend Jakarta Push",
    status: "Aktif",
    progress: "12 / 25",
    job: "Senior Backend Engineer · PT Arunika",
  },
  {
    id: "camp-2",
    name: "Remote Product Roles",
    status: "Dijeda",
    progress: "4 / 10",
    job: "Dijeda pada pertanyaan tambahan",
  },
];

export const questionQueue = [
  {
    question: "Seberapa cepat Anda bisa mulai bekerja setelah menerima penawaran?",
    suggestion: "Segera / Secepatnya",
    confidence: "0.95",
    evidence: "Default ketersediaan kampanye adalah Segera.",
  },
  {
    question: "Apakah Anda memiliki pengalaman memimpin tim berisi 5+ engineer?",
    suggestion: "Perlu review user",
    confidence: "0.42",
    evidence: "CV menunjukkan pengalaman mentoring, tetapi tidak menyebutkan ukuran tim secara jelas.",
  },
];
