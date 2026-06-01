import { NextResponse } from "next/server";
import { analyzeCvText } from "@/lib/ai/cv-analyzer";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { uploadedCvId?: string };

    if (!body.uploadedCvId) {
      return NextResponse.json({ error: "uploadedCvId is required." }, { status: 400 });
    }

    const uploadedCv = await prisma.uploadedCV.findUnique({
      where: { id: body.uploadedCvId },
    });

    if (!uploadedCv?.extractedText) {
      return NextResponse.json({ error: "Uploaded CV or extracted text not found." }, { status: 404 });
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
    const message = error instanceof Error ? error.message : "CV analysis failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
