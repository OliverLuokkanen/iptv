const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { authenticateRequest, extractToken, hashPassword, signToken, verifyPassword } = require('./auth');
const { createConfig } = require('./config');
const { initDatabase } = require('./db');

function normalizeChannel(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    category: row.category,
    logo: row.logo,
    tvgId: row.tvg_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProgram(row) {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

function escapeM3uAttribute(value) {
  return String(value ?? '').replace(/"/g, '&quot;');
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateChannelPayload(payload, { partial = false } = {}) {
  const data = {};

  if (!partial || payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      return { error: 'Channel name is required' };
    }

    data.name = payload.name.trim();
  }

  if (!partial || payload.url !== undefined) {
    if (typeof payload.url !== 'string' || !payload.url.trim()) {
      return { error: 'Channel URL is required' };
    }

    try {
      // eslint-disable-next-line no-new
      new URL(payload.url);
    } catch (error) {
      return { error: 'Channel URL must be a valid absolute URL' };
    }

    data.url = payload.url.trim();
  }

  if (payload.category !== undefined) {
    data.category = String(payload.category || '').trim() || 'General';
  } else if (!partial) {
    data.category = 'General';
  }

  if (payload.logo !== undefined) {
    data.logo = payload.logo ? String(payload.logo).trim() : null;
  } else if (!partial) {
    data.logo = null;
  }

  if (payload.tvgId !== undefined) {
    data.tvgId = payload.tvgId ? String(payload.tvgId).trim() : null;
  } else if (!partial) {
    data.tvgId = null;
  }

  if (partial && Object.keys(data).length === 0) {
    return { error: 'At least one channel field must be provided' };
  }

  return { data };
}

async function createApp(overrides = {}) {
  const config = createConfig(overrides);
  const db = await initDatabase(config);
  const app = express();
  const requireAuth = authenticateRequest(config.jwtSecret);
  const apiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
  const authRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
  });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', apiRateLimit);
  app.use('/api/auth', authRateLimit);
  app.locals.config = config;
  app.locals.db = db;

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!username || password.length < 6) {
        return res.status(400).json({
          error: 'Username and a password with at least 6 characters are required',
        });
      }

      const existingUser = await db.get('SELECT id FROM users WHERE username = ?', [username]);

      if (existingUser) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const passwordHash = await hashPassword(password);
      const result = await db.run(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        [username, passwordHash],
      );

      const token = signToken({ id: result.lastID, username }, config.jwtSecret);

      return res.status(201).json({
        token,
        user: {
          id: result.lastID,
          username,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const user = await db.get(
        'SELECT id, username, password_hash FROM users WHERE username = ?',
        [username],
      );

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = signToken({ id: user.id, username: user.username }, config.jwtSecret);

      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/channels', requireAuth, async (_req, res, next) => {
    try {
      const channels = await db.all('SELECT * FROM channels ORDER BY name');
      res.json({ channels: channels.map(normalizeChannel) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/channels', requireAuth, async (req, res, next) => {
    try {
      const { error, data } = validateChannelPayload(req.body || {});

      if (error) {
        return res.status(400).json({ error });
      }

      const result = await db.run(
        `
          INSERT INTO channels (name, url, category, logo, tvg_id, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [data.name, data.url, data.category, data.logo, data.tvgId],
      );

      const channel = await db.get('SELECT * FROM channels WHERE id = ?', [result.lastID]);
      return res.status(201).json({ channel: normalizeChannel(channel) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/channels/:id', requireAuth, async (req, res, next) => {
    try {
      const channelId = parsePositiveInteger(req.params.id);

      if (!channelId) {
        return res.status(400).json({ error: 'Invalid channel id' });
      }

      const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);

      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      return res.json({ channel: normalizeChannel(channel) });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/channels/:id', requireAuth, async (req, res, next) => {
    try {
      const channelId = parsePositiveInteger(req.params.id);

      if (!channelId) {
        return res.status(400).json({ error: 'Invalid channel id' });
      }

      const existingChannel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);

      if (!existingChannel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const { error, data } = validateChannelPayload(req.body || {}, { partial: true });

      if (error) {
        return res.status(400).json({ error });
      }

      await db.run(
        `
          UPDATE channels
          SET
            name = ?,
            url = ?,
            category = ?,
            logo = ?,
            tvg_id = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          Object.hasOwn(data, 'name') ? data.name : existingChannel.name,
          Object.hasOwn(data, 'url') ? data.url : existingChannel.url,
          Object.hasOwn(data, 'category') ? data.category : existingChannel.category,
          Object.hasOwn(data, 'logo') ? data.logo : existingChannel.logo,
          Object.hasOwn(data, 'tvgId') ? data.tvgId : existingChannel.tvg_id,
          channelId,
        ],
      );

      const updatedChannel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
      return res.json({ channel: normalizeChannel(updatedChannel) });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/channels/:id', requireAuth, async (req, res, next) => {
    try {
      const channelId = parsePositiveInteger(req.params.id);

      if (!channelId) {
        return res.status(400).json({ error: 'Invalid channel id' });
      }

      const result = await db.run('DELETE FROM channels WHERE id = ?', [channelId]);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/playlist', requireAuth, async (req, res, next) => {
    try {
      const channels = await db.all('SELECT * FROM channels ORDER BY name');
      const baseUrl = config.baseUrl ?? `${req.protocol}://${req.get('host')}`;
      const token = extractToken(req);

      const lines = ['#EXTM3U'];

      for (const channel of channels) {
        const tvgId = channel.tvg_id || `channel-${channel.id}`;
        const groupTitle = channel.category || 'General';
        const query = token ? `?token=${encodeURIComponent(token)}` : '';

        lines.push(
          `#EXTINF:-1 tvg-id="${escapeM3uAttribute(tvgId)}" tvg-name="${escapeM3uAttribute(channel.name)}" tvg-logo="${escapeM3uAttribute(channel.logo || '')}" group-title="${escapeM3uAttribute(groupTitle)}",${channel.name}`,
        );
        lines.push(`${baseUrl}/api/stream/${channel.id}${query}`);
      }

      return res.type('application/x-mpegURL').send(`${lines.join('\n')}\n`);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/epg', requireAuth, async (req, res, next) => {
    try {
      const channelId = req.query.channelId ? parsePositiveInteger(req.query.channelId) : null;
      const params = [];
      let query = `
        SELECT
          epg_programs.*,
          channels.name AS channel_name
        FROM epg_programs
        INNER JOIN channels ON channels.id = epg_programs.channel_id
      `;

      if (req.query.channelId) {
        if (!channelId) {
          return res.status(400).json({ error: 'Invalid channelId filter' });
        }

        query += ' WHERE epg_programs.channel_id = ?';
        params.push(channelId);
      }

      query += ' ORDER BY epg_programs.start_time';

      const programs = await db.all(query, params);
      return res.json({
        programs: programs.map(normalizeProgram),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/stream/:channelId', requireAuth, async (req, res, next) => {
    try {
      const channelId = parsePositiveInteger(req.params.channelId);

      if (!channelId) {
        return res.status(400).json({ error: 'Invalid channel id' });
      }

      const channel = await db.get('SELECT url FROM channels WHERE id = ?', [channelId]);

      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      return res.redirect(302, channel.url);
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = {
  createApp,
};
