import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
} from "@zip.js/zip.js";

export const FIXTURE_SEED = 0x5eedc0de;

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_DIRECTORY = resolve(PROJECT_ROOT, "fixtures");
const INSTAGRAM_MESSAGES_ROOT =
  "your_instagram_activity/messages/inbox";
const FIXED_ZIP_DATE = new Date("2025-01-01T00:00:00.000Z");
const DAY_IN_MS = 86_400_000;
const INSTAGRAM_START_DATE_MS = Date.UTC(2023, 0, 1);
const INSTAGRAM_DATE_SPAN_DAYS = 730;
const TOTAL_INSTAGRAM_MESSAGES = 1_500;
const FOLLOWER_COUNT = 18;
const FOLLOWING_COUNT = 12;
const MUTUAL_FOLLOW_COUNT = 3;
const COMMENT_COUNT = 8;
const CRINGE_COMMENT_COUNT = 5;
const INTEREST_COUNT_2023 = 4;
const INTEREST_COUNT_2024 = 4;
const PROFILE_CHANGE_COUNT = 4;

const SENDERS = ["Yousef", "سارة", "عمر"] as const;

type Sender = (typeof SENDERS)[number];

interface ThreadDefinition {
  slug: string;
  title: string;
  participants: readonly Sender[];
  senderCounts: Readonly<Partial<Record<Sender, number>>>;
  pageSize: number;
}

const THREADS: readonly ThreadDefinition[] = [
  {
    slug: "family_group",
    title: "Family العائلة",
    participants: SENDERS,
    senderCounts: {
      Yousef: 200,
      سارة: 200,
      عمر: 200,
    },
    pageSize: 300,
  },
  {
    slug: "sara_al_haddad",
    title: "Sara سارة",
    participants: ["Yousef", "سارة"],
    senderCounts: {
      Yousef: 250,
      سارة: 250,
    },
    pageSize: 500,
  },
  {
    slug: "omar_khalil",
    title: "Omar عمر",
    participants: ["Yousef", "عمر"],
    senderCounts: {
      Yousef: 200,
      عمر: 200,
    },
    pageSize: 400,
  },
] as const;

const MESSAGE_TEMPLATES = [
  "مرحبا يا أصدقاء، كيف حالكم اليوم؟ ذكريات جميلة",
  "الساعة الثالثة وما زلنا نتحدث عن الذكريات",
  "خلينا نحفظ هذه اللحظة في إكسودس",
  "صباح الخير، القهوة جاهزة والجو جميل",
  "هذه الصورة من رحلتنا القديمة",
  "بكرة نكمل الحكاية إن شاء الله",
  "Reclaim the memories, one local message at a time.",
  "Coffee at three again — our tiny 3am era.",
  "This photo belongs in the private archive.",
  "No cloud, no tracking, just our story.",
  "Do you remember this day?",
  "See you tomorrow, bring the old camera.",
  "ذكريات جميلة — keep them private and local.",
  "Meet at 3am؟ خلينا نكمل الحكاية.",
  "Reclaim our story — الخصوصية أولاً.",
  "One more photo، وصورة أخرى للذكرى.",
] as const;

const TINY_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
    "base64",
  ),
);

interface ArchiveEntry {
  path: string;
  data: string | Uint8Array;
}

interface MessageDraft {
  thread: ThreadDefinition;
  sender: Sender;
}

interface InstagramPhoto {
  uri: string;
  creation_timestamp: number;
}

interface RawInstagramMessage {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  photos?: InstagramPhoto[];
}

interface GeneratedInstagramMessage {
  threadSlug: string;
  sender: Sender;
  timestampMs: number;
  cleanContent: string | null;
  photoPath: string | null;
  raw: RawInstagramMessage;
}

interface PaginationManifest {
  pageCount: number;
  messagesPerPage: number[];
}

interface FirstMessageManifest {
  conversation: string;
  sender: string;
  sentAtMs: number;
  text: string | null;
}

interface DateRangeManifest {
  firstSentAtMs: number;
  lastSentAtMs: number;
  firstDate: string;
  lastDate: string;
}

interface StreakManifest {
  days: number;
  startDate: string;
  endDate: string;
}

interface ConversationCountManifest {
  conversation: string;
  messages: number;
}

export interface FixtureManifest {
  schemaVersion: 1;
  generator: {
    seed: number;
    timezone: "UTC";
    zipEntryTimestamp: string;
  };
  instagram: {
    file: "demo-instagram.zip";
    entryCount: number;
    messageJsonEntryCount: number;
    messageCount: number;
    messagesWithText: number;
    messagesWithoutText: number;
    threadCount: number;
    senderCount: number;
    messagesPerThread: Record<string, number>;
    messagesPerSender: Record<string, number>;
    mediaCount: number;
    mediaPerThread: Record<string, number>;
    eventCount: number;
    eventsPerKind: Record<string, number>;
    followersCount: number;
    followingCount: number;
    mutualFollowCount: number;
    commentCount: number;
    cringeCommentCount: number;
    interestCount: number;
    profileChangeCount: number;
    personalInformationEntryCount: number;
    profileChangesEntryCount: number;
    commentsEntryCount: number;
    adsInterestsEntryCount: number;
    pagination: Record<string, PaginationManifest>;
    analytics: {
      dateRange: DateRangeManifest;
      firstMessage: FirstMessageManifest;
      firstImageSent: {
        zipPath: string;
        conversation: string;
        takenAtMs: number;
      };
      longestMutualFollows: Array<{
        username: string;
        startedAtMs: number;
        durationSec: number;
      }>;
      cringeComments: Array<{ text: string; occurredAtMs: number }>;
      interestsByYear: Array<{ year: number; topics: string[] }>;
      profileHistory: Array<{
        field: "username" | "bio";
        value: string;
        occurredAtMs: number;
      }>;
      messagesByHourUtc: number[];
      lateNightMessages0200To0459: number;
      /** Hours 02:00–03:59 UTC — matches Wrapped `threeAmEraMessages`. */
      twoToFourAmMessages: number;
      threeAmMessages: number;
      activeDayCount: number;
      busiestDay: {
        date: string;
        messages: number;
      };
      longestDailyActivityStreak: StreakManifest;
      topConversations: ConversationCountManifest[];
      selectedTermMessageHits: Record<string, number>;
      selectedTermOccurrences: Record<string, number>;
    };
  };
  whatsapp: {
    file: "demo-whatsapp.zip";
    entryCount: number;
    chatFile: "_chat.txt";
    messageCount: number;
    mediaCount: number;
    eventCount: number;
    callCount: number;
    longestCallDurationSec: number;
    messagesPerSender: Record<string, number>;
    messagesPerFormat: {
      ios: number;
      android: number;
    };
    systemEventsPerFormat: {
      ios: number;
      android: number;
    };
    callEventsPerFormat: {
      ios: number;
      android: number;
    };
    continuationLineCount: number;
    omittedMediaVariants: string[];
    rtlMarkCounts: {
      "U+200E": number;
      "U+200F": number;
    };
  };
}

interface MutualFollowSpec {
  username: string;
  followerAtSec: number;
  followingAtSec: number;
}

interface CommentSpec {
  text: string;
  occurredAtSec: number;
}

interface InterestSpec {
  topic: string;
  occurredAtSec: number;
}

interface ProfileChangeSpec {
  field: "username" | "bio";
  value: string;
  occurredAtSec: number;
}

interface InstagramStoryExtras {
  mutualFollows: MutualFollowSpec[];
  comments: CommentSpec[];
  interests: InterestSpec[];
  profileChanges: ProfileChangeSpec[];
}

interface InstagramFixture {
  entries: ArchiveEntry[];
  messages: GeneratedInstagramMessage[];
  pagination: Record<string, PaginationManifest>;
  story: InstagramStoryExtras;
}

interface WhatsAppFixture {
  entries: ArchiveEntry[];
  manifest: FixtureManifest["whatsapp"];
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomInteger(random: () => number, exclusiveMaximum: number): number {
  return Math.floor(random() * exclusiveMaximum);
}

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const replacementIndex = randomInteger(random, index + 1);
    [values[index], values[replacementIndex]] = [
      values[replacementIndex],
      values[index],
    ];
  }
}

function toInstagramMojibake(value: string): string {
  return Buffer.from(value, "utf8").toString("latin1");
}

function serializeInstagramJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) {
    throw new Error("Instagram fixture value could not be serialized.");
  }

  const escaped = json.replace(
    /[\u0080-\uffff]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return `${escaped}\n`;
}

function hourForMessage(index: number, random: () => number): number {
  if (index % 4 === 0) {
    return 3;
  }
  if (index % 13 === 0) {
    return 2;
  }
  if (index % 17 === 0) {
    return 4;
  }
  return 6 + randomInteger(random, 18);
}

function createInstagramMessages(): GeneratedInstagramMessage[] {
  const random = createSeededRandom(FIXTURE_SEED);
  const drafts: MessageDraft[] = [];

  for (const thread of THREADS) {
    for (const sender of SENDERS) {
      const count = thread.senderCounts[sender] ?? 0;
      for (let index = 0; index < count; index += 1) {
        drafts.push({ thread, sender });
      }
    }
  }

  if (drafts.length !== TOTAL_INSTAGRAM_MESSAGES) {
    throw new Error(
      `Expected ${TOTAL_INSTAGRAM_MESSAGES} Instagram drafts, got ${drafts.length}.`,
    );
  }

  shuffle(drafts, random);

  // Burstiness across the full date span: spike days, quiet weeks, and
  // a few genuinely huge days — not 1–3 messages on every calendar day.
  const activeDays: number[] = [];
  for (let day = 0; day < INSTAGRAM_DATE_SPAN_DAYS; ) {
    const roll = random();
    if (roll < 0.2) {
      day += 4 + randomInteger(random, 10); // dead stretch
      continue;
    }
    activeDays.push(day);
    // Occasional multi-day streaks of activity.
    if (roll > 0.55) {
      const streak = 1 + randomInteger(random, 6);
      for (let s = 1; s <= streak && day + s < INSTAGRAM_DATE_SPAN_DAYS; s += 1) {
        activeDays.push(day + s);
      }
      day += streak + 1;
    } else {
      day += 1;
    }
  }
  if (activeDays.length === 0) {
    activeDays.push(0, Math.floor(INSTAGRAM_DATE_SPAN_DAYS / 2), INSTAGRAM_DATE_SPAN_DAYS - 1);
  }
  // Guarantee coverage of start and end so analytics span both years.
  if (activeDays[0] !== 0) {
    activeDays.unshift(0);
  }
  if (activeDays[activeDays.length - 1] !== INSTAGRAM_DATE_SPAN_DAYS - 1) {
    activeDays.push(INSTAGRAM_DATE_SPAN_DAYS - 1);
  }

  const dayOffsets: number[] = [];
  let remaining = TOTAL_INSTAGRAM_MESSAGES;
  for (let index = 0; index < activeDays.length; index += 1) {
    const daysLeft = activeDays.length - index;
    const roll = random();
    let count: number;
    if (roll < 0.05) {
      count = 50 + randomInteger(random, 80); // spike
    } else if (roll < 0.15) {
      count = 18 + randomInteger(random, 25); // busy
    } else if (roll < 0.55) {
      count = 1 + randomInteger(random, 3); // light
    } else {
      count = 4 + randomInteger(random, 9); // moderate
    }
    // Leave at least one message for each remaining active day.
    count = Math.min(count, Math.max(1, remaining - (daysLeft - 1)));
    for (let i = 0; i < count; i += 1) {
      dayOffsets.push(activeDays[index]);
    }
    remaining -= count;
  }
  while (remaining > 0) {
    const spikeDay = activeDays[randomInteger(random, activeDays.length)];
    dayOffsets.push(spikeDay);
    remaining -= 1;
  }
  dayOffsets.sort((a, b) => a - b);

  return drafts.map((draft, index) => {
    const dayOffset = dayOffsets[index] ?? 0;
    const hour = hourForMessage(index, random);
    const minute = randomInteger(random, 60);
    const second = randomInteger(random, 60);
    const timestampMs =
      INSTAGRAM_START_DATE_MS +
      dayOffset * DAY_IN_MS +
      hour * 3_600_000 +
      minute * 60_000 +
      second * 1_000;
    const hasPhoto = index % 50 === 0;
    const isMediaOnly = hasPhoto && index % 100 === 50;
    const cleanContent = isMediaOnly
      ? null
      : MESSAGE_TEMPLATES[randomInteger(random, MESSAGE_TEMPLATES.length)];
    const photoPath = hasPhoto
      ? `${INSTAGRAM_MESSAGES_ROOT}/${draft.thread.slug}/photos/photo_${String(
          index + 1,
        ).padStart(4, "0")}.jpg`
      : null;
    const raw: RawInstagramMessage = {
      sender_name: toInstagramMojibake(draft.sender),
      timestamp_ms: timestampMs,
    };

    if (cleanContent !== null) {
      raw.content = toInstagramMojibake(cleanContent);
    }
    if (photoPath !== null) {
      raw.photos = [
        {
          uri: photoPath,
          creation_timestamp: Math.floor(timestampMs / 1_000),
        },
      ];
    }

    return {
      threadSlug: draft.thread.slug,
      sender: draft.sender,
      timestampMs,
      cleanContent,
      photoPath,
      raw,
    };
  });
}

function createRelationship(
  username: string,
  title: string,
  timestampSec: number,
): {
  title: string;
  media_list_data: never[];
  string_list_data: {
    href: string;
    value: string;
    timestamp: number;
  }[];
} {
  return {
    title: toInstagramMojibake(title),
    media_list_data: [],
    string_list_data: [
      {
        href: `https://www.instagram.com/${username}`,
        value: username,
        timestamp: timestampSec,
      },
    ],
  };
}

function createInstagramStoryExtras(): InstagramStoryExtras {
  const mutualFollows: MutualFollowSpec[] = Array.from(
    { length: MUTUAL_FOLLOW_COUNT },
    (_, index) => {
      const padded = String(index + 1).padStart(2, "0");
      return {
        username: `mutual_friend_${padded}`,
        // Earlier of the two stamps is the mutual start.
        followerAtSec:
          Math.floor(Date.UTC(2022, 0, 1) / 1_000) + index * 86_400,
        followingAtSec:
          Math.floor(Date.UTC(2021, 6, 1) / 1_000) + index * 86_400,
      };
    },
  );

  const cringeTexts = [
    "omg this song is my whole personality rn",
    "لا تعليق بس كنت صغير على هذا",
    "follow for follow??",
    "first!!1",
    "ذكريات محرجة من زمان",
  ] as const;
  const recentCommentTexts = [
    "nice shot",
    "حلوة الصورة",
    "reclaim the timeline",
  ] as const;

  const comments: CommentSpec[] = [
    ...cringeTexts.map((text, index) => ({
      text,
      // 3–4 years before archive end (2024-12-31) → 2021 window
      occurredAtSec:
        Math.floor(Date.UTC(2021, index % 12, 5 + index) / 1_000) +
        index * 3_600,
    })),
    ...recentCommentTexts.map((text, index) => ({
      text,
      occurredAtSec:
        Math.floor(Date.UTC(2024, 2 + index, 10) / 1_000) + index * 60,
    })),
  ];

  const interests2023 = [
    "specialty coffee",
    "Indie films",
    "Arabic calligraphy",
    "hiking trails",
  ] as const;
  const interests2024 = [
    "privacy tools",
    "local-first software",
    "Jordan startups",
    "open source",
  ] as const;

  const interests: InterestSpec[] = [
    ...interests2023.map((topic, index) => ({
      topic,
      occurredAtSec: Math.floor(Date.UTC(2023, index + 1, 12) / 1_000),
    })),
    ...interests2024.map((topic, index) => ({
      topic,
      occurredAtSec: Math.floor(Date.UTC(2024, index + 1, 12) / 1_000),
    })),
  ];

  const profileChanges: ProfileChangeSpec[] = [
    {
      field: "username",
      value: "yousef_old",
      occurredAtSec: Math.floor(Date.UTC(2022, 0, 15) / 1_000),
    },
    {
      field: "bio",
      value: "طالب وجوال كثير",
      occurredAtSec: Math.floor(Date.UTC(2022, 5, 1) / 1_000),
    },
    {
      field: "username",
      value: "yousef_demo",
      occurredAtSec: Math.floor(Date.UTC(2023, 8, 20) / 1_000),
    },
    {
      field: "bio",
      value: "أرشيف محلي خاص — private and offline",
      occurredAtSec: Math.floor(Date.UTC(2024, 3, 10) / 1_000),
    },
  ];

  if (mutualFollows.length !== MUTUAL_FOLLOW_COUNT) {
    throw new Error(
      `Expected ${MUTUAL_FOLLOW_COUNT} mutual follows, got ${mutualFollows.length}.`,
    );
  }
  if (comments.length !== COMMENT_COUNT) {
    throw new Error(
      `Expected ${COMMENT_COUNT} comments, got ${comments.length}.`,
    );
  }
  if (cringeTexts.length !== CRINGE_COMMENT_COUNT) {
    throw new Error(
      `Expected ${CRINGE_COMMENT_COUNT} cringe comments, got ${cringeTexts.length}.`,
    );
  }
  if (interests2023.length !== INTEREST_COUNT_2023) {
    throw new Error(
      `Expected ${INTEREST_COUNT_2023} 2023 interests, got ${interests2023.length}.`,
    );
  }
  if (interests2024.length !== INTEREST_COUNT_2024) {
    throw new Error(
      `Expected ${INTEREST_COUNT_2024} 2024 interests, got ${interests2024.length}.`,
    );
  }
  if (profileChanges.length !== PROFILE_CHANGE_COUNT) {
    throw new Error(
      `Expected ${PROFILE_CHANGE_COUNT} profile changes, got ${profileChanges.length}.`,
    );
  }

  return { mutualFollows, comments, interests, profileChanges };
}

function createInstagramFixture(): InstagramFixture {
  const messages = createInstagramMessages();
  const story = createInstagramStoryExtras();
  const entries: ArchiveEntry[] = [];
  const pagination: Record<string, PaginationManifest> = {};

  for (const thread of THREADS) {
    const threadMessages = messages
      .filter((message) => message.threadSlug === thread.slug)
      .sort((left, right) => right.timestampMs - left.timestampMs);
    const messagesPerPage: number[] = [];

    for (
      let startIndex = 0, pageNumber = 1;
      startIndex < threadMessages.length;
      startIndex += thread.pageSize, pageNumber += 1
    ) {
      const pageMessages = threadMessages.slice(
        startIndex,
        startIndex + thread.pageSize,
      );
      messagesPerPage.push(pageMessages.length);
      entries.push({
        path: `${INSTAGRAM_MESSAGES_ROOT}/${thread.slug}/message_${pageNumber}.json`,
        data: serializeInstagramJson({
          participants: thread.participants.map((name) => ({
            name: toInstagramMojibake(name),
          })),
          messages: pageMessages.map((message) => message.raw),
          title: toInstagramMojibake(thread.title),
          thread_path: `inbox/${thread.slug}`,
        }),
      });
    }

    pagination[thread.slug] = {
      pageCount: messagesPerPage.length,
      messagesPerPage,
    };
  }

  for (const message of messages) {
    if (message.photoPath !== null) {
      entries.push({
        path: message.photoPath,
        data: TINY_JPEG,
      });
    }
  }

  const followerEntries = [
    ...story.mutualFollows.map((mutual, index) =>
      createRelationship(
        mutual.username,
        `صديق مشترك ${String(index + 1).padStart(2, "0")}`,
        mutual.followerAtSec,
      ),
    ),
    ...Array.from(
      { length: FOLLOWER_COUNT - MUTUAL_FOLLOW_COUNT },
      (_, index) => {
        const padded = String(index + 1).padStart(2, "0");
        return createRelationship(
          `follower_demo_${padded}`,
          `متابع تجريبي ${padded}`,
          Math.floor(Date.UTC(2024, 0, 1) / 1_000) + index * 86_400,
        );
      },
    ),
  ];
  const followingEntries = [
    ...story.mutualFollows.map((mutual, index) =>
      createRelationship(
        mutual.username,
        `متابَع مشترك ${String(index + 1).padStart(2, "0")}`,
        mutual.followingAtSec,
      ),
    ),
    ...Array.from(
      { length: FOLLOWING_COUNT - MUTUAL_FOLLOW_COUNT },
      (_, index) => {
        const padded = String(index + 1).padStart(2, "0");
        return createRelationship(
          `following_demo_${padded}`,
          `حساب متابَع ${padded}`,
          Math.floor(Date.UTC(2024, 0, 1) / 1_000) + index * 86_400,
        );
      },
    ),
  ];

  entries.push({
    path: "connections/followers_and_following/followers_1.json",
    data: serializeInstagramJson(followerEntries),
  });
  entries.push({
    path: "connections/followers_and_following/following.json",
    data: serializeInstagramJson({
      relationships_following: followingEntries,
    }),
  });
  entries.push({
    path: "your_instagram_activity/comments/post_comments_1.json",
    data: serializeInstagramJson(
      story.comments.map((comment, index) => ({
        title: toInstagramMojibake(`Post comment ${index + 1}`),
        string_list_data: [
          {
            href: `https://www.instagram.com/p/demo_${index + 1}/`,
            value: toInstagramMojibake(comment.text),
            timestamp: comment.occurredAtSec,
          },
        ],
      })),
    ),
  });
  entries.push({
    path: "ads_and_topics/ads_interests.json",
    data: serializeInstagramJson({
      inferred_data_ig_interest: story.interests.map((interest) => ({
        title: toInstagramMojibake(interest.topic),
        string_list_data: [
          {
            value: toInstagramMojibake(interest.topic),
            timestamp: interest.occurredAtSec,
          },
        ],
      })),
    }),
  });
  entries.push({
    path: "personal_information/profile_changes.json",
    data: serializeInstagramJson({
      profile_profile_change: story.profileChanges.map((change) => ({
        title: change.field === "username" ? "Username" : "Bio",
        string_map_data: {
          "Changed": {
            value: change.field === "username" ? "Username" : "Bio",
            timestamp: change.occurredAtSec,
          },
          "New Value": {
            value: toInstagramMojibake(change.value),
            timestamp: change.occurredAtSec,
          },
        },
      })),
    }),
  });
  entries.push({
    path: "personal_information/personal_information.json",
    data: serializeInstagramJson({
      profile_user: [
        {
          title: "Profile User",
          media_map_data: {},
          string_map_data: {
            Name: {
              href: "",
              value: toInstagramMojibake("يوسف التجريبي"),
              timestamp: 0,
            },
            Username: {
              href: "",
              value: "yousef_demo",
              timestamp: 0,
            },
            "Email Address": {
              href: "",
              value: "demo@example.invalid",
              timestamp: 0,
            },
            Bio: {
              href: "",
              value: toInstagramMojibake(
                "أرشيف محلي خاص — private and offline",
              ),
              timestamp: 0,
            },
          },
        },
      ],
    }),
  });

  return { entries, messages, pagination, story };
}

function countOccurrences(value: string, search: string): number {
  if (search.length === 0) {
    return 0;
  }
  return value.split(search).length - 1;
}

function createWhatsAppFixture(): WhatsAppFixture {
  const lines = [
    "[1/15/24, 10:32:07 PM] Lina: Hello from the archive.",
    "This iOS message continues on a second line.",
    "وهذا سطر عربي متابع.",
    "\u200e[1/16/24, 2:03:11 AM] أحمد: مرحبا من وقت متأخر\u200f",
    "[1/17/24, 3:12:00 AM] Lina: <Media omitted>",
    "[1/18/24, 9:00:00 AM] Messages and calls are end-to-end encrypted.",
    "[1/19/24, 11:00:00 AM] Voice call. Duration: 12:34",
    "15/01/2024, 22:32 - أحمد: مساء الخير من تنسيق أندرويد",
    "وهذه متابعة متعددة الأسطر.",
    "16/01/2024, 07:05 - Lina: image omitted",
    "\u200f17/01/2024, 08:15 - Yousef: Keep this private \u200eمحلياً",
    "18/01/2024, 10:00 - Lina changed the group description",
    "20/01/2024, 15:30 - Video call. Duration: 1:05",
  ];
  const chatText = `${lines.join("\n")}\n`;

  return {
    entries: [{ path: "_chat.txt", data: chatText }],
    manifest: {
      file: "demo-whatsapp.zip",
      entryCount: 1,
      chatFile: "_chat.txt",
      messageCount: 6,
      mediaCount: 2,
      eventCount: 4,
      callCount: 2,
      longestCallDurationSec: 12 * 60 + 34,
      messagesPerSender: {
        Lina: 3,
        أحمد: 2,
        Yousef: 1,
      },
      messagesPerFormat: {
        ios: 3,
        android: 3,
      },
      systemEventsPerFormat: {
        ios: 1,
        android: 1,
      },
      callEventsPerFormat: {
        ios: 1,
        android: 1,
      },
      continuationLineCount: 3,
      omittedMediaVariants: ["<Media omitted>", "image omitted"],
      rtlMarkCounts: {
        "U+200E": countOccurrences(chatText, "\u200e"),
        "U+200F": countOccurrences(chatText, "\u200f"),
      },
    },
  };
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function dateKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function calculateLongestStreak(
  sortedDates: readonly string[],
): StreakManifest {
  if (sortedDates.length === 0) {
    throw new Error("Cannot calculate a streak without active dates.");
  }

  let bestStart = sortedDates[0];
  let bestEnd = sortedDates[0];
  let bestLength = 1;
  let currentStart = sortedDates[0];
  let currentLength = 1;
  let previousDay = Date.parse(`${sortedDates[0]}T00:00:00.000Z`) / DAY_IN_MS;

  for (let index = 1; index < sortedDates.length; index += 1) {
    const currentDate = sortedDates[index];
    const currentDay =
      Date.parse(`${currentDate}T00:00:00.000Z`) / DAY_IN_MS;

    if (currentDay === previousDay + 1) {
      currentLength += 1;
    } else {
      currentStart = currentDate;
      currentLength = 1;
    }

    if (currentLength > bestLength) {
      bestLength = currentLength;
      bestStart = currentStart;
      bestEnd = currentDate;
    }
    previousDay = currentDay;
  }

  return {
    days: bestLength,
    startDate: bestStart,
    endDate: bestEnd,
  };
}

function buildInstagramManifest(
  fixture: InstagramFixture,
): FixtureManifest["instagram"] {
  const messagesPerThread: Record<string, number> = {};
  const messagesPerSender: Record<string, number> = {};
  const mediaPerThread: Record<string, number> = {};
  const dailyCounts = new Map<string, number>();
  const messagesByHourUtc = Array.from({ length: 24 }, () => 0);
  const selectedTerms = ["reclaim", "ذكريات", "photo"] as const;
  const selectedTermMessageHits: Record<string, number> = {};
  const selectedTermOccurrences: Record<string, number> = {};

  for (const term of selectedTerms) {
    selectedTermMessageHits[term] = 0;
    selectedTermOccurrences[term] = 0;
  }

  for (const message of fixture.messages) {
    incrementCount(messagesPerThread, message.threadSlug);
    incrementCount(messagesPerSender, message.sender);
    if (message.photoPath !== null) {
      incrementCount(mediaPerThread, message.threadSlug);
    }

    const date = dateKey(message.timestampMs);
    dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
    messagesByHourUtc[new Date(message.timestampMs).getUTCHours()] += 1;

    if (message.cleanContent !== null) {
      const normalizedContent = message.cleanContent.toLocaleLowerCase("en-US");
      for (const term of selectedTerms) {
        if (normalizedContent.includes(term)) {
          selectedTermMessageHits[term] += 1;
        }
        selectedTermOccurrences[term] += countOccurrences(
          normalizedContent,
          term,
        );
      }
    }
  }

  const messagesByTime = [...fixture.messages].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
  const firstMessage = messagesByTime[0];
  const lastMessage = messagesByTime.at(-1);
  if (firstMessage === undefined || lastMessage === undefined) {
    throw new Error("Instagram fixture must contain messages.");
  }

  const busiestDay = [...dailyCounts.entries()].sort(
    ([leftDate, leftCount], [rightDate, rightCount]) =>
      rightCount - leftCount || leftDate.localeCompare(rightDate),
  )[0];
  if (busiestDay === undefined) {
    throw new Error("Instagram fixture must contain an active day.");
  }

  const sortedActiveDates = [...dailyCounts.keys()].sort();
  const mediaCount = fixture.messages.filter(
    (message) => message.photoPath !== null,
  ).length;
  const messagesWithText = fixture.messages.filter(
    (message) => message.cleanContent !== null,
  ).length;

  const firstImageMessage = messagesByTime.find(
    (message) => message.photoPath !== null,
  );
  if (firstImageMessage?.photoPath === null || firstImageMessage === undefined) {
    throw new Error("Instagram fixture must contain at least one photo.");
  }

  const archiveEndMs = lastMessage.timestampMs;
  const cringeStartMs = archiveEndMs - 4 * 365.25 * DAY_IN_MS;
  const cringeEndMs = archiveEndMs - 3 * 365.25 * DAY_IN_MS;
  const nowMs = Date.UTC(2025, 0, 1);

  const commentCount = fixture.story.comments.length;
  const cringeComments = fixture.story.comments
    .filter((comment) => {
      const ms = comment.occurredAtSec * 1_000;
      return ms >= cringeStartMs && ms < cringeEndMs;
    })
    .map((comment) => ({
      text: comment.text,
      occurredAtMs: comment.occurredAtSec * 1_000,
    }))
    .sort((left, right) => left.occurredAtMs - right.occurredAtMs);

  const interestsByYearMap = new Map<number, string[]>();
  for (const interest of fixture.story.interests) {
    const year = new Date(interest.occurredAtSec * 1_000).getUTCFullYear();
    const topics = interestsByYearMap.get(year) ?? [];
    topics.push(interest.topic);
    interestsByYearMap.set(year, topics);
  }

  const longestMutualFollows = fixture.story.mutualFollows
    .map((mutual) => {
      const startedAtMs =
        Math.max(mutual.followerAtSec, mutual.followingAtSec) * 1_000;
      return {
        username: mutual.username,
        startedAtMs,
        durationSec: Math.floor((nowMs - startedAtMs) / 1_000),
      };
    })
    .sort(
      (left, right) =>
        right.durationSec - left.durationSec ||
        left.username.localeCompare(right.username),
    );

  const commentEvents = commentCount;
  const interestEvents = fixture.story.interests.length;
  const profileChangeEvents = fixture.story.profileChanges.length;
  const connectionEvents = FOLLOWER_COUNT + FOLLOWING_COUNT;

  return {
    file: "demo-instagram.zip",
    entryCount: fixture.entries.length,
    messageJsonEntryCount: Object.values(fixture.pagination).reduce(
      (total, thread) => total + thread.pageCount,
      0,
    ),
    messageCount: fixture.messages.length,
    messagesWithText,
    messagesWithoutText: fixture.messages.length - messagesWithText,
    threadCount: THREADS.length,
    senderCount: SENDERS.length,
    messagesPerThread,
    messagesPerSender,
    mediaCount,
    mediaPerThread,
    eventCount:
      connectionEvents + commentEvents + interestEvents + profileChangeEvents,
    eventsPerKind: {
      follower: FOLLOWER_COUNT,
      following: FOLLOWING_COUNT,
      comment: commentEvents,
      interest: interestEvents,
      profile_change: profileChangeEvents,
    },
    followersCount: FOLLOWER_COUNT,
    followingCount: FOLLOWING_COUNT,
    mutualFollowCount: MUTUAL_FOLLOW_COUNT,
    commentCount,
    cringeCommentCount: cringeComments.length,
    interestCount: interestEvents,
    profileChangeCount: profileChangeEvents,
    personalInformationEntryCount: 1,
    profileChangesEntryCount: 1,
    commentsEntryCount: 1,
    adsInterestsEntryCount: 1,
    pagination: fixture.pagination,
    analytics: {
      dateRange: {
        firstSentAtMs: firstMessage.timestampMs,
        lastSentAtMs: lastMessage.timestampMs,
        firstDate: dateKey(firstMessage.timestampMs),
        lastDate: dateKey(lastMessage.timestampMs),
      },
      firstMessage: {
        conversation: firstMessage.threadSlug,
        sender: firstMessage.sender,
        sentAtMs: firstMessage.timestampMs,
        text: firstMessage.cleanContent,
      },
      firstImageSent: {
        zipPath: firstImageMessage.photoPath,
        conversation: firstImageMessage.threadSlug,
        takenAtMs: firstImageMessage.timestampMs,
      },
      longestMutualFollows,
      cringeComments,
      interestsByYear: [...interestsByYearMap.entries()]
        .map(([year, topics]) => ({ year, topics }))
        .sort((left, right) => left.year - right.year),
      profileHistory: fixture.story.profileChanges.map((change) => ({
        field: change.field,
        value: change.value,
        occurredAtMs: change.occurredAtSec * 1_000,
      })),
      messagesByHourUtc,
      lateNightMessages0200To0459:
        messagesByHourUtc[2] + messagesByHourUtc[3] + messagesByHourUtc[4],
      twoToFourAmMessages: messagesByHourUtc[2] + messagesByHourUtc[3],
      threeAmMessages: messagesByHourUtc[3],
      activeDayCount: sortedActiveDates.length,
      busiestDay: {
        date: busiestDay[0],
        messages: busiestDay[1],
      },
      longestDailyActivityStreak:
        calculateLongestStreak(sortedActiveDates),
      topConversations: Object.entries(messagesPerThread)
        .map(([conversation, messages]) => ({ conversation, messages }))
        .sort(
          (left, right) =>
            right.messages - left.messages ||
            left.conversation.localeCompare(right.conversation),
        ),
      selectedTermMessageHits,
      selectedTermOccurrences,
    },
  };
}

async function writeArchive(
  destination: string,
  entries: readonly ArchiveEntry[],
): Promise<void> {
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output, {
    compressionMethod: 0,
    extendedTimestamp: false,
    level: 0,
    useCompressionStream: false,
    useWebWorkers: false,
  });

  for (const entry of [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )) {
    const reader =
      typeof entry.data === "string"
        ? new TextReader(entry.data)
        : new Uint8ArrayReader(entry.data);
    await writer.add(entry.path, reader, {
      compressionMethod: 0,
      extendedTimestamp: false,
      lastModDate: FIXED_ZIP_DATE,
      level: 0,
      useCompressionStream: false,
      useWebWorkers: false,
    });
  }

  const archive = await writer.close();
  await writeFile(destination, archive);
}

export async function generateFixtures(
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
): Promise<FixtureManifest> {
  const instagramFixture = createInstagramFixture();
  const whatsappFixture = createWhatsAppFixture();
  const manifest: FixtureManifest = {
    schemaVersion: 1,
    generator: {
      seed: FIXTURE_SEED,
      timezone: "UTC",
      zipEntryTimestamp: FIXED_ZIP_DATE.toISOString(),
    },
    instagram: buildInstagramManifest(instagramFixture),
    whatsapp: whatsappFixture.manifest,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeArchive(
    resolve(outputDirectory, manifest.instagram.file),
    instagramFixture.entries,
  );
  await writeArchive(
    resolve(outputDirectory, manifest.whatsapp.file),
    whatsappFixture.entries,
  );
  await writeFile(
    resolve(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

async function main(): Promise<void> {
  const manifest = await generateFixtures();
  console.log(
    `Generated ${manifest.instagram.file} (${manifest.instagram.entryCount} entries) and ${manifest.whatsapp.file} (${manifest.whatsapp.entryCount} entry).`,
  );
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  main().catch((error: unknown) => {
    console.error("Fixture generation failed.", error);
    process.exitCode = 1;
  });
}
