const SUCCESS_TEXT_MARKERS = [
  "Your application has been sent",
  "Application has been sent",
  "has been sent",
  "Nice work",
  "Keep it up",
  "Lamaran terkirim",
  "Lamaran berhasil dikirim",
] as const;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function getApplicationSuccessMarkers() {
  return [...SUCCESS_TEXT_MARKERS];
}

export function detectApplicationSuccessMarker(input: {
  url?: string | null;
  text?: string | null;
}) {
  const normalizedUrl = normalizeText(input.url);
  const normalizedText = normalizeText(input.text);

  if (normalizedUrl.includes("/apply/success")) {
    return {
      matched: true,
      marker: "/apply/success",
      source: "url" as const,
    };
  }

  for (const marker of SUCCESS_TEXT_MARKERS) {
    if (normalizedText.includes(normalizeText(marker))) {
      return {
        matched: true,
        marker,
        source: "text" as const,
      };
    }
  }

  return {
    matched: false,
    marker: null,
    source: null,
  };
}
