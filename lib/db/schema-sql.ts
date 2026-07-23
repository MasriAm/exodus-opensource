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
