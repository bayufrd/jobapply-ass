import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { calibrateJobApply } from "@/lib/browser/jobstreet-apply-calibrator";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      overrideScore?: boolean;
      reason?: string;
    };

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

    const score = job.matchScore ?? 0;
    const threshold = job.campaign?.matchThreshold ?? 70;
    const requiresOverride = score < threshold;

    if (requiresOverride && !body.overrideScore) {
      return NextResponse.json(
        {
          status: "decision_required",
          message: "AI menyarankan lowongan ini dilewati, tetapi Anda tetap bisa menjalankan kalibrasi.",
          decision: {
            type: "low_score",
            jobId: job.id,
            title: job.title,
            company: job.company,
            score,
            threshold,
            reason: job.matchReason ?? "AI menyarankan lowongan ini dilewati.",
          },
        },
        { status: 200 }
      );
    }

    if (body.overrideScore && job.campaign) {
      await prisma.jobListing.update({
        where: { id: jobId },
        data: { status: "shortlisted" },
      });
    }

    // Need a campaign association
    if (!job.campaignId) {
      return NextResponse.json(
        { error: "Lowongan tidak memiliki kampanye terkait." },
        { status: 400 }
      );
    }

    // Load related Campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: job.campaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Kampanye terkait tidak ditemukan." },
        { status: 404 }
      );
    }

    // Run calibration (no profile needed - we're only detecting, not filling)
    const result = await calibrateJobApply({
      jobListingId: jobId,
      jobUrl: job.url,
      campaignId: campaign.id,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error running calibration:", error);
    return NextResponse.json(
      {
        error: "Terjadi kesalahan saat menjalankan kalibrasi.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
