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
    let sourceType: "uploaded_file" | "manual_text" = "uploaded_file";
    let manualTextUsed = false;
    const sourceUploadedCvId = body.uploadedCvId || null;

    // 1. Check manual text first
    if (body.manualCvText && body.manualCvText.trim().length > 0) {
      if (body.manualCvText.trim().length < 300) {
        return NextResponse.json(
          {
            error:
              "Teks CV terlalu pendek. Pastikan isi CV yang ditempel cukup lengkap sebelum dianalisis.",
          },
          { status: 400 },
        );
      }
      cvText = body.manualCvText.trim();
      sourceType = "manual_text";
      manualTextUsed = true;
    }
    // 2. Fallback to uploaded file if no manual text
    else if (body.uploadedCvId) {
      const uploadedCv = await prisma.uploadedCV.findUnique({
        where: { id: body.uploadedCvId },
      });

      if (!uploadedCv || !uploadedCv.extractedText || uploadedCv.extractedText.trim().length < 100) {
        return NextResponse.json(
          {
            error:
              "File berhasil diunggah, tetapi isi CV tidak berhasil dibaca dengan baik. Silakan tempel isi CV secara manual di kolom teks, lalu coba Analisis CV lagi.",
          },
          { status: 422 },
        );
      }

      cvText = uploadedCv.extractedText;
      sourceType = "uploaded_file";
      manualTextUsed = false;
    } else {
      return NextResponse.json(
        { error: "Teks CV manual atau ID CV unggahan wajib diisi." },
        { status: 400 },
      );
    }

    // Log the source used
    await prisma.automationLog.create({
      data: {
        event: sourceType === "manual_text" ? "cv.manual_text_used" : "cv.uploaded_text_used",
        message:
          sourceType === "manual_text"
            ? "Menggunakan teks CV manual untuk analisis."
            : "Menggunakan teks hasil ekstraksi file CV.",
        metadataJson: JSON.stringify({
          length: cvText.length,
          uploadedCvId: sourceUploadedCvId,
        }),
      },
    });

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
        manualTextUsed,
        sourceUploadedCvId,
      },
    });

    // Update UploadedCV to track source information
    if (body.uploadedCvId) {
      await prisma.uploadedCV.update({
        where: { id: body.uploadedCvId },
        data: {
          sourceType,
          manualTextUsed,
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
