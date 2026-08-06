import type { ArchiveFilter } from "./archive-filter";

export type { ArchiveFilter };

export const QUERY_NAMES = [
  "conversationList",
  "messagesPage",
  "counts",
  "search",
  "activityTimeline",
  "mediaList",
  "wrappedStats",
  "exportMetadata",
  "deskHome",
  "onThisDay",
  "peopleList",
  "personDetail",
  "messageHeatmap",
  "dayMessages",
  "footprint",
  "surpriseMemory",
  "filterOptions",
  "messageRank",
] as const;

export type QueryName = (typeof QUERY_NAMES)[number];

export type ExportTable = "messages" | "media" | "events";
export type ExportFormat = "xlsx" | "csv" | "json";
export type MediaKind = "image" | "video" | "audio" | "other";

export interface RowCounts {
  messages: number;
  media: number;
  events: number;
}

export interface ConversationListParams {
  limit?: number;
  offset?: number;
  filter?: ArchiveFilter;
}

export interface ConversationListItem {
  platform: string;
  conversation: string;
  messageCount: number;
  participantCount: number;
  mediaCount: number;
  lastMessageAtMs: number;
  lastSender: string;
  preview: string | null;
}

export interface ConversationListResult {
  items: ConversationListItem[];
  limit: number;
  offset: number;
}

export interface MessageCursor {
  sentAtMs: number;
  rowId: number;
}

export interface MessagesPageParams {
  conversation: string;
  before?: MessageCursor | null;
  /** Chronological page offset (0-based). When set, cursor `before` is ignored. */
  offset?: number;
  limit?: number;
  filter?: ArchiveFilter;
}

export interface MessageItem {
  rowId: number;
  platform: string;
  conversation: string;
  sender: string;
  sentAtMs: number;
  text: string | null;
  mediaRef: string | null;
}

export interface MessagesPageResult {
  items: MessageItem[];
  nextBefore: MessageCursor | null;
  hasMore: boolean;
  totalCount: number;
  offset: number;
  limit: number;
  /** Full-thread sender roster for stable you/them alignment across pages. */
  threadSenders: Array<{ sender: string; messageCount: number }>;
  /** Sender that appears in the most conversations — usually you. */
  archiveSelfHint: string | null;
}

export interface CountsResult extends RowCounts {
  conversations: number;
  platforms: number;
}

export interface SearchParams {
  term: string;
  limit?: number;
  offset?: number;
  filter?: ArchiveFilter;
}

export interface SearchHit {
  rowId: number;
  platform: string;
  conversation: string;
  sender: string;
  sentAtMs: number;
  text: string;
  snippet: string;
  matchTerms: string[];
}

export interface SearchGroup {
  conversation: string;
  hitCount: number;
  hits: SearchHit[];
}

export interface SearchResult {
  term: string;
  totalHits: number;
  groups: SearchGroup[];
  limit: number;
  offset: number;
}

export interface MessageRankParams {
  filter?: ArchiveFilter;
  rowId: number;
  sentAtMs: number;
}

export interface MessageRankResult {
  rank: number;
}

export type ActivityGranularity = "day" | "month";

export interface ActivityTimelineParams {
  granularity?: ActivityGranularity;
  fromMs?: number | null;
  toMs?: number | null;
}

export interface ActivityKindCount {
  kind: string;
  count: number;
}

export interface ActivityBucket {
  bucketStartMs: number;
  total: number;
  kinds: ActivityKindCount[];
}

export interface ActivityTimelineResult {
  granularity: ActivityGranularity;
  buckets: ActivityBucket[];
}

export interface MediaListParams {
  kind?: MediaKind | null;
  conversation?: string | null;
  limit?: number;
  offset?: number;
  filter?: ArchiveFilter;
}

export interface MediaItem {
  rowId: number;
  platform: string;
  zipPath: string;
  kind: MediaKind;
  takenAtMs: number | null;
  conversation: string | null;
}

export interface MediaListResult {
  items: MediaItem[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface DeskHomeResult {
  messages: number;
  media: number;
  conversations: number;
  activeFromMs: number | null;
  activeToMs: number | null;
  platforms: Array<{ platform: string; messageCount: number }>;
  onThisDayMessageCount: number;
  onThisDayMonth: number;
  onThisDayDay: number;
  sampleMedia: MediaItem[];
  recentMessages: MessageItem[];
  onThisDayMessages: MessageItem[];
  topPeople: Array<{
    platform: string;
    conversation: string;
    messageCount: number;
  }>;
}

export interface OnThisDayParams {
  month?: number;
  day?: number;
  limit?: number;
  filter?: ArchiveFilter;
}

export interface OnThisDayResult {
  month: number;
  day: number;
  messages: MessageItem[];
  media: MediaItem[];
}

export interface PeopleListParams {
  limit?: number;
  offset?: number;
  filter?: ArchiveFilter;
}

export interface PeopleListItem {
  platform: string;
  conversation: string;
  messageCount: number;
  participantCount: number;
  mediaCount: number;
  firstMessageAtMs: number;
  lastMessageAtMs: number;
}

export interface PeopleListResult {
  items: PeopleListItem[];
  limit: number;
  offset: number;
}

export interface PersonDetailParams {
  conversation: string;
  filter?: ArchiveFilter;
}

export interface PersonDynamics {
  /** First message after a ≥4h gap (or thread open), you vs them. */
  conversationStarts: { you: number; them: number };
  /** Median reply latency in ms when answering the other side. */
  medianReplyMs: { you: number | null; them: number | null };
  avgMessageLength: { you: number; them: number };
  yearlyVolume: Array<{ year: number; messageCount: number }>;
  busiestDay: { dayMs: number; messageCount: number } | null;
  topWords: Array<{ word: string; count: number }>;
  /** Messages that attach media (media_ref), you vs them. */
  mediaSplit: { you: number; them: number };
  themSender: string | null;
}

export interface PersonDetailResult {
  conversation: string;
  platform: string | null;
  messageCount: number;
  participantCount: number;
  firstMessageAtMs: number | null;
  lastMessageAtMs: number | null;
  firstMessage: {
    sender: string;
    text: string | null;
    sentAtMs: number;
  } | null;
  lastMessage: {
    sender: string;
    text: string | null;
    sentAtMs: number;
  } | null;
  senderBalance: Array<{ sender: string; messageCount: number }>;
  monthlyVolume: Array<{ monthStartMs: number; messageCount: number }>;
  longestStreakDays: number;
  longestSilenceDays: number;
  media: MediaItem[];
  dynamics: PersonDynamics;
  lateMessageCount: number;
}

export interface MessageHeatmapParams {
  year: number;
  filter?: ArchiveFilter;
}

export interface MessageHeatmapResult {
  year: number;
  days: Array<{ dayMs: number; messageCount: number }>;
  maxCount: number;
}

export interface DayMessagesParams {
  dayMs: number;
  limit?: number;
  filter?: ArchiveFilter;
}

export interface DayMessagesResult {
  dayMs: number;
  items: MessageItem[];
}

export interface FootprintComment {
  occurredAtMs: number;
  text: string;
  title: string | null;
  year: number;
}

export interface FootprintFollowEvent {
  kind: "follower" | "following";
  username: string;
  occurredAtMs: number;
}

export interface FootprintPersonalInfoField {
  key: string;
  value: string;
}

export interface FootprintPersonalInfo {
  occurredAtMs: number;
  path: string;
  fields: FootprintPersonalInfoField[];
}

export interface FootprintCall {
  media: "voice" | "video" | string;
  durationSec: number | null;
  conversation: string;
  text: string | null;
  occurredAtMs: number;
}

export interface FootprintSystemNote {
  conversation: string;
  text: string;
  occurredAtMs: number;
}

export interface FootprintResult {
  comments: FootprintComment[];
  interestsByYear: Array<{ year: number; topics: string[] }>;
  profileHistory: Array<{
    field: "username" | "bio";
    value: string;
    occurredAtMs: number;
  }>;
  followEvents: FootprintFollowEvent[];
  personalInfo: FootprintPersonalInfo[];
  calls: FootprintCall[];
  systemNotes: FootprintSystemNote[];
}

export interface SurpriseMemoryResult {
  message: MessageItem | null;
}

export interface FilterOptionsResult {
  platforms: string[];
  conversations: Array<{
    platform: string;
    conversation: string;
    messageCount: number;
  }>;
  activeFromMs: number | null;
  activeToMs: number | null;
  owners: Record<string, string>;
  globalArchiveOwnerName: string | null;
}

export interface WrappedContact {
  conversation: string;
  messageCount: number;
}

export interface WrappedHour {
  hour: number;
  messageCount: number;
}

export interface WrappedBusiestDay {
  date: string;
  messageCount: number;
}

export interface WrappedWord {
  word: string;
  count: number;
}

export interface WrappedFirstMessage {
  text: string | null;
  sentAtMs: number;
  conversation: string;
  sender: string;
}

export interface WrappedStreak {
  days: number;
  startDate: string;
  endDate: string;
}

export interface WrappedMutualFollow {
  username: string;
  startedAtMs: number;
  durationSec: number;
}

export interface WrappedCringeComment {
  text: string;
  occurredAtMs: number;
}

export interface WrappedInterestsByYear {
  year: number;
  topics: string[];
}

export interface WrappedProfileChange {
  field: "username" | "bio";
  value: string;
  occurredAtMs: number;
}

export interface WrappedLongestCall {
  media: "voice" | "video";
  durationSec: number;
  conversation: string;
  occurredAtMs: number;
}

export interface WrappedFirstImage {
  zipPath: string;
  conversation: string;
  takenAtMs: number | null;
}

export interface WrappedStatsResult {
  fallbackUsername: string | null;
  totalMessages: number;
  totalMedia: number;
  activeFromMs: number | null;
  activeToMs: number | null;
  topContacts: WrappedContact[];
  messagesByHour: WrappedHour[];
  peakHour: number | null;
  /** Messages in the single busiest local hour (legacy name kept for the API). */
  threeAmEraMessages: number;
  busiestDay: WrappedBusiestDay | null;
  topWords: WrappedWord[];
  firstMessage: WrappedFirstMessage | null;
  longestStreak: WrappedStreak | null;
  longestMutualFollows: WrappedMutualFollow[];
  longestConversation: WrappedContact | null;
  mostTypedWord: WrappedWord | null;
  longestCall: WrappedLongestCall | null;
  cringeComments: WrappedCringeComment[];
  interestsByYear: WrappedInterestsByYear[];
  profileHistory: WrappedProfileChange[];
  firstImageSent: WrappedFirstImage | null;
  oldestImages: WrappedFirstImage[];
}

export interface ExportFormatMetadata {
  format: ExportFormat;
  mimeType: string;
  extension: "xlsx" | "csv" | "json";
}

export interface ExportTableMetadata {
  table: ExportTable;
  rowCount: number;
  columns: readonly string[];
  suggestedFiles: Record<ExportFormat, string>;
}

export interface ExportMetadataResult {
  tables: ExportTableMetadata[];
  formats: ExportFormatMetadata[];
}

export interface QueryParamsByName {
  conversationList: ConversationListParams | undefined;
  messagesPage: MessagesPageParams;
  counts: undefined;
  search: SearchParams;
  activityTimeline: ActivityTimelineParams | undefined;
  mediaList: MediaListParams | undefined;
  wrappedStats: undefined;
  exportMetadata: undefined;
  deskHome: { filter?: ConversationListParams["filter"] } | undefined;
  onThisDay: OnThisDayParams | undefined;
  peopleList: PeopleListParams | undefined;
  personDetail: PersonDetailParams;
  messageHeatmap: MessageHeatmapParams;
  dayMessages: DayMessagesParams;
  footprint: { filter?: ConversationListParams["filter"] } | undefined;
  surpriseMemory: { filter?: ConversationListParams["filter"] } | undefined;
  filterOptions: undefined;
  messageRank: MessageRankParams;
}

export interface QueryResultByName {
  conversationList: ConversationListResult;
  messagesPage: MessagesPageResult;
  counts: CountsResult;
  search: SearchResult;
  activityTimeline: ActivityTimelineResult;
  mediaList: MediaListResult;
  wrappedStats: WrappedStatsResult;
  exportMetadata: ExportMetadataResult;
  deskHome: DeskHomeResult;
  onThisDay: OnThisDayResult;
  peopleList: PeopleListResult;
  personDetail: PersonDetailResult;
  messageHeatmap: MessageHeatmapResult;
  dayMessages: DayMessagesResult;
  footprint: FootprintResult;
  surpriseMemory: SurpriseMemoryResult;
  filterOptions: FilterOptionsResult;
  messageRank: MessageRankResult;
}

export type QueryArgs<Name extends QueryName> =
  undefined extends QueryParamsByName[Name]
    ? [params?: QueryParamsByName[Name]]
    : [params: QueryParamsByName[Name]];

export type IngestStage =
  | "initializing"
  | "opening"
  | "detecting"
  | "parsing"
  | "loading"
  | "finalizing";

export interface IngestProgress {
  stage: IngestStage;
  done: number;
  total: number | null;
  rows: RowCounts;
  label: string;
}

export interface IngestSummary {
  archiveName: string;
  platform: string;
  parserId: string;
  counts: RowCounts;
  elapsedMs: number;
  replacedExistingArchive: boolean;
}

export type IngestProgressCallback = (
  progress: IngestProgress,
) => void | Promise<void>;

export interface IngestApi {
  ingest(
    file: File,
    onProgress: IngestProgressCallback,
    options?: { append?: boolean },
  ): Promise<IngestSummary>;
  detectArchive(file: File): Promise<string | null>;
  query<Name extends QueryName>(
    name: Name,
    ...args: QueryArgs<Name>
  ): Promise<QueryResultByName[Name]>;
  readMediaBlob(zipPath: string): Promise<Blob>;
  exportTable(table: ExportTable, format: ExportFormat): Promise<Blob>;
  /** Lightweight liveness check for stall recovery. */
  ping(): Promise<true>;
}
