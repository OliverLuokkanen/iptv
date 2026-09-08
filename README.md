# iptv

Express.js IPTV app with a lightweight web frontend, SQLite storage, JWT authentication, M3U playlist generation, EPG data, and Docker support.

## Features

- Channel CRUD (`/api/channels`, `/api/channels/:id`)
- JWT-based user registration and login
- Static web UI served from `/` for login, channel management, EPG browsing, and HLS playback
- M3U playlist generation for IPTV clients
- Simple EPG endpoint with channel schedule data
- Stream redirect endpoint for HLS/DASH-compatible source URLs
- SQLite database with automatic sample data seeding
- Dockerfile and docker-compose setup

## Requirements

- Node.js 22+
- npm 10+

## Setup

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the service:

   ```bash
   npm start
   ```

The app starts on `http://localhost:3000` by default. After startup, open `http://localhost:3000/` in a browser to use the web UI.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `DATABASE_PATH` | `./data/iptv.sqlite` | SQLite database location |
| `JWT_SECRET` | `development-secret` | JWT signing key |
| `SEED_SAMPLE_DATA` | `true` | Seed example channels and EPG rows |

## Authentication

Register a user:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"secret123"}'
```

Login:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"secret123"}'
```

Use the returned JWT in an `Authorization` header as a bearer token for protected endpoints.

## Web frontend

The frontend is served as static files by the existing Express server, so no separate build step is required.

- Visit `http://localhost:3000/` after `npm start`
- Or start with Docker and open the same URL after `docker compose up --build`
- Register or log in to store the JWT in the browser and unlock the protected API-backed views
- Browse channels, add/edit/delete channels, inspect EPG entries, and launch HLS playback directly in the page

## API overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/channels`
- `POST /api/channels`
- `GET /api/channels/:id`
- `PUT /api/channels/:id`
- `DELETE /api/channels/:id`
- `GET /api/playlist`
- `GET /api/epg`
- `GET /api/stream/:channelId`

### Example channel payload

```json
{
  "name": "My Channel",
  "url": "https://example.com/live/channel.m3u8",
  "category": "News",
  "logo": "https://example.com/logo.png",
  "tvgId": "my-channel"
}
```

## Playlist and streaming

`GET /api/playlist` returns a valid M3U playlist with `tvg-id`, `tvg-name`, `tvg-logo`, and group metadata. When called with a bearer token, the generated stream URLs embed that token as a query parameter so players such as VLC or Kodi can access `/api/stream/:channelId`.

`GET /api/stream/:channelId` redirects the client to the stored channel source URL, which keeps HLS (`.m3u8`) and DASH (`.mpd`) sources compatible with standard IPTV players.

## EPG

`GET /api/epg` returns program schedule data. You can filter by channel with `GET /api/epg?channelId=1`.

## Sample data

Run the seed command manually if needed:

```bash
npm run seed
```

When the database is empty and `SEED_SAMPLE_DATA=true`, the application seeds example channels and EPG programs automatically on startup.

## Tests

Run the API tests:

```bash
npm test
```

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```
