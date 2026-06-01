import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        campaign: true,
        jobListing: true,
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Lamaran tidak ditemukan." },
        { status: 404 }
      );
    }

    return NextResponse.json(application, { status: 200 });
  } catch (error) {
    console.error("Error fetching application:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat mengambil data lamaran." },
      { status: 500 }
    );
  }
}
