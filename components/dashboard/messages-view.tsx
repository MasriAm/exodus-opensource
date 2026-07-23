import { MessageCircle, Paperclip } from "lucide-react";

import { StatePanel } from "@/components/state-panel";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ConversationItem = {
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
};

type MessagesViewProps = {
  conversations: ConversationItem[];
  selectedConversation: string | null;
  messages: MessageItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onSelectConversation: (conversation: string) => void;
  onLoadMore: () => void;
};

export function MessagesView({
  conversations,
  selectedConversation,
  messages,
  loading,
  error,
  hasMore,
  onSelectConversation,
  onLoadMore,
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

  return (
    <div className="space-y-4">
      <p className="font-body text-[15px] leading-7 text-body">
        Browse every thread as a quiet ledger — pick a conversation, then scroll
        the messages.
      </p>

      <div className="grid min-h-[28rem] gap-0 border border-ink/20 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <aside className="border-b border-ink/20 lg:border-b-0 lg:border-e">
          <div className="border-b border-ink/20 px-3 py-3">
            <p className="meta-caps text-[11px] text-body">
              {formatNumber(conversations.length)} threads
            </p>
          </div>
          <div className="flex max-h-56 gap-0 overflow-auto lg:max-h-[min(70vh,40rem)] lg:block">
            {conversations.map((conversation) => (
              <button
                key={conversation.conversation}
                type="button"
                onClick={() => onSelectConversation(conversation.conversation)}
                className={cn(
                  "flex min-w-[12rem] flex-col gap-1 border-b border-ink/20 px-3 py-3 text-start transition-colors duration-150 lg:min-w-0 lg:w-full",
                  selectedConversation === conversation.conversation
                    ? "bg-teal-wash"
                    : "hover:bg-teal-wash",
                )}
              >
                <span
                  dir="auto"
                  className="block truncate font-display text-xs text-ink"
                >
                  {conversation.conversation}
                </span>
                <span
                  dir="auto"
                  className="block truncate font-body text-[13px] text-body"
                >
                  {conversation.lastSnippet ?? "No text preview"}
                </span>
                <span className="meta-caps text-[10px] text-body">
                  {formatNumber(conversation.messageCount)} messages
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="border-b border-ink/20 px-4 py-3">
            <h2
              dir="auto"
              className="truncate font-display text-[15px] font-bold text-ink"
            >
              {selectedConversation ?? "Choose a conversation"}
            </h2>
            {selectedConversation ? (
              <p className="mt-0.5 font-body text-[13px] text-body">
                Messages stay on this device. Scroll up for earlier ones.
              </p>
            ) : null}
          </div>

          {loading ? (
            <StatePanel
              kind="loading"
              title="Reading messages"
              description="The worker is loading this conversation from the local database."
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
              title="This conversation is empty"
              description="No supported messages were found in this thread."
              className="m-4 flex-1"
            />
          ) : (
            <div className="flex-1 overflow-auto px-2 py-2 sm:px-4">
              {hasMore ? (
                <div className="mb-2 text-center">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="font-display text-[11px] uppercase tracking-[0.08em] text-teal hover:underline"
                  >
                    Load earlier messages
                  </button>
                </div>
              ) : null}
              <ol>
                {messages.map((message, index) => (
                  <li
                    key={`${String(message.sentAt)}-${message.sender}-${index}`}
                    className="border-b border-ink/20 px-2 py-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span
                        dir="auto"
                        className="font-display text-xs text-teal"
                      >
                        {message.sender}
                      </span>
                      <time
                        dateTime={new Date(message.sentAt).toISOString()}
                        className="meta-caps text-[10px] text-body"
                      >
                        {formatDateTime(message.sentAt)}
                      </time>
                    </div>
                    {message.text ? (
                      <p
                        dir="auto"
                        className="mt-1.5 whitespace-pre-wrap break-words font-body text-[15px] leading-6 text-ink"
                      >
                        {message.text}
                      </p>
                    ) : (
                      <p className="mt-1.5 inline-flex items-center gap-2 font-body text-sm text-body">
                        <Paperclip aria-hidden="true" className="size-3.5" />
                        Media attachment
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
