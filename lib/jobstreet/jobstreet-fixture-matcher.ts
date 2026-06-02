import type { NormalizedMcpPage } from "../mcp/mcp-snapshot-normalizer.ts";
import { loadJobstreetFixtureKnowledge } from "./jobstreet-fixture-loader.ts";
import type { JobstreetKnownStep } from "./jobstreet-layout-knowledge.ts";

const loadedKnowledge = loadJobstreetFixtureKnowledge();

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesText(haystack: string, needle: string) {
  return normalize(haystack).includes(normalize(needle));
}

function countMatches(haystack: string, values: string[]) {
  return values.reduce((count, value) => count + (includesText(haystack, value) ? 1 : 0), 0);
}

function buildPageText(snapshot: NormalizedMcpPage) {
  const buttonText = snapshot.buttons.map((item) => item.label).join(" ");
  const inputText = [
    ...snapshot.inputs.map((item) => item.label),
    ...snapshot.selects.map((item) => item.label),
    ...snapshot.questions.map((item) => item.text),
    ...snapshot.submitCandidates.map((item) => item.label),
  ].join(" ");

  return normalize(`${snapshot.title} ${snapshot.visibleTextSummary} ${buttonText} ${inputText}`);
}

function isReviewSubmitSupported(snapshot: NormalizedMcpPage) {
  const submitLabels = snapshot.submitCandidates.map((item) => normalize(item.label));
  return submitLabels.some((label) => /submit application|kirim lamaran/.test(label));
}

export function matchLiveSnapshotToJobstreetKnowledge(snapshot: NormalizedMcpPage, currentUrl: string): {
  step: JobstreetKnownStep | "unknown";
  confidence: number;
  matchedSignals: string[];
  warnings: string[];
} {
  const pageText = buildPageText(snapshot);
  const url = normalize(currentUrl || snapshot.url);

  let bestMatch: {
    step: JobstreetKnownStep | "unknown";
    confidence: number;
    matchedSignals: string[];
    warnings: string[];
  } = {
    step: "unknown",
    confidence: 0,
    matchedSignals: [],
    warnings: [],
  };

  for (const knowledge of loadedKnowledge) {
    let score = 0;
    const matchedSignals: string[] = [];
    const warnings: string[] = [];

    const normalizedUrlPattern = normalize(knowledge.referenceUrlPattern || "");
    const hasUrlMatch = normalizedUrlPattern ? url.includes(normalizedUrlPattern) : false;
    if (hasUrlMatch) {
      score += 0.55;
      matchedSignals.push(`URL cocok dengan ${knowledge.referenceUrlPattern}`);

      if (knowledge.step !== "choose_documents" && normalizedUrlPattern !== "/apply") {
        score += 0.15;
        matchedSignals.push("URL langkah spesifik lebih kuat dari halaman apply generik");
      }
    }

    const textMatches = countMatches(pageText, knowledge.derivedVisibleTexts);
    if (textMatches > 0) {
      score += Math.min(0.25, textMatches * 0.08);
      matchedSignals.push(`Teks fixture cocok ${textMatches}x`);
    }

    const buttonMatches = countMatches(pageText, knowledge.derivedButtons);
    if (buttonMatches > 0) {
      score += Math.min(0.2, buttonMatches * 0.1);
      matchedSignals.push(`Tombol fixture cocok ${buttonMatches}x`);
    }

    if (knowledge.step === "review_submit" && !isReviewSubmitSupported(snapshot)) {
      score -= 0.3;
      warnings.push("Fixture review cocok sebagian, tetapi tombol Submit application live belum terlihat.");
    }

    if (knowledge.step === "success") {
      const successMatches = countMatches(pageText, knowledge.successMarkers ?? []);
      if (successMatches > 0) {
        score += Math.min(0.2, successMatches * 0.1);
        matchedSignals.push(`Marker sukses cocok ${successMatches}x`);
      }
    }

    if (knowledge.step === "update_profile") {
      const antiPatterns = knowledge.antiPatterns ?? [];
      const antiPatternHits = antiPatterns.filter((item) => includesText(pageText, item.replace(/ does not mean login$/i, "")));
      if (antiPatternHits.length > 0) {
        warnings.push("Teks anti-pattern profile terdeteksi; jangan salah klasifikasi sebagai login.");
      }
    }

    if (knowledge.step === "review_submit") {
      const antiPatterns = knowledge.antiPatterns ?? [];
      const antiPatternHits = antiPatterns.filter((item) => includesText(pageText, item.replace(/ is not submit$/i, "")));
      if (antiPatternHits.length > 0 && !isReviewSubmitSupported(snapshot)) {
        warnings.push("Ada tombol non-submit yang mirip konteks review; submit final belum boleh diasumsikan.");
      }
    }

    const confidence = Math.max(0, Math.min(1, Number(score.toFixed(2))));
    if (confidence > bestMatch.confidence) {
      bestMatch = {
        step: knowledge.step,
        confidence,
        matchedSignals,
        warnings,
      };
    }
  }

  if (bestMatch.confidence < 0.35) {
    return {
      step: "unknown",
      confidence: bestMatch.confidence,
      matchedSignals: bestMatch.matchedSignals,
      warnings: [...bestMatch.warnings, "Bukti fixture + live belum cukup kuat untuk klasifikasi langkah."],
    };
  }

  return bestMatch;
}
