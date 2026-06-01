import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { startJobApplication } from "@/lib/browser/jobstreet-apply-agent";
import { writeAutomationLog } from "@/lib/logging/automation-log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Load JobListing
    const job = await prisma.jobListing.findUnique({
      where: { id: jobId },
      include: { campaign: true },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Lowongan tidak ditemukan." },
        { status: 404 }
      );
    }

    // Check if job is shortlisted
    if (job.status !== "shortlisted") {
      return NextResponse.json(
        { error: "Lowongan belum masuk shortlist, tidak dilanjutkan ke proses lamaran." },
        { status: 400 }
      );
    }

    // Load related Campaign
    if (!job.campaign) {
      return NextResponse.json(
        { error: "Kampanye terkait tidak ditemukan." },
        { status: 404 }
      );
    }

    // Load latest CandidateProfile
    const profile = await prisma.candidateProfile.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Profil kandidat belum tersedia. Analisis CV terlebih dahulu." },
        { status: 400 }
      );
    }

    // Check if application already exists
    const existingApplication = await prisma.application.findFirst({
      where: {
        jobListingId: jobId,
        campaignId: job.campaign.id,
      },
    });

    if (existingApplication) {
      return NextResponse.json(
        {
          message: "Lamaran untuk lowongan ini sudah ada.",
          applicationId: existingApplication.id,
          status: existingApplication.status,
        },
        { status: 200 }
      );
    }

    // Log start
    await writeAutomationLog({
      campaignId: job.campaign.id,
      jobListingId: jobId,
      event: "application.started",
      message: `Memulai proses lamaran untuk "${job.title}" di ${job.company}.`,
      metadata: {
        jobUrl: job.url,
        jobTitle: job.title,
        company: job.company,
      },
    });

    // Start application flow
    const result = await startJobApplication({
      jobListing: job,
      campaign: job.campaign,
      profile: {
        fullName: profile.fullName ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        location: profile.location ?? "",
        summary: profile.summary ?? "",
        skillsJson: profile.skillsJson ?? "[]",
        experienceJson: profile.experienceJson ?? "[]",
        educationJson: profile.educationJson ?? "[]",
        projectsJson: profile.projectsJson ?? "[]",
        certificationsJson: profile.certificationsJson ?? "[]",
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error starting job application:", error);
    return NextResponse.json(
      {
        error: "Terjadi kesalahan saat memulai proses lamaran.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
