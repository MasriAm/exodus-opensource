export * from "./types";
export {
  CATEGORY_BY_ID,
  DRAMA_LEXICON,
  EVIDENCE_CATEGORIES,
  normalizeForMatch,
} from "./lexicon";
export { extractEvidence, localHour, type ExtractOptions } from "./extract";
export { redactName, redactText } from "./redact";
export {
  buildReport,
  computeMetrics,
  computeVerdicts,
  findComeback,
  findSituationship,
  findSlowFade,
  formatDuration,
  type BuildReportOptions,
  type ConversationStats,
  type DramaMetrics,
  type MetricsOptions,
} from "./verdicts";
export {
  buildTemplateMessages,
  TEMPLATE_CONVERSATIONS,
  TEMPLATE_OWNER,
  TEMPLATE_PLATFORMS,
} from "./template-data";
