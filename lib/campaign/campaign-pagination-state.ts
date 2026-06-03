export const DEFAULT_MAX_SEARCH_PAGES = 50;
export const DEFAULT_MAX_CONSECUTIVE_EMPTY_PAGES = 3;

export type CampaignPaginationState = {
  currentSearchPage: number;
  emptyPageCount: number;
  verifiedSubmittedCount: number;
  targetApplyCount: number;
  maxSearchPages?: number;
  maxConsecutiveEmptyPages?: number;
};

export type CampaignPaginationDecision =
  | {
      type: "target_reached";
      currentSearchPage: number;
      emptyPageCount: number;
    }
  | {
      type: "continue_current_page";
      currentSearchPage: number;
      emptyPageCount: number;
    }
  | {
      type: "advance_to_next_page";
      currentSearchPage: number;
      nextSearchPage: number;
      emptyPageCount: number;
    }
  | {
      type: "no_jobs_remaining_after_all_pages" | "too_many_empty_pages";
      currentSearchPage: number;
      emptyPageCount: number;
    };

export function resolveCampaignPaginationDecision(
  state: CampaignPaginationState,
  input: {
    pageHadProcessableJobs: boolean;
    shouldAdvancePage: boolean;
  },
): CampaignPaginationDecision {
  const maxSearchPages = state.maxSearchPages ?? DEFAULT_MAX_SEARCH_PAGES;
  const maxConsecutiveEmptyPages =
    state.maxConsecutiveEmptyPages ?? DEFAULT_MAX_CONSECUTIVE_EMPTY_PAGES;

  if (state.verifiedSubmittedCount >= state.targetApplyCount) {
    return {
      type: "target_reached",
      currentSearchPage: state.currentSearchPage,
      emptyPageCount: state.emptyPageCount,
    };
  }

  if (!input.shouldAdvancePage) {
    return {
      type: "continue_current_page",
      currentSearchPage: state.currentSearchPage,
      emptyPageCount: state.emptyPageCount,
    };
  }

  const nextEmptyPageCount = input.pageHadProcessableJobs ? 0 : state.emptyPageCount + 1;

  if (nextEmptyPageCount >= maxConsecutiveEmptyPages) {
    return {
      type: "too_many_empty_pages",
      currentSearchPage: state.currentSearchPage,
      emptyPageCount: nextEmptyPageCount,
    };
  }

  if (state.currentSearchPage >= maxSearchPages) {
    return {
      type: "no_jobs_remaining_after_all_pages",
      currentSearchPage: state.currentSearchPage,
      emptyPageCount: nextEmptyPageCount,
    };
  }

  return {
    type: "advance_to_next_page",
    currentSearchPage: state.currentSearchPage,
    nextSearchPage: state.currentSearchPage + 1,
    emptyPageCount: nextEmptyPageCount,
  };
}
