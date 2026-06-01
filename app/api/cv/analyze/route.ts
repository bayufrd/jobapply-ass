import { NextResponse } from "next/server";
import { analyzeCvText } from "@/lib/ai/cv-analyzer";
import { prisma } from "@/lib/db/prisma";

function isNineRouterEnvMissing(message: string) {
  return (
    message.includes("NINE_ROUTER_API_KEY") ||
    message.includes("NINE_ROUTER_BASE_URL") ||
    message.includes("NINE_ROUTER_CHAT_MODEL")
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { uploadedCvId?: string };

    if (!body.uploadedCvId) {
      return NextResponse.json({ error: "uploadedCvId wajib diisi." }, { status: 400 });
    }

    const uploadedCv = await prisma.uploadedCV.findUnique({
      where: { id: body.uploadedCvId },
    });

    if (!uploadedCv?.extractedText) {
      return NextResponse.json({ error: "CV unggahan atau teks hasil ekstraksi tidak ditemukan." }, { status: 404 });
    }

    const analysis = await analyzeCvText(uploadedCv.extractedText);

    const candidateProfile = await prisma.candidateProfile.create({
      data: {
        fullName: analysis.fullName,
        email: analysis.email,
        phone: analysis.phone,
        location: analysis.location,
        summary: analysis.summary,
        skillsJson: JSON.stringify(analysis.skills),
        experienceJson: JSON.stringify(analysis.workExperience),
        educationJson: JSON.stringify(analysis.education),
        projectsJson: JSON.stringify(analysis.projects),
        certificationsJson: JSON.stringify(analysis.certifications),
        rawCvText: uploadedCv.extractedText,
      },
    });

    return NextResponse.json({
      success: true,
      analysis,
      candidateProfile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analisis CV gagal.";

    if (isNineRouterEnvMissing(message)) {
      return NextResponse.json(
        {
          error:
            "Konfigurasi 9router belum lengkap. Periksa NINE_ROUTER_API_KEY, NINE_ROUTER_BASE_URL, dan NINE_ROUTER_CHAT_MODEL di file .env.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
