export const TERMINAL_JOB_STATUSES = [
  "submitted",
  "failed",
  "apply_unavailable",
  "stuck_no_progress",
  "submit_not_found_timeout",
  "external_review_required",
  "manual_intervention_required",
] as const;

export const ACTIVE_JOB_STATUSES = [
  "applying",
] as const;

export const PICKABLE_JOB_STATUSES = [
  "discovered",
  "shortlisted",
  "skipped",
] as const;

export const AUTO_APPLY_FALLBACK_JOB_STATUSES = [
  "discovered",
] as const;

export const NON_PICKABLE_JOB_STATUSES = [
  ...TERMINAL_JOB_STATUSES,
  ...ACTIVE_JOB_STATUSES,
  "pending_review",
  "paused",
] as const;

export const NON_REPICKABLE_APPLICATION_STATUSES = [
  "submitted",
  "pending_review",
  "paused",
  "failed",
] as const;
