import { NextResponse } from "next/server";
import { extractTextFromCv, isSupportedCvFile } from "@/lib/cv/extract-text";
import { prisma } from "@/lib/db/prisma";
import { saveUploadedFile } from "@/lib/storage/local-files";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!isSupportedCvFile(file.name, file.type)) {
      return NextResponse.json(
        {
          error: "Unsupported CV format. Use PDF, DOCX, TXT, or MD.",
        },
        { status: 400 },
      );
    }

    const saved = await saveUploadedFile(file);
    const extractedText = await extractTextFromCv(saved.absolutePath, file.type);

    const uploadedCv = await prisma.uploadedCV.create({
      data: {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        filePath: saved.relativePath,
        extractedText,
      },
    });

    return NextResponse.json({
      success: true,
      uploadedCv,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
