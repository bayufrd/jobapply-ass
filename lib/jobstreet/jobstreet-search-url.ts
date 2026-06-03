const JOBSTREET_BASE_URL = "https://id.jobstreet.com";
const JOBSTREET_LOCATION_SLUG = "Jakarta-Barat-Jakarta-Raya";

export function buildJobstreetSearchUrl(keyword: string, page = 1) {
  const trimmedKeyword = keyword.trim();
  const keywordSlug = trimmedKeyword.replace(/\s+/g, "-");
  const baseUrl = `${JOBSTREET_BASE_URL}/id/${keywordSlug}-jobs/in-${JOBSTREET_LOCATION_SLUG}`;

  if (page <= 1) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function getJobstreetLocationSlug() {
  return JOBSTREET_LOCATION_SLUG;
}
