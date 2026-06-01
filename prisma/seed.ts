import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingApplication = await prisma.application.findFirst({
    where: {
      campaign: { name: "Backend Jakarta Push" },
      jobListing: { url: "https://www.jobstreet.co.id/demo-job-1" },
    },
  });

  if (existingApplication) {
    console.log("Seed data already exists.");
    return;
  }

  const profile = await prisma.candidateProfile.create({
    data: {
      fullName: "Dastrevas Demo",
      email: "demo@example.com",
      phone: "+628123456789",
      location: "Jakarta",
      summary: "Backend-focused fullstack engineer with experience in TypeScript, Node.js, and automation tooling.",
      skillsJson: JSON.stringify(["TypeScript", "Node.js", "Next.js", "Prisma", "Playwright"]),
      experienceJson: JSON.stringify([
        { company: "PT Demo Tech", role: "Senior Fullstack Engineer", years: 4 },
      ]),
      educationJson: JSON.stringify([{ school: "Demo University", degree: "Computer Science" }]),
      projectsJson: JSON.stringify([{ name: "JobApply Assistant MVP", role: "Lead Builder" }]),
      certificationsJson: JSON.stringify(["AWS Cloud Practitioner"]),
      rawCvText: "Demo CV text for local development.",
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      name: "Backend Jakarta Push",
      keyword: "backend engineer",
      location: "Jakarta",
      targetApplyCount: 25,
      appliedCount: 2,
      status: "paused",
      submitMode: "assisted_auto_apply",
      matchThreshold: 78,
      defaultCurrentSalary: 6000000,
      defaultExpectedSalary: 6000000,
      defaultNoticePeriod: "ASAP",
      defaultAvailability: "Immediate",
      workModePreference: "hybrid",
      currentJobTitle: "Senior Backend Engineer",
      currentJobCompany: "PT Arunika",
    },
  });

  const job = await prisma.jobListing.create({
    data: {
      source: "jobstreet",
      title: "Senior Backend Engineer",
      company: "PT Arunika",
      location: "Jakarta",
      salaryText: "Rp 6.000.000 - 9.000.000",
      workType: "Hybrid",
      url: "https://www.jobstreet.co.id/demo-job-1",
      description: "Visible demo listing used for local-first MVP seeding.",
      matchScore: 84,
      matchReason: "Strong TypeScript and Node.js alignment.",
      status: "shortlisted",
    },
  });

  await prisma.application.create({
    data: {
      campaignId: campaign.id,
      jobListingId: job.id,
      status: "pending_review",
      submitMode: "assisted_auto_apply",
      userApproved: false,
      notes: "Waiting for explicit final approval in review modal.",
      answersJson: JSON.stringify({ expectedSalary: 6000000, availability: "Immediate" }),
    },
  });

  await prisma.questionMemory.upsert({
    where: { questionNormalized: "how soon can you join?" },
    update: {
      answer: "Immediate / ASAP",
      source: "user_confirmed",
      confidence: 0.99,
      usageCount: 3,
    },
    create: {
      questionRaw: "How soon can you join?",
      questionNormalized: "how soon can you join?",
      answer: "Immediate / ASAP",
      source: "user_confirmed",
      confidence: 0.99,
      usageCount: 3,
    },
  });

  await prisma.browserSession.upsert({
    where: { provider: "jobstreet" },
    update: {
      sessionPath: "./storage/jobstreet.auth.json",
      isValid: false,
    },
    create: {
      provider: "jobstreet",
      sessionPath: "./storage/jobstreet.auth.json",
      isValid: false,
    },
  });

  await prisma.automationLog.create({
    data: {
      campaignId: campaign.id,
      jobListingId: job.id,
      level: "info",
      event: "seed.complete",
      message: `Seeded demo profile ${profile.fullName} and campaign ${campaign.name}.`,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
