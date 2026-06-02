export type JobstreetKnownStep =
  | "choose_documents"
  | "employer_questions"
  | "update_profile"
  | "review_submit"
  | "success";

export type JobstreetLayoutKnowledge = {
  step: JobstreetKnownStep;
  referenceTitle: string;
  referenceUrlPattern: string;
  expectedVisibleTexts: string[];
  expectedButtons: string[];
  expectedInputs?: string[];
  expectedQuestionPatterns?: string[];
  successMarkers?: string[];
  antiPatterns?: string[];
  aiGuidance: string;
};

export const JOBSTREET_LAYOUT_KNOWLEDGE: JobstreetLayoutKnowledge[] = [
  {
    step: "choose_documents",
    referenceTitle: "Choose documents",
    referenceUrlPattern: "/apply",
    expectedVisibleTexts: ["Choose documents", "Resumé", "Resume", "Resumé attached", "Resume attached"],
    expectedButtons: ["Continue", "Lanjut"],
    expectedInputs: ["Resumé", "Resume"],
    aiGuidance:
      "Ini biasanya langkah pilih dokumen. Jika resume/CV sudah terlihat attached/terlampir, biasanya aksi aman berikutnya adalah tombol Continue. Jangan menganggap elemen fixture sebagai elemen live; pilih hanya elementId yang benar-benar terlihat pada snapshot MCP live.",
  },
  {
    step: "employer_questions",
    referenceTitle: "Answer employer questions",
    referenceUrlPattern: "/apply/role-requirements",
    expectedVisibleTexts: ["Answer employer questions"],
    expectedButtons: ["Continue", "Lanjut"],
    expectedInputs: ["Notice period", "Expected salary", "Current salary", "Availability"],
    expectedQuestionPatterns: [
      "notice period",
      "expected salary",
      "current salary",
      "availability",
      "why should we hire you",
    ],
    aiGuidance:
      "Ini langkah pertanyaan employer. Isi field wajib yang kosong memakai CV, default kampanye, dan QuestionMemory bila yakin. Jika masih ambigu, minta user. Gunakan fixture hanya sebagai referensi pola pertanyaan dan tombol, bukan sumber kebenaran runtime.",
  },
  {
    step: "update_profile",
    referenceTitle: "Update Jobstreet Profile",
    referenceUrlPattern: "/apply/profile",
    expectedVisibleTexts: ["Update Jobstreet Profile", "Your Jobstreet Profile is part of your application"],
    expectedButtons: ["Continue", "Lanjut"],
    antiPatterns: [
      "Profile does not mean login",
      "Profile Avatar does not mean login",
      "Skip to content does not mean login",
      "Open app does not mean login",
      "SIGN_IN_PAGE in script/config does not mean login",
    ],
    aiGuidance:
      "Ini langkah apply normal, bukan login/security hanya karena ada kata Profile, Profile Avatar, Skip to content, Open app, atau SIGN_IN_PAGE. Cari tombol Continue dari elemen live bila field wajib yang terlihat sudah terisi; jika ada field wajib kosong, isi dulu bila datanya tersedia.",
  },
  {
    step: "review_submit",
    referenceTitle: "Review and submit",
    referenceUrlPattern: "/apply/review",
    expectedVisibleTexts: ["Review and submit", "Applying for", "Cover letter", "Resumé attached", "Resume attached"],
    expectedButtons: ["Submit application", "Kirim lamaran"],
    antiPatterns: [
      "View job description is not submit",
      "Explore site is not submit",
      "Back is not submit",
    ],
    aiGuidance:
      "Ini langkah review akhir. Cari tombol final Submit application dari elemen live yang terlihat. Jangan menganggap View job description, Explore site, atau Back sebagai submit. Hanya submit bila aman dan sesuai guardrail.",
  },
  {
    step: "success",
    referenceTitle: "Application sent",
    referenceUrlPattern: "/apply/success",
    expectedVisibleTexts: ["Nice work", "Your application has been sent", "Application sent"],
    expectedButtons: [],
    successMarkers: ["Nice work", "Your application has been sent", "Application sent"],
    aiGuidance:
      "Ini menandakan lamaran berhasil dikirim. Verifikasi marker sukses dari halaman live atau URL /apply/success; jangan tandai submitted tanpa bukti live.",
  },
];

export function getJobstreetLayoutKnowledge(step: JobstreetKnownStep) {
  return JOBSTREET_LAYOUT_KNOWLEDGE.find((item) => item.step === step) ?? null;
}
