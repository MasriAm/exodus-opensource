import type { HTMLAttributes, ReactNode } from "react";

import { stripInstagramFolderId } from "@/lib/instagram-labels";
import { containsArabic } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

type UserTextProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  children: ReactNode;
  as?: "span" | "p" | "div" | "h3";
  /** Force body (serif) face — default when Arabic is detected. */
  forceBody?: boolean;
  /** Keep Instagram folder ids (`name_123…`). Off by default for handles. */
  keepFolderId?: boolean;
};

/**
 * Renders archive user strings with bidi isolation.
 * Arabic never gets mono / letter-spacing / uppercase (breaks cursive joining).
 */
export function UserText({
  children,
  className,
  as: Tag = "span",
  forceBody = false,
  keepFolderId = false,
  ...rest
}: UserTextProps) {
  const raw =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : null;
  const text =
    raw !== null && !keepFolderId ? stripInstagramFolderId(raw) : raw;
  const arabic = text !== null ? containsArabic(text) : forceBody;

  return (
    <Tag
      {...rest}
      dir="auto"
      className={cn(
        className,
        arabic
          ? "font-body tracking-normal normal-case [unicode-bidi:isolate]"
          : "[unicode-bidi:isolate]",
      )}
    >
      {text !== null ? <bdi>{text}</bdi> : children}
    </Tag>
  );
}
