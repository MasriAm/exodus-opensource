"use client";

import { MessageCircle } from "lucide-react";

import { ArchivePanel } from "@/components/dashboard/archive-panel";
import { PageControl } from "@/components/dashboard/page-control";
import { StatePanel } from "@/components/state-panel";
import { UserText } from "@/components/user-text";
import { displayConversationLabel } from "@/lib/instagram-labels";
import { formatDateTime, pluralize } from "@/lib/format";
import { isOutgoingSender, resolveSelfSender } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

export type ConversationItem = {
  platform: string;
  conversation: string;
  messageCount: number;
  lastMessageAt: number | string | Date;
  lastSnippet?: string | null;
};

export type MessageItem = {
  conversation: string;
  sender: string;
  sentAt: number | string | Date;
  text: string | null;
  mediaRef: string | null;
  platform: string;
};

type ThreadSender = {
  sender: string;
  messageCount: number;
};

type MessagesViewProps = {
  conversations: ConversationItem[];
  selectedConversation: string | null;
  messages: MessageItem[];
  threadSenders?: ThreadSender[];
  archiveSelfHint?: string | null;
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  owners: Record<string, string>;
  globalArchiveOwnerName: string | null;
  onSelectConversation: (conversation: string) => void;
  onChangePage: (page: number) => void;
};

/** Day separators follow the reader's local calendar, like the timestamps do. */
function dayKey(value: number | string | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: number | string | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function MessagesView({
  conversations,
  selectedConversation,
  messages,
  threadSenders = [],
  archiveSelfHint = null,
  loading,
  error,
  page,
  totalPages,
  owners,
  globalArchiveOwnerName,
  onSelectConversation,
  onChangePage,
}: MessagesViewProps) {
  if (error) {
    return (
      <StatePanel
        kind="error"
        title="Messages could not be loaded"
        description={error}
      />
    );
  }

  if (!loading && conversations.length === 0) {
    return (
      <StatePanel
        title="No messages match"
        description="No conversations fit these filters. Reset them or import an archive from the home page."
      />
    );
  }

  const selectedMeta = conversations.find(
    (entry) => entry.conversation === selectedConversation,
  );
  const selfSender =
    selectedConversation !== null
      ? resolveSelfSender(selectedConversation, threadSenders, archiveSelfHint)
      : null;

  return (
    <div className="space-y-5">
      <p className="font-body text-[15px] font-medium leading-7 text-ink/85">
        Pick a thread on the left. Incoming sits left on paper; your replies sit
        right in ink.
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <ArchivePanel
          title="Conversation index"
          subtitle="Thread count for this filter. Names in the list are people you wrote with."
          bodyClassName="!p-0"
        >
          <div className="border-b border-ink/20 px-4 py-2">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-ink/60">
              {pluralize(conversations.length, "thread")} total
            </p>
          </div>
          <div className="flex max-h-44 overflow-auto lg:max-h-[min(55vh,28rem)] lg:block">
            {conversations.map((conversation) => (
              <button
                key={`${conversation.platform}:${conversation.conversation}`}
                type="button"
                onClick={() => onSelectConversation(conversation.conversation)}
                className={cn(
                  "flex min-w-[12rem] flex-col gap-1 border-b border-ink/20 px-4 py-3 text-start transition-colors lg:min-w-0 lg:w-full",
                  selectedConversation === conversation.conversation
                    ? "bg-teal-wash"
                    : "hover:bg-paper/80",
                )}
              >
                <UserText className="block truncate font-body text-sm font-semibold text-ink">
                  {conversation.conversation}
                </UserText>
                <UserText className="block truncate font-body text-[13px] text-ink/70">
                  {conversation.lastSnippet ?? "No text preview"}
                </UserText>
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-ink/65">
                  {pluralize(conversation.messageCount, "message")}
                </span>
              </button>
            ))}
          </div>
        </ArchivePanel>

        <ArchivePanel
          title={
            selectedConversation
              ? `DMs: ${displayConversationLabel(selectedConversation)}`
              : "Choose a conversation"
          }
          subtitle={
            selectedMeta
              ? `${pluralize(selectedMeta.messageCount, "message")} in this thread · ${page} of ${totalPages}`
              : "Select a thread to browse its messages."
          }
          bodyClassName={cn(
            "flex flex-col !p-0",
            messages.length <= 6
              ? "min-h-[14rem]"
              : messages.length <= 12
                ? "min-h-[18rem]"
                : "min-h-[22rem]",
            "max-h-[min(62vh,32rem)]",
          )}
        >
          {loading ? (
            <StatePanel
              kind="loading"
              title="Reading messages"
              description="The worker is loading this page from the local database."
              className="m-4 flex-1"
            />
          ) : selectedConversation === null ? (
            <StatePanel
              icon={MessageCircle}
              title="Choose a conversation"
              description="Select a thread to browse its messages."
              className="m-4 flex-1"
            />
          ) : messages.length === 0 ? (
            <StatePanel
              title="This page is empty"
              description="No supported messages on this page."
              className="m-4 flex-1"
            />
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-auto px-3 py-3 sm:px-4">
                {messages.map((message, index) => {
                  const previous = index > 0 ? messages[index - 1] : null;
                  const showDay =
                    !previous ||
                    dayKey(previous.sentAt) !== dayKey(message.sentAt);
                  const outgoing = isOutgoingSender(
                    message.sender,
                    selectedConversation,
                    threadSenders,
                    selfSender,
                    archiveSelfHint,
                    owners[message.platform],
                  );

                  return (
                    <div key={`${String(message.sentAt)}-${message.sender}-${index}`}>
                      {showDay ? (
                        <div className="my-3 flex items-center gap-3">
                          <span className="h-px flex-1 bg-ink/25" />
                          <span className="shrink-0 font-display text-[10px] font-bold uppercase tracking-[0.1em] text-ink/70">
                            {dayLabel(message.sentAt)}
                          </span>
                          <span className="h-px flex-1 bg-ink/25" />
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "flex",
                          outgoing ? "justify-end" : "justify-start",
                        )}
                      >
                        <article
                          className={cn(
                            "max-w-[min(100%,28rem)] border-2 border-ink px-3 py-2.5 shadow-panel",
                            outgoing
                              ? "bg-ink text-cream"
                              : "bg-paper text-ink",
                          )}
                        >
                          <UserText
                            className={cn(
                              "block font-body text-[11px] font-semibold",
                              outgoing ? "text-cream/85" : "text-teal",
                            )}
                          >
                            {message.sender}
                          </UserText>
                          {message.text ? (
                            <UserText
                              as="p"
                              className={cn(
                                "mt-1 whitespace-pre-wrap break-words font-body text-[15px] font-medium leading-6",
                                outgoing ? "text-cream" : "text-ink",
                              )}
                            >
                              {message.text}
                            </UserText>
                          ) : (
                            <p
                              className={cn(
                                "mt-1 font-body text-sm",
                                outgoing ? "text-cream/80" : "text-ink/75",
                              )}
                            >
                              Media attachment
                            </p>
                          )}
                          <time
                            dateTime={new Date(message.sentAt).toISOString()}
                            className={cn(
                              "mt-2 block font-display text-[10px] font-bold uppercase tracking-[0.08em]",
                              outgoing ? "text-cream/70" : "text-ink/60",
                            )}
                          >
                            {formatDateTime(message.sentAt)}
                          </time>
                        </article>
                      </div>
                    </div>
                  );
                })}
              </div>
              <PageControl
                page={page}
                totalPages={totalPages}
                onChange={onChangePage}
                disabled={loading}
              />
            </>
          )}
        </ArchivePanel>
      </div>
    </div>
  );
}
