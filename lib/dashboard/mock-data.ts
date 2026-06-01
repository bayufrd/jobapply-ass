export const dashboardStats = [
  { label: "Active Campaign", value: "Backend Jakarta Push", hint: "Assisted auto apply · threshold 78" },
  { label: "Applied Count", value: "12", hint: "Target 25 applications" },
  { label: "Skipped Count", value: "31", hint: "Below threshold or missing requirements" },
  { label: "Paused Questions", value: "3", hint: "Waiting for human answers" },
];

export const latestLogs = [
  "Opened Jobstreet listing and extracted visible details.",
  "Paused on custom recruiter question about relocation timeline.",
  "Saved browser session after manual login completion.",
  "Skipped role due to salary mismatch with campaign defaults.",
];

export const pendingActions = [
  "Approve final submit for Senior Node.js Developer at PT Arunika.",
  "Answer work authorization question for Data Engineer listing.",
  "Resume campaign after captcha solved in visible browser.",
];

export const campaignCards = [
  {
    id: "camp-1",
    name: "Backend Jakarta Push",
    status: "running",
    progress: "12 / 25",
    job: "Senior Backend Engineer · PT Arunika",
  },
  {
    id: "camp-2",
    name: "Remote Product Roles",
    status: "paused",
    progress: "4 / 10",
    job: "Paused on custom question",
  },
];

export const questionQueue = [
  {
    question: "How soon can you join after receiving an offer?",
    suggestion: "Immediate / ASAP",
    confidence: "0.95",
    evidence: "Campaign default availability is Immediate.",
  },
  {
    question: "Do you have experience leading a team of 5+ engineers?",
    suggestion: "Needs human review",
    confidence: "0.42",
    evidence: "CV shows mentoring but not explicit team size ownership.",
  },
];
