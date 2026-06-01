import { NextResponse } from "next/server";
import { analyzeCvText } from "@/lib/ai/cv-analyzer";
import {
  NINE_ROUTER_CONFIG_ERROR_MESSAGE,
  NINE_ROUTER_MODEL_ERROR_MESSAGE,
} from "@/lib/ai/9router-config";
import { prisma } from "@/lib/db/prisma";

function isNineRouterConfigError(message: string) {
  return (
    message === NINE_ROUTER_CONFIG_ERROR_MESSAGE ||
    message === NINE_ROUTER_MODEL_ERROR_MESSAGE ||
    message.includes("NINEROUTER_URL") ||
    message.includes("NINEROUTER_KEY") ||
    message.includes("NINEROUTER_CHAT_MODEL") ||
    message.includes("NINE_ROUTER_CHAT_MODEL")
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      uploadedCvId?: string;
      manualCvText?: string;
      sourceType?: "uploaded_file" | "manual_text";
    };

    let cvText = "";
    let sourceType = body.sourceType || "uploaded_file";
    const sourceUploadedCvId = body.uploadedCvId || null;

    if (body.manualCvText && body.manualCvText.trim().length >= 300) {
      cvText = body.manualCvText.trim();
      sourceType = "manual_text";
      await prisma.automationLog.create({
        data: {
          event: "cv.manual_text_used",
          message: "Menggunakan teks CV manual untuk analisis.",
          metadataJson: JSON.stringify({ length: cvText.length }),
        },
      });
    } else if (body.uploadedCvId) {
      const uploadedCv = await prisma.uploadedCV.findUnique({
        where: { id: body.uploadedCvId },
      });

      if (!uploadedCv?.extractedText) {
        await prisma.automationLog.create({
          data: {
            event: "cv.extraction_too_short",
            message: "Teks hasil ekstraksi CV kosong atau tidak ditemukan.",
            metadataJson: JSON.stringify({ uploadedCvId: body.uploadedCvId }),
          },
        });
        return NextResponse.json(
          { error: "CV unggahan atau teks hasil ekstraksi tidak ditemukan." },
          { status: 404 },
        );
      }

      cvText = uploadedCv.extractedText;
      sourceType = "uploaded_file";
      await prisma.automationLog.create({
        data: {
          event: "cv.uploaded_text_used",
          message: "Menggunakan teks hasil ekstraksi file CV.",
          metadataJson: JSON.stringify({
            uploadedCvId: body.uploadedCvId,
            length: cvText.length,
          }),
        },
      });
    } else {
      return NextResponse.json(
        { error: "Teks CV manual atau ID CV unggahan wajib diisi." },
        { status: 400 },
      );
    }

    const analysis = await analyzeCvText(cvText);

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
        rawCvText: cvText,
        sourceType,
        sourceUploadedCvId,
      },
    });

    // Update UploadedCV to track source information if manual text was used
    if (sourceType === "manual_text" && body.uploadedCvId) {
      await prisma.uploadedCV.update({
        where: { id: body.uploadedCvId },
        data: {
          sourceType: "manual_text",
          manualTextUsed: cvText,
        },
      });
    } else if (sourceType === "uploaded_file" && body.uploadedCvId) {
      await prisma.uploadedCV.update({
        where: { id: body.uploadedCvId },
        data: {
          sourceType: "uploaded_file",
        },
      });
    }

    await prisma.automationLog.create({
      data: {
        event: "cv.analysis_success",
        message: `Analisis CV berhasil untuk ${analysis.fullName || "Kandidat"}.`,
        metadataJson: JSON.stringify({
          profileId: candidateProfile.id,
          sourceType,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      analysis,
      candidateProfile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analisis CV gagal.";

    await prisma.automationLog.create({
      data: {
        event: "cv.analysis_failed",
        level: "error",
        message: `Analisis CV gagal: ${message}`,
      },
    });

    if (isNineRouterConfigError(message)) {
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
