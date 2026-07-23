"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { CapsuleCard } from "@/components/capsule/card";
import { Mark } from "@/components/capsule/mark";
import { PressButton } from "@/components/capsule/press-button";
import { Receipt } from "@/components/capsule/receipt";
import { SlideTitle } from "@/components/capsule/slide-title";
import { StackedCards } from "@/components/capsule/stacked-cards";
import { TagBox } from "@/components/capsule/tag-box";
import { VintagePhoto } from "@/components/capsule/vintage-photo";
import { YearSlider } from "@/components/capsule/year-slider";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/format";
import {
  FALLBACK_LOADING_CAPTIONS,
  loadLoadingCaptions,
  pickCaption,
  type InteractiveStates,
} from "@/lib/loading-captions";
import { cn } from "@/lib/utils";

export type WrappedDeckData = {
  totalMessages: number;
  totalMedia: number;
  activeFromMs: number | null;
  activeToMs: number | null;
  topContacts: Array<{ conversation: string; count: number }>;
  messagesByHour: Array<{ hour: number; count: number }>;
  peakHour: number | null;
  threeAmEraMessages: number;
  topWords: Array<{ word: string; count: number }>;
  firstMessage: {
    text: string | null;
    sentAtMs: number;
    conversation: string;
  } | null;
  longestStreakDays: number;
  longestMutualFollows: Array<{
    username: string;
    startedAtMs: number;
    durationSec: number;
  }>;
  longestConversation: { conversation: string; count: number } | null;
  mostTypedWord: { word: string; count: number } | null;
  longestCall: {
    media: "voice" | "video";
    durationSec: number;
    conversation: string;
    occurredAtMs: number;
  } | null;
  cringeComments: Array<{ text: string; occurredAtMs: number }>;
  interestsByYear: Array<{ year: number; topics: string[] }>;
  profileHistory: Array<{
    field: "username" | "bio";
    value: string;
    occurredAtMs: number;
  }>;
  oldestImages: Array<{
    zipPath: string;
    conversation: string;
    takenAtMs: number | null;
  }>;
};

type WrappedDeckProps = {
  data: WrappedDeckData | null;
  loading: boolean;
  error: string | null;
  readMediaBlob: (zipPath: string) => Promise<Blob>;
};

type SlideDefinition = {
  id: string;
  render: () => ReactNode;
};

function formatFriendlyDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) {
    return months > 0
      ? `${years} YEARS, ${months} MONTHS`
      : `${years} YEARS`;
  }
  if (months > 0) {
    return `${months} MONTHS`;
  }
  return `${Math.max(1, days)} DAYS`;
}

function formatCallDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function yearsSpanned(fromMs: number | null, toMs: number | null): number {
  if (fromMs === null || toMs === null || toMs <= fromMs) {
    return 1;
  }
  return Math.max(1, Math.round((toMs - fromMs) / (365.25 * 86_400_000)));
}

function CountUp({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (latest) =>
    formatNumber(Math.round(latest)),
  );
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 1.1,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [motionValue, reduceMotion, value]);

  return <motion.span>{rounded}</motion.span>;
}

function ArtifactPhoto({
  zipPath,
  readMediaBlob,
}: {
  zipPath: string;
  readMediaBlob: (zipPath: string) => Promise<Blob>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    setUrl(null);
    setFailed(false);
    void readMediaBlob(zipPath)
      .then((blob) => {
        const next = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(next);
          return;
        }
        created = next;
        setUrl(next);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
      if (created) {
        URL.revokeObjectURL(created);
      }
    };
  }, [zipPath, readMediaBlob]);

  return (
    <VintagePhoto className="mx-auto max-w-sm">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Archive photo" className="target-photo max-h-80 w-full" />
      ) : (
        <p className="p-10 font-body text-sm text-body">
          {failed ? "Could not read this photo." : "Loading…"}
        </p>
      )}
    </VintagePhoto>
  );
}

function SlideShell({
  children,
  subline,
}: {
  children: ReactNode;
  subline?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="mx-auto flex w-full max-w-3xl flex-col justify-center px-4 py-6 sm:min-h-full sm:px-8 sm:py-10"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {subline ? (
        <motion.p
          className="mb-6 max-w-2xl font-body text-base leading-7 text-body sm:mb-8 sm:text-lg"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.06, duration: 0.3 }}
        >
          {subline}
        </motion.p>
      ) : null}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.3 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function WrappedDeck({
  data,
  loading,
  error,
  readMediaBlob,
}: WrappedDeckProps) {
  const router = useRouter();
  const goDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);
  const [index, setIndex] = useState(0);
  const [cringeIndex, setCringeIndex] = useState(0);
  const [cringePromptIndex, setCringePromptIndex] = useState(0);
  const [cringeRevealed, setCringeRevealed] = useState(false);
  const [identitiesOpen, setIdentitiesOpen] = useState(false);
  const [interestYear, setInterestYear] = useState<number | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [artifactPromptIndex, setArtifactPromptIndex] = useState(0);
  const [interactive, setInteractive] = useState<InteractiveStates>(
    FALLBACK_LOADING_CAPTIONS.interactive,
  );
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    void loadLoadingCaptions().then((loaded) => {
      if (active) {
        setInteractive(loaded.interactive);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const interestYears = useMemo(
    () => data?.interestsByYear.map((row) => row.year) ?? [],
    [data],
  );

  useEffect(() => {
    if (interestYears.length > 0 && interestYear === null) {
      setInterestYear(interestYears[interestYears.length - 1]);
    }
  }, [interestYear, interestYears]);

  const slides = useMemo((): SlideDefinition[] => {
    if (!data || data.totalMessages === 0) {
      return [];
    }

    const built: SlideDefinition[] = [
      {
        id: "opening",
        render: () => (
          <SlideShell>
            <p className="font-display text-sm tracking-[0.08em] text-body">
              YOUR TIME CAPSULE
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                { label: "Messages", value: data.totalMessages },
                { label: "Media", value: data.totalMedia },
                {
                  label: "Years",
                  value: yearsSpanned(data.activeFromMs, data.activeToMs),
                },
              ].map((stat) => (
                <CapsuleCard key={stat.label} className="p-6 text-center">
                  <p className="font-display text-4xl font-bold text-ink">
                    <CountUp value={stat.value} />
                  </p>
                  <p className="meta-caps mt-3">{stat.label}</p>
                </CapsuleCard>
              ))}
            </div>
          </SlideShell>
        ),
      },
    ];

    if (data.longestMutualFollows.length > 0) {
      built.push({
        id: "real-ones",
        render: () => (
          <SlideShell subline="People you have been friends for the longest">
            <SlideTitle accent="teal">The Real Ones</SlideTitle>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-center">
              {data.longestMutualFollows.map((mutual, mutualIndex) => (
                <CapsuleCard
                  key={mutual.username}
                  className={cn(
                    "w-full max-w-xs p-5",
                    mutualIndex === 1 && "sm:-translate-y-4",
                  )}
                >
                  <p className="font-display text-lg font-bold text-ink" dir="auto">
                    @{mutual.username}
                  </p>
                  <p className="meta-caps mt-4">
                    Friends since: {formatDate(mutual.startedAtMs)}
                  </p>
                  <p className="meta-caps mt-2 text-teal">
                    {formatFriendlyDuration(mutual.durationSec)}
                  </p>
                </CapsuleCard>
              ))}
            </div>
          </SlideShell>
        ),
      });
    }

    if (data.longestConversation || data.mostTypedWord || data.longestCall) {
      const handle = data.longestConversation?.conversation ?? "someone";
      built.push({
        id: "chat-era",
        render: () => (
          <SlideShell
            subline={
              <>
                In this archive, you couldn&apos;t stop talking to{" "}
                <Mark variant="dark">{handle}</Mark>.
              </>
            }
          >
            <SlideTitle accent="ink">The Chat Era</SlideTitle>
            <Receipt
              className="mt-8"
              title="Chat history"
              rows={[
                ...(data.longestConversation
                  ? [
                      {
                        label: "Total messages",
                        value: formatNumber(data.longestConversation.count),
                      },
                    ]
                  : []),
                ...(data.longestCall
                  ? [
                      {
                        label: "Longest call",
                        value: formatCallDuration(data.longestCall.durationSec),
                      },
                    ]
                  : []),
                ...(data.mostTypedWord
                  ? [
                      {
                        label: "Most typed word",
                        value: (
                          <span dir="auto">{data.mostTypedWord.word}</span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </SlideShell>
        ),
      });
    }

    if (data.cringeComments.length > 0) {
      const comment =
        data.cringeComments[cringeIndex % data.cringeComments.length];
      const yearsAgo = Math.max(
        1,
        Math.floor(
          (Date.now() - comment.occurredAtMs) / (365.25 * 86_400_000),
        ),
      );
      const cringePrompt = pickCaption(
        interactive.cringePrompts,
        cringePromptIndex,
        FALLBACK_LOADING_CAPTIONS.interactive.cringePrompts[0],
      );
      built.push({
        id: "cringe",
        render: () => (
          <SlideShell subline={cringePrompt}>
            <SlideTitle accent="coral">Cringe Warning</SlideTitle>
            <p className="meta-caps mt-3 text-[11px] text-body">
              On this day {yearsAgo} years ago ·{" "}
              <Mark>{formatDate(comment.occurredAtMs)}</Mark>
            </p>
            <div className="group relative mt-8 overflow-hidden border-strong bg-cream">
              <p
                dir="auto"
                className="min-h-24 p-6 font-body text-lg leading-8 text-ink"
              >
                “{comment.text}”
              </p>
              <button
                type="button"
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-slate font-display text-sm tracking-[0.08em] text-cream transition-opacity",
                  "opacity-100 group-hover:opacity-0 focus-visible:opacity-0",
                  cringeRevealed && "pointer-events-none opacity-0",
                )}
                onClick={() => setCringeRevealed(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setCringeRevealed(true);
                  }
                }}
              >
                Hover to reveal
              </button>
            </div>
            <PressButton
              className="mt-6"
              onClick={() => {
                setCringeRevealed(false);
                setCringeIndex((value) => value + 1);
                setCringePromptIndex((value) => value + 1);
              }}
            >
              Another one
            </PressButton>
          </SlideShell>
        ),
      });
    }

    if (data.profileHistory.length > 0) {
      const bioChanges = data.profileHistory.filter(
        (row) => row.field === "bio",
      ).length;
      const newest = data.profileHistory[data.profileHistory.length - 1];
      built.push({
        id: "identity",
        render: () => (
          <SlideShell
            subline={`You've changed your bio ${formatNumber(Math.max(1, bioChanges))} times. Click your current ID card to uncover your past digital identities.`}
          >
            <SlideTitle accent="slate">The Identity Crisis</SlideTitle>
            {!identitiesOpen ? (
              <button
                type="button"
                className="mt-8 w-full max-w-md text-start"
                onClick={() => setIdentitiesOpen(true)}
              >
                <StackedCards>
                  <div className="space-y-3 p-5">
                    <p className="meta-caps">Username</p>
                    <p className="font-display text-xl font-bold" dir="auto">
                      {data.profileHistory.find((row) => row.field === "username")
                        ?.value ?? newest.value}
                    </p>
                    <p className="meta-caps pt-2">Bio</p>
                    <p className="font-body text-sm leading-6 text-body" dir="auto">
                      {data.profileHistory.find((row) => row.field === "bio")
                        ?.value ?? "—"}
                    </p>
                    <p className="meta-caps pt-2">
                      Year {new Date(newest.occurredAtMs).getUTCFullYear()}
                    </p>
                  </div>
                </StackedCards>
              </button>
            ) : (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[...data.profileHistory].reverse().map((change) => (
                  <CapsuleCard
                    key={`${change.occurredAtMs}-${change.field}-${change.value}`}
                    className="p-4"
                  >
                    <p className="meta-caps">
                      {change.field} · {formatDate(change.occurredAtMs)}
                    </p>
                    <p className="mt-2 font-display text-base font-bold" dir="auto">
                      {change.value}
                    </p>
                  </CapsuleCard>
                ))}
              </div>
            )}
          </SlideShell>
        ),
      });
    }

    if (data.interestsByYear.length > 0 && interestYear !== null) {
      const topics =
        data.interestsByYear.find((row) => row.year === interestYear)
          ?.topics ?? [];
      built.push({
        id: "interests",
        render: () => (
          <SlideShell subline="The algorithm thought you were interested in">
            <SlideTitle accent="slate">Your Interests</SlideTitle>
            <div className="mt-8 flex flex-wrap gap-2">
              <AnimatePresence mode="popLayout">
                {topics.map((topic) => (
                  <motion.div
                    key={`${interestYear}-${topic}`}
                    layout
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
                  >
                    <TagBox>{topic}</TagBox>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <YearSlider
              className="mt-10"
              years={interestYears}
              value={interestYear}
              onChange={setInterestYear}
            />
          </SlideShell>
        ),
      });
    }

    if (data.oldestImages.length > 0) {
      const image =
        data.oldestImages[photoIndex % data.oldestImages.length];
      const artifactPrompt = pickCaption(
        interactive.artifactPrompts,
        artifactPromptIndex,
        FALLBACK_LOADING_CAPTIONS.interactive.artifactPrompts[0],
      );
      built.push({
        id: "artifact",
        render: () => (
          <SlideShell subline={artifactPrompt}>
            <SlideTitle accent="ink">The Artifact</SlideTitle>
            <div className="mt-8 flex flex-col items-center">
              <ArtifactPhoto
                zipPath={image.zipPath}
                readMediaBlob={readMediaBlob}
              />
              <p className="meta-caps mt-4">
                <span dir="auto">{image.conversation}</span>
                {image.takenAtMs
                  ? ` · ${formatDate(image.takenAtMs)}`
                  : null}
              </p>
              <p className="mt-2 font-body text-sm text-body">
                Hover over the photo to see the original.
              </p>
              {data.oldestImages.length > 1 ? (
                <PressButton
                  className="mt-6"
                  onClick={() => {
                    setPhotoIndex((value) => value + 1);
                    setArtifactPromptIndex((value) => value + 1);
                  }}
                >
                  Another one
                </PressButton>
              ) : null}
            </div>
          </SlideShell>
        ),
      });
    }

    if (data.threeAmEraMessages > 0) {
      const peak = Math.max(...data.messagesByHour.map((row) => row.count), 1);
      built.push({
        id: "3am",
        render: () => (
          <SlideShell
            subline={
              <>
                {formatNumber(data.threeAmEraMessages)} messages between 2–4am
                {data.peakHour !== null ? (
                  <>
                    {" "}
                    — peak at <Mark>{String(data.peakHour).padStart(2, "0")}:00</Mark>
                  </>
                ) : null}
              </>
            }
          >
            <SlideTitle accent="coral">The 3am Era</SlideTitle>
            <CapsuleCard className="mt-8 h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.messagesByHour}>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--ink)"
                    strokeOpacity={0.15}
                  />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(hour: number) => `${hour}`}
                    tick={{ fill: "var(--body)", fontSize: 11, fontFamily: "Lora" }}
                    axisLine={{ stroke: "var(--ink)" }}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis hide domain={[0, peak]} />
                  <Bar
                    dataKey="count"
                    isAnimationActive={!reduceMotion}
                  >
                    {data.messagesByHour.map((entry) => (
                      <Cell
                        key={entry.hour}
                        fill={
                          entry.hour === data.peakHour
                            ? "var(--coral)"
                            : "var(--teal)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CapsuleCard>
          </SlideShell>
        ),
      });
    }

    if (data.topWords.length > 0) {
      const maxCount = data.topWords[0]?.count ?? 1;
      built.push({
        id: "words",
        render: () => (
          <SlideShell subline="Words that kept coming back">
            <SlideTitle accent="teal">Words You Overused</SlideTitle>
            <div className="mt-8 flex flex-wrap items-end justify-center gap-3">
              {data.topWords.slice(0, 16).map((word, wordIndex) => {
                const scale = 0.85 + (word.count / maxCount) * 0.55;
                return (
                  <TagBox
                    key={word.word}
                    inverted={wordIndex === 0}
                    style={{ fontSize: `${scale}rem` }}
                  >
                    {word.word}
                  </TagBox>
                );
              })}
            </div>
          </SlideShell>
        ),
      });
    }

    if (data.firstMessage) {
      built.push({
        id: "started",
        render: () => (
          <SlideShell>
            <SlideTitle accent="ink">Where It All Started</SlideTitle>
            <p className="mt-4 font-body text-body">
              <Mark>{formatDate(data.firstMessage!.sentAtMs)}</Mark>
            </p>
            <Receipt
              className="mt-8"
              title="First message"
              rows={[
                {
                  label: "Conversation",
                  value: (
                    <span dir="auto">{data.firstMessage!.conversation}</span>
                  ),
                },
                {
                  label: "Text",
                  value: (
                    <span dir="auto">
                      {data.firstMessage!.text ?? "Media attachment"}
                    </span>
                  ),
                },
              ]}
            />
          </SlideShell>
        ),
      });
    }

    built.push({
      id: "finale",
      render: () => (
        <SlideShell subline="Your archive stays on this device. The dashboard is ready whenever you want the numbers again.">
          <SlideTitle accent="teal">That&apos;s a wrap</SlideTitle>
          <p className="mt-6 max-w-xl font-body text-base leading-7 text-body sm:text-lg">
            {formatNumber(data.totalMessages)} messages,{" "}
            {formatNumber(data.totalMedia)} media — privately counted.
          </p>
          <PressButton className="mt-10 px-6 py-3 text-base" onClick={goDashboard}>
            Finish → Go to dashboard
          </PressButton>
        </SlideShell>
      ),
    });

    return built;
  }, [
    artifactPromptIndex,
    cringeIndex,
    cringePromptIndex,
    cringeRevealed,
    data,
    goDashboard,
    identitiesOpen,
    interactive,
    interestYear,
    interestYears,
    photoIndex,
    readMediaBlob,
    reduceMotion,
  ]);

  const go = useCallback(
    (next: number) => {
      if (slides.length === 0) {
        return;
      }
      setIndex((current) => {
        const target = current + next;
        if (target < 0) {
          return 0;
        }
        if (target >= slides.length) {
          return slides.length - 1;
        }
        return target;
      });
    },
    [slides.length],
  );

  useEffect(() => {
    setIndex(0);
  }, [data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        go(1);
      }
      if (event.key === "ArrowLeft") {
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const touchStartX = useRef<number | null>(null);

  const onTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) {
      return;
    }
    const end = event.changedTouches[0]?.clientX;
    if (end === undefined) {
      return;
    }
    const delta = end - start;
    if (Math.abs(delta) < 48) {
      return;
    }
    go(delta < 0 ? 1 : -1);
  };

  if (error) {
    return (
      <main className="min-h-screen bg-paper p-5 sm:p-8">
        <StatePanel
          kind="error"
          title="Your Wrapped could not be calculated"
          description={error}
          action={
            <PressButton type="button" onClick={goDashboard}>
              Skip to dashboard
            </PressButton>
          }
        />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-paper p-5 sm:p-8">
        <StatePanel
          kind="loading"
          title="Developing your time capsule"
          description="Your Wrapped is being calculated locally."
        />
      </main>
    );
  }

  if (!data || data.totalMessages === 0 || slides.length === 0) {
    return (
      <main className="min-h-screen bg-paper p-5 sm:p-8">
        <StatePanel
          title="Nothing to wrap yet"
          description="Import an archive with messages, then return for your private recap."
          action={<ButtonLink href="/">Import an archive</ButtonLink>}
        />
      </main>
    );
  }

  const safeIndex = Math.min(index, slides.length - 1);
  const current = slides[safeIndex];

  const navButtonClass =
    "inline-flex min-h-12 min-w-[7.25rem] items-center justify-center border-strong bg-cream px-4 font-mono text-base font-bold tracking-[0.04em] text-ink shadow-press transition-[transform,box-shadow] enabled:hover:bg-receipt enabled:active:translate-x-0.5 enabled:active:translate-y-0.5 enabled:active:shadow-[2px_2px_0_var(--ink)] disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none sm:min-h-[3.25rem] sm:min-w-[8.5rem] sm:px-5 sm:text-lg";

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <header className="relative z-20 mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Go to slide ${slideIndex + 1}`}
              aria-current={slideIndex === safeIndex}
              className={cn(
                "size-2.5 shrink-0 rounded-full border border-ink transition",
                slideIndex === safeIndex ? "bg-ink" : "bg-transparent",
              )}
              onClick={() => setIndex(slideIndex)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={goDashboard}
          className="shrink-0 font-mono text-xs tracking-[0.02em] text-body underline underline-offset-4"
        >
          Skip to dashboard
        </button>
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          aria-label="Previous slide"
          className="absolute inset-y-0 left-0 z-[5] hidden w-12 cursor-w-resize bg-transparent sm:block"
          onClick={() => go(-1)}
          disabled={safeIndex === 0}
        />
        <button
          type="button"
          aria-label="Next slide"
          className="absolute inset-y-0 right-0 z-[5] hidden w-12 cursor-e-resize bg-transparent sm:block"
          onClick={() => go(1)}
          disabled={safeIndex >= slides.length - 1}
        />

        <div className="relative z-10 min-h-full">
          <AnimatePresence mode="wait">
            <div key={current.id}>{current.render()}</div>
          </AnimatePresence>
        </div>
      </div>

      <nav
        aria-label="Slide navigation"
        className="relative z-20 mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 border-t border-ink/20 bg-paper px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-4"
      >
        <button
          type="button"
          className={navButtonClass}
          onClick={() => go(-1)}
          disabled={safeIndex === 0}
        >
          ← Prev
        </button>
        <p className="font-mono text-xs tracking-[0.08em] text-body sm:text-sm">
          {safeIndex + 1} / {slides.length}
        </p>
        <button
          type="button"
          className={navButtonClass}
          onClick={() => go(1)}
          disabled={safeIndex >= slides.length - 1}
        >
          Next →
        </button>
      </nav>
    </main>
  );
}
