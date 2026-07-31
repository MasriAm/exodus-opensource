/**
 * Shared archive filter — always applied in SQL, never by filtering rows in React.
 */

export type ArchivePlatform = "instagram" | "whatsapp" | "facebook";

export type ArchiveFilter = {
  fromMs?: number | null;
  toMs?: number | null;
  platform?: string | null;
  conversation?: string | null;
  unifiedAliases?: { platform: string; conversation: string }[] | null;
};

export type SqlParameter = string | number | boolean | null;

export type SqlFragment = {
  clause: string;
  params: SqlParameter[];
};

function optionalBound(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Archive filter bounds must be finite numbers.");
  }
  return value;
}

export type NormalizedArchiveFilter = {
  fromMs: number | null;
  toMs: number | null;
  platform: string | null;
  conversation: string | null;
  unifiedAliases: { platform: string; conversation: string }[] | null;
};

export function normalizeArchiveFilter(
  raw?: ArchiveFilter | null,
): NormalizedArchiveFilter {
  const fromMs = optionalBound(raw?.fromMs ?? null);
  const toMs = optionalBound(raw?.toMs ?? null);
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new Error("fromMs must be before toMs.");
  }
  const platform =
    typeof raw?.platform === "string" && raw.platform.trim().length > 0
      ? raw.platform.trim().toLowerCase()
      : null;
  const conversation =
    typeof raw?.conversation === "string" && raw.conversation.trim().length > 0
      ? raw.conversation.trim()
      : null;
  const unifiedAliases =
    raw?.unifiedAliases && raw.unifiedAliases.length > 0
      ? raw.unifiedAliases
      : null;
  return { fromMs, toMs, platform, conversation, unifiedAliases };
}

export function isArchiveFilterActive(filter: ArchiveFilter | null | undefined): boolean {
  const normalized = normalizeArchiveFilter(filter);
  return (
    normalized.fromMs !== null ||
    normalized.toMs !== null ||
    normalized.platform !== null ||
    normalized.conversation !== null
  );
}

/** WHERE fragments for a messages-like table with sent_at / platform / conversation. */
export function messagesWhere(
  filter: ArchiveFilter | null | undefined,
  options?: { alias?: string; includeConversation?: boolean },
): SqlFragment {
  const normalized = normalizeArchiveFilter(filter);
  const col = (name: string) =>
    options?.alias ? `${options.alias}.${name}` : name;
  const parts: string[] = ["1 = 1"];
  const params: SqlParameter[] = [];

  if (normalized.platform !== null) {
    parts.push(`${col("platform")} = ?`);
    params.push(normalized.platform);
  }
  if (
    (options?.includeConversation ?? true) &&
    normalized.unifiedAliases !== null
  ) {
    const aliasParts = normalized.unifiedAliases.map(() => {
      return `(${col("platform")} = ? AND ${col("conversation")} = ?)`;
    });
    parts.push(`(${aliasParts.join(" OR ")})`);
    for (const alias of normalized.unifiedAliases) {
      params.push(alias.platform, alias.conversation);
    }
  } else if (
    (options?.includeConversation ?? true) &&
    normalized.conversation !== null
  ) {
    parts.push(`${col("conversation")} = ?`);
    params.push(normalized.conversation);
  }
  if (normalized.fromMs !== null) {
    parts.push(`${col("sent_at")} >= epoch_ms(CAST(? AS BIGINT))`);
    params.push(normalized.fromMs);
  }
  if (normalized.toMs !== null) {
    parts.push(`${col("sent_at")} < epoch_ms(CAST(? AS BIGINT))`);
    params.push(normalized.toMs);
  }

  return { clause: parts.join(" AND "), params };
}

/** Media table uses taken_at (nullable) — still filter platform/conversation/time. */
export function mediaWhere(
  filter: ArchiveFilter | null | undefined,
  options?: { alias?: string },
): SqlFragment {
  const normalized = normalizeArchiveFilter(filter);
  const col = (name: string) =>
    options?.alias ? `${options.alias}.${name}` : name;
  const parts: string[] = ["1 = 1"];
  const params: SqlParameter[] = [];

  if (normalized.platform !== null) {
    parts.push(`${col("platform")} = ?`);
    params.push(normalized.platform);
  }
  if (normalized.unifiedAliases !== null) {
    const aliasParts = normalized.unifiedAliases.map(() => {
      return `(${col("platform")} = ? AND ${col("conversation")} = ?)`;
    });
    parts.push(`(${aliasParts.join(" OR ")})`);
    for (const alias of normalized.unifiedAliases) {
      params.push(alias.platform, alias.conversation);
    }
  } else if (normalized.conversation !== null) {
    parts.push(`${col("conversation")} = ?`);
    params.push(normalized.conversation);
  }
  if (normalized.fromMs !== null) {
    parts.push(
      `(${col("taken_at")} IS NOT NULL AND ${col("taken_at")} >= epoch_ms(CAST(? AS BIGINT)))`,
    );
    params.push(normalized.fromMs);
  }
  if (normalized.toMs !== null) {
    parts.push(
      `(${col("taken_at")} IS NOT NULL AND ${col("taken_at")} < epoch_ms(CAST(? AS BIGINT)))`,
    );
    params.push(normalized.toMs);
  }

  return { clause: parts.join(" AND "), params };
}

/** Events use occurred_at; conversation may live in payload JSON. */
export function eventsWhere(
  filter: ArchiveFilter | null | undefined,
  options?: { alias?: string; conversationJsonPath?: string },
): SqlFragment {
  const normalized = normalizeArchiveFilter(filter);
  const col = (name: string) =>
    options?.alias ? `${options.alias}.${name}` : name;
  const parts: string[] = ["1 = 1"];
  const params: SqlParameter[] = [];

  if (normalized.platform !== null) {
    parts.push(`${col("platform")} = ?`);
    params.push(normalized.platform);
  }
  if (normalized.fromMs !== null) {
    parts.push(`${col("occurred_at")} >= epoch_ms(CAST(? AS BIGINT))`);
    params.push(normalized.fromMs);
  }
  if (normalized.toMs !== null) {
    parts.push(`${col("occurred_at")} < epoch_ms(CAST(? AS BIGINT))`);
    params.push(normalized.toMs);
  }
  if (normalized.unifiedAliases !== null && options?.conversationJsonPath) {
    const aliasParts = normalized.unifiedAliases.map(() => {
      return `(${col("platform")} = ? AND json_extract_string(${col("payload")}, '${options.conversationJsonPath}') = ?)`;
    });
    parts.push(`(${aliasParts.join(" OR ")})`);
    for (const alias of normalized.unifiedAliases) {
      params.push(alias.platform, alias.conversation);
    }
  } else if (normalized.conversation !== null && options?.conversationJsonPath) {
    parts.push(
      `json_extract_string(${col("payload")}, '${options.conversationJsonPath}') = ?`,
    );
    params.push(normalized.conversation);
  }

  return { clause: parts.join(" AND "), params };
}

export function yearBoundsMs(year: number): { fromMs: number; toMs: number } {
  return {
    fromMs: Date.UTC(year, 0, 1),
    toMs: Date.UTC(year + 1, 0, 1),
  };
}

export function mergeFilters(
  base?: ArchiveFilter | null,
  override?: ArchiveFilter | null,
): ArchiveFilter {
  const a = normalizeArchiveFilter(base);
  const b = normalizeArchiveFilter(override);
  return {
    fromMs: b.fromMs ?? a.fromMs,
    toMs: b.toMs ?? a.toMs,
    platform: b.platform ?? a.platform,
    conversation: b.conversation ?? a.conversation,
    unifiedAliases: b.unifiedAliases ?? a.unifiedAliases,
  };
}
