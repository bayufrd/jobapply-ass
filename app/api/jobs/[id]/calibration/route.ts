import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Find latest calibration for this job
    const calibration = await prisma.applicationCalibration.findFirst({
      where: { jobListingId: jobId },
      orderBy: { createdAt: "desc" },
      include: {
        jobListing: {
          select: {
            id: true,
            title: true,
            company: true,
            url: true,
            status: true,
          },
        },
      },
    });

    if (!calibration) {
      return NextResponse.json(
        { error: "Belum ada data kalibrasi untuk lowongan ini.", calibration: null },
        { status: 404 }
      );
    }

    return NextResponse.json({ calibration }, { status: 200 });
  } catch (error) {
    console.error("Error fetching calibration:", error);
    return NextResponse.json(
      {
        error: "Terjadi kesalahan saat mengambil data kalibrasi.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
