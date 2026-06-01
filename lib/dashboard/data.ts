import { getNineRouterConfig } from "@/lib/ai/9router-config";
import { prisma } from "@/lib/db/prisma";

export async function getDashboardData() {
  const [
    totalCvUploaded,
    latestUploadedCv,
    latestCandidateProfile,
    totalCampaigns,
    runningCampaign,
    totalApplications,
    totalLogs,
    latestLogs,
    latestCampaigns,
  ] = await Promise.all([
    prisma.uploadedCV.count(),
    prisma.uploadedCV.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.campaign.count(),
    prisma.campaign.findFirst({
      where: { status: "running" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.application.count(),
    prisma.automationLog.count(),
    prisma.automationLog.findMany({
      include: {
        campaign: true,
        jobListing: true,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        logs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  return {
    totalCvUploaded,
    latestUploadedCv,
    latestCandidateProfile,
    totalCampaigns,
    runningCampaign,
    totalApplications,
    totalLogs,
    latestLogs,
    latestCampaigns,
  };
}

export async function getCvData() {
  const [uploadedCvs, latestCandidateProfile] = await Promise.all([
    prisma.uploadedCV.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.candidateProfile.findFirst({
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    uploadedCvs,
    latestCandidateProfile,
    latestUploadedCv: uploadedCvs[0] ?? null,
  };
}

export async function getProfileData() {
  const [latestCandidateProfile, latestUploadedCv] = await Promise.all([
    prisma.candidateProfile.findFirst({
      orderBy: { updatedAt: "desc" },
    }),
    prisma.uploadedCV.findFirst({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    latestCandidateProfile,
    latestUploadedCv,
  };
}

export async function getCampaignListData() {
  return prisma.campaign.findMany({
    include: {
      applications: true,
      logs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCampaignDetailData(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      applications: {
        include: {
          jobListing: true,
        },
        orderBy: { createdAt: "desc" },
      },
      logs: {
        include: {
          jobListing: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
}

export async function getLogsData() {
  return prisma.automationLog.findMany({
    include: {
      campaign: true,
      jobListing: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getJobsData() {
  return prisma.jobListing.findMany({
    include: {
      campaign: {
        select: { id: true, name: true },
      },
      calibrations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          flowType: true,
          createdAt: true,
        },
      },
      logs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getJobsCountForCampaign(campaignId: string) {
  return prisma.jobListing.count({
    where: { campaignId },
  });
}

export async function getSettingsData() {
  const [session, userSettings] = await Promise.all([
    prisma.browserSession.findUnique({
      where: { provider: "jobstreet" },
    }),
    prisma.userSetting.findMany({
      orderBy: { key: "asc" },
    }),
  ]);

  const nineRouter = getNineRouterConfig();

  return {
    session,
    userSettings,
    envDefaults: {
      expectedSalary: process.env.DEFAULT_EXPECTED_SALARY ?? "6000000",
      currentSalary: process.env.DEFAULT_CURRENT_SALARY ?? "6000000",
      noticePeriod: process.env.DEFAULT_NOTICE_PERIOD ?? "ASAP",
      availability: process.env.DEFAULT_AVAILABILITY ?? "Immediate",
      sessionPath: process.env.PLAYWRIGHT_SESSION_PATH ?? "./storage/jobstreet.auth.json",
      visibleMode: (process.env.PLAYWRIGHT_HEADLESS ?? "false") !== "true",
      nineRouterConfigured: nineRouter.isConfigured,
      nineRouterRootUrl: nineRouter.rootUrl,
      nineRouterChatModel: nineRouter.chatModel,
      nineRouterEmbeddingModel: nineRouter.embeddingModel,
      nineRouterMissingFields: nineRouter.missingFields,
    },
  };
}
