import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      budget TEXT,
      event_date TEXT,
      drawn INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      gives_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (group_id, name)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exclusions (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      a INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      b INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (a, b)
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT,
      image TEXT,
      price TEXT,
      site TEXT,
      note TEXT,
      reserved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wishes_member ON wishes(member_id);
  `);
  return db;
}
