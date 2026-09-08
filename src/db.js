const fs = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function openDatabase(databasePath) {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });

  return open({
    filename: databasePath,
    driver: sqlite3.Database,
  });
}

async function createSchema(db) {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      logo TEXT,
      tvg_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS epg_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );
  `);
}

async function seedDatabase(db) {
  const { count: channelCount } = await db.get('SELECT COUNT(*) AS count FROM channels');

  if (channelCount === 0) {
    await db.run(
      `
        INSERT INTO channels (name, url, category, logo, tvg_id)
        VALUES
          (?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?)
      `,
      [
        'Demo News',
        'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        'News',
        'https://via.placeholder.com/128x128.png?text=News',
        'demo-news',
        'Demo Sports',
        'https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd',
        'Sports',
        'https://via.placeholder.com/128x128.png?text=Sports',
        'demo-sports',
      ],
    );
  }

  const { count: epgCount } = await db.get('SELECT COUNT(*) AS count FROM epg_programs');

  if (epgCount === 0) {
    const channels = await db.all('SELECT id, name FROM channels ORDER BY id LIMIT 2');
    const start = new Date();
    start.setMinutes(0, 0, 0);

    for (let index = 0; index < channels.length; index += 1) {
      const channel = channels[index];
      const programStart = new Date(start.getTime() + index * 60 * 60 * 1000);
      const programEnd = new Date(programStart.getTime() + 60 * 60 * 1000);

      await db.run(
        `
          INSERT INTO epg_programs (channel_id, title, description, start_time, end_time)
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          channel.id,
          `${channel.name} Hour`,
          `Scheduled programming block for ${channel.name}.`,
          programStart.toISOString(),
          programEnd.toISOString(),
        ],
      );
    }
  }
}

async function initDatabase({ databasePath, seedSampleData }) {
  const db = await openDatabase(databasePath);
  await createSchema(db);

  if (seedSampleData) {
    await seedDatabase(db);
  }

  return db;
}

module.exports = {
  initDatabase,
};
