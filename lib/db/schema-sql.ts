export const INITIALIZATION_SQL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS messages (
    platform VARCHAR NOT NULL,
    conversation VARCHAR NOT NULL,
    sender VARCHAR NOT NULL,
    sent_at TIMESTAMP NOT NULL,
    text VARCHAR,
    media_ref VARCHAR
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    platform VARCHAR NOT NULL,
    zip_path VARCHAR NOT NULL,
    kind VARCHAR NOT NULL,
    taken_at TIMESTAMP,
    conversation VARCHAR
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    platform VARCHAR NOT NULL,
    kind VARCHAR NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    payload VARCHAR NOT NULL
  )`,
];

export const BEGIN_ARCHIVE_REPLACEMENT_SQL = "BEGIN TRANSACTION";

export const CLEAR_ARCHIVE_SQL: readonly string[] = [
  "DELETE FROM messages",
  "DELETE FROM media",
  "DELETE FROM events",
];

export const COMMIT_ARCHIVE_REPLACEMENT_SQL = "COMMIT";
export const ROLLBACK_ARCHIVE_REPLACEMENT_SQL = "ROLLBACK";

/** Run after a successful ingest commit — not inside the replace transaction. */
export const POST_INGEST_INDEX_SQL: readonly string[] = [
  "CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages (sent_at)",
  "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation)",
  "CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages (platform)",
  "CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent ON messages (conversation, sent_at)",
  "CREATE INDEX IF NOT EXISTS idx_media_conversation ON media (conversation)",
  "CREATE INDEX IF NOT EXISTS idx_media_taken_at ON media (taken_at)",
  "CREATE INDEX IF NOT EXISTS idx_events_kind_occurred ON events (kind, occurred_at)",
  "CREATE INDEX IF NOT EXISTS idx_events_occurred ON events (occurred_at)",
];
