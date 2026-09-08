/**
 * The drama lexicon.
 *
 * Each category is a bag of weighted phrases. Weight is "how much does this
 * phrase alone prove something happened here" — `whatever` is suggestive (1),
 * `we need to talk` is a confession of intent (4). Scoring sums the weights of
 * every phrase that fires, so a message stacking three signals outranks one
 * that got lucky with a single common word.
 *
 * Both scripts are covered because the archive owners this is built for text in
 * a mix of English and Arabic, often in the same sentence.
 */

import type { EvidenceCategory, EvidenceCategoryId } from "./types";

export interface LexiconPhrase {
  phrase: string;
  weight: number;
}

const ARABIC_RANGE = /[؀-ۿݐ-ݿ]/u;

/** True when a phrase should be matched as a substring rather than by word boundary. */
export function isArabicPhrase(phrase: string): boolean {
  return ARABIC_RANGE.test(phrase);
}

/**
 * Fold a message down to something matchable: lowercase, Arabic orthography
 * normalized (alef/ya/ta-marbuta variants collapse), diacritics and
 * zero-width joiners dropped, whitespace collapsed.
 */
export function normalizeForMatch(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[ً-ْٰـ]/gu, "")
    .replace(/[​-‏‪-‮⁦-⁩﻿]/gu, "")
    .replace(/[آأإٱ]/gu, "ا")
    .replace(/ة/gu, "ه")
    .replace(/[ى]/gu, "ي")
    .replace(/[’‘`´]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

export const EVIDENCE_CATEGORIES: readonly EvidenceCategory[] = [
  {
    id: "argument",
    label: "The Fight",
    blurb: "Receipts from a conversation that stopped being a conversation.",
    emoji: "🔥",
    tone: "hot",
  },
  {
    id: "exit",
    label: "The Exit",
    blurb: "The messages where somebody decided they were done.",
    emoji: "🚪",
    tone: "violet",
  },
  {
    id: "confession",
    label: "The Confession",
    blurb: "Things said out loud that were meant to stay in your head.",
    emoji: "💗",
    tone: "hot",
  },
  {
    id: "secret",
    label: "The Secret",
    blurb: "Whatever was supposed to stay between you two.",
    emoji: "🤐",
    tone: "ice",
  },
  {
    id: "apology",
    label: "The Grovel",
    blurb: "Sorry, in every tense and register you own.",
    emoji: "🙏",
    tone: "amber",
  },
  {
    id: "latenight",
    label: "The 3AM",
    blurb: "Nothing good has ever been typed at this hour.",
    emoji: "🌙",
    tone: "violet",
  },
  {
    id: "ghost",
    label: "The Ghost",
    blurb: "Sent. Delivered. Never spoken of again.",
    emoji: "👻",
    tone: "ice",
  },
  {
    id: "tea",
    label: "The Tea",
    blurb: "Somebody was being discussed, and it wasn't you.",
    emoji: "👀",
    tone: "acid",
  },
  {
    id: "ick",
    label: "The Ick",
    blurb: "Vocabulary from an era you'd rather not be reminded of.",
    emoji: "💀",
    tone: "acid",
  },
] as const;

export const CATEGORY_BY_ID: ReadonlyMap<EvidenceCategoryId, EvidenceCategory> =
  new Map(EVIDENCE_CATEGORIES.map((category) => [category.id, category]));

function phrases(
  weight: number,
  ...values: readonly string[]
): LexiconPhrase[] {
  return values.map((phrase) => ({ phrase: normalizeForMatch(phrase), weight }));
}

export const DRAMA_LEXICON: Readonly<
  Record<EvidenceCategoryId, readonly LexiconPhrase[]>
> = {
  argument: [
    ...phrases(
      4,
      "i'm done with you",
      "im done with you",
      "don't text me",
      "dont text me",
      "leave me alone",
      "block me",
      "stop lying to me",
      "you're a liar",
      "youre a liar",
      "i'm not doing this again",
    ),
    ...phrases(
      3,
      "you always",
      "you never",
      "are you serious",
      "that's not what i said",
      "thats not what i said",
      "you lied",
      "stop lying",
      "grow up",
      "i'm done",
      "im done",
      "forget it",
      "don't bother",
      "dont bother",
    ),
    ...phrases(
      2,
      "whatever",
      "wow ok",
      "wow okay",
      "calm down",
      "unbelievable",
      "typical",
      "i don't care",
      "i dont care",
      "you don't get it",
      "you dont get it",
      "seriously",
      "obviously",
      "sure jan",
    ),
    ...phrases(
      3,
      "خلاص",
      "ما بدي احكي",
      "انت دايما",
      "انتي دايما",
      "كذاب",
      "كذابه",
      "اتركني",
      "لا تحكيني",
      "ما بهمني",
    ),
  ],
  exit: [
    ...phrases(
      5,
      "we need to talk",
      "i can't do this anymore",
      "i cant do this anymore",
      "it's over",
      "its over",
      "lose my number",
      "don't contact me",
      "dont contact me",
      "i'm blocking you",
      "im blocking you",
      "delete my number",
    ),
    ...phrases(
      3,
      "i think we should",
      "this isn't working",
      "this isnt working",
      "i can't do this",
      "i cant do this",
      "for the last time",
      "i'm moving on",
      "im moving on",
      "we're better as",
      "were better as",
      "i need space",
    ),
    ...phrases(4, "بدنا نحكي", "ما فيني كمل", "خلصنا", "انتهى الموضوع"),
  ],
  confession: [
    ...phrases(
      5,
      "i've never told anyone",
      "ive never told anyone",
      "i need to tell you something",
      "i can't stop thinking about you",
      "i cant stop thinking about you",
      "i had a crush on you",
      "i shouldn't be saying this",
      "i shouldnt be saying this",
    ),
    ...phrases(
      4,
      "i love you",
      "i like you",
      "i miss you",
      "i've missed you",
      "ive missed you",
      "do you like me",
      "i still think about",
      "you're the only one",
      "youre the only one",
    ),
    ...phrases(
      2,
      "thinking about you",
      "you make me",
      "i'm scared to",
      "im scared to",
      "don't laugh but",
      "dont laugh but",
      "promise not to laugh",
    ),
    ...phrases(4, "بحبك", "اشتقتلك", "بفكر فيك", "بفكر فيكي", "ما بقدر انساك"),
  ],
  secret: [
    ...phrases(
      5,
      "don't tell anyone",
      "dont tell anyone",
      "swear you won't tell",
      "swear you wont tell",
      "this stays between us",
      "keep this between us",
      "nobody knows this",
      "no one knows this",
      "delete this chat",
      "burn after reading",
    ),
    ...phrases(
      3,
      "don't tell",
      "dont tell",
      "between us",
      "delete this",
      "promise you won't",
      "promise you wont",
      "off the record",
      "you can't say anything",
      "you cant say anything",
      "not a word to",
    ),
    ...phrases(4, "لا تحكي لحدا", "بيني وبينك", "لا تقول لحدا", "احذف"),
  ],
  apology: [
    ...phrases(
      4,
      "i'm so sorry",
      "im so sorry",
      "please forgive me",
      "i messed up",
      "i was wrong",
      "it won't happen again",
      "it wont happen again",
      "please talk to me",
    ),
    ...phrases(
      3,
      "i'm sorry",
      "im sorry",
      "i apologize",
      "i didn't mean",
      "i didnt mean",
      "forgive me",
      "please don't be mad",
      "please dont be mad",
      "please answer me",
    ),
    ...phrases(1, "my bad", "sorry"),
    ...phrases(3, "اسف", "اسفه", "سامحني", "غلطان", "غلطانه", "ما قصدت"),
  ],
  latenight: [
    ...phrases(
      4,
      "are you awake",
      "why am i awake",
      "i'm outside",
      "im outside",
      "come over",
      "can you come over",
    ),
    ...phrases(
      3,
      "u up",
      "you up",
      "can't sleep",
      "cant sleep",
      "still awake",
      "it's 3am",
      "its 3am",
      "it's 4am",
      "its 4am",
    ),
    ...phrases(1, "wyd", "what are you doing"),
    ...phrases(3, "صاحي", "صاحيه", "ما بقدر نام", "لسا صاحي"),
  ],
  ghost: [
    ...phrases(
      4,
      "why are you ignoring me",
      "are you ignoring me",
      "you left me on read",
      "i'll take that as a no",
      "ill take that as a no",
      "still waiting",
      "answer me",
    ),
    ...phrases(
      2,
      "you there",
      "u there",
      "hello???",
      "did you see my",
      "guess not",
      "ok then",
      "no reply",
      "did you get my",
    ),
    ...phrases(3, "وينك", "ليش ما بترد", "ما بترد", "ردي علي"),
  ],
  tea: [
    ...phrases(
      4,
      "you'll never guess",
      "youll never guess",
      "behind your back",
      "she's talking about you",
      "shes talking about you",
      "he's talking about you",
      "hes talking about you",
      "don't tell her i told you",
      "dont tell her i told you",
    ),
    ...phrases(
      3,
      "did you hear",
      "guess who",
      "i heard that",
      "wait what happened",
      "spill",
      "i knew it",
      "apparently",
      "screenshot",
    ),
    ...phrases(1, "she said", "he said", "they said", "no way"),
    ...phrases(3, "سمعت", "خمن مين", "بحكوا", "شو صار"),
  ],
  ick: [
    ...phrases(
      4,
      "on fleek",
      "netflix and chill",
      "squad goals",
      "amazeballs",
      "cray cray",
      "totes",
      "yolo",
      "rawr",
      "sksksk",
      "and i oop",
    ),
    ...phrases(
      3,
      "swag",
      "bae",
      "adulting",
      "turnt",
      "uwu",
      "hbu",
      "ttyl",
      "asl",
      "vsco",
      "periodt",
      "living my best life",
    ),
    ...phrases(
      2,
      "xd",
      "no cap",
      "lit af",
      "vibe check",
      "same energy",
      "i can't even",
      "i cant even",
      "i'm deceased",
      "im deceased",
      "sheesh",
      "bussin",
      "rizz",
    ),
  ],
};

/** Categories whose evidence only counts inside the archive's early era. */
export const ERA_LOCKED_CATEGORIES: ReadonlySet<EvidenceCategoryId> = new Set([
  "ick",
]);

/** Fraction of the archive timeline that counts as "the old days" for The Ick. */
export const ERA_LOCK_FRACTION = 0.4;
