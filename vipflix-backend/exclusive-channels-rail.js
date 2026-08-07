/**
 * Exclusive Channels for the VIPFLIX Home page.
 *
 * Same admin/data model as Exclusive Events (Sports), but:
 *   - Admin UI:  http://YOUR_HOST:3000/admin/channels
 *   - JSON API:  /api/custom-channels  (data/custom-channels.json)
 *   - Home rail: "Exclusive Channels" injected into /api/home
 *
 * Install in server.js AFTER `const app = express()` / body parsers,
 * and BEFORE your `/api/home` route (so the Home rail inject can wrap res.json):
 *
 *   const path = require('path');
 *   const { installExclusiveChannels } = require('./exclusive-channels-rail');
 *   installExclusiveChannels(app, {
 *     dataPath: path.join(__dirname, 'data', 'custom-channels.json')
 *   });
 *
 * Admin: http://YOUR_HOST:3000/admin/channels
 */

const path = require('path');
const {
  readCustomChannels,
  writeCustomChannels,
  renderAdminChannelsPage
} = require('./admin-channels');

let applyExclusiveStatus = null;
try {
  applyExclusiveStatus = require('./exclusive-live-labels').applyExclusiveStatus;
} catch (err) {
  applyExclusiveStatus = null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Convert America/New_York wall date+HH:mm to epoch ms. */
function easternWallTimeToMs(dateStr, timeStr) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
  const ymd = String(dateStr || '').trim();
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;

  const hh = pad2(Number(m[1]));
  const mm = pad2(Number(m[2]));

  for (let i = 0; i < 2; i++) {
    const offset = i === 0 ? '-04:00' : '-05:00';
    const ms = Date.parse(ymd + 'T' + hh + ':' + mm + ':00' + offset);
    if (!Number.isFinite(ms)) continue;

    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      });
      const parts = {};
      fmt.formatToParts(new Date(ms)).forEach(function (p) {
        if (p.type !== 'literal') parts[p.type] = p.value;
      });
      const gotDate = parts.year + '-' + parts.month + '-' + parts.day;
      const gotTime = parts.hour + ':' + parts.minute;
      if (gotDate === ymd && gotTime === hh + ':' + mm) return ms;
    } catch (err) {
      // fall through
    }
  }

  return Date.parse(ymd + 'T' + hh + ':' + mm + ':00-04:00');
}

function channelToHomeItem(ch, nowMs) {
  const color = String(ch.color || '').trim() || '#1a1a2e';
  const durationHours = Number(ch.durationHours);
  const dur = Number.isFinite(durationHours) && durationHours > 0 ? durationHours : 7;
  const startMs = easternWallTimeToMs(ch.date, ch.time);
  const endMs = Number.isFinite(startMs) ? startMs + dur * 3600000 : null;

  let item = {
    title: ch.title || 'Untitled',
    league: ch.league || '',
    date: ch.date || '',
    time: ch.time || '',
    thumb: ch.thumbnail || '',
    streamId: ch.channel_id != null ? String(ch.channel_id) : '',
    startTimeMs: startMs,
    endTimeMs: endMs,
    isLive: false,
    hasLiveStatus: true,
    homeColor: color,
    awayColor: color,
    durationHours: dur,
    description: ch.description || '',
    isSportsEvent: true,
    requiresAssignedChannel: !ch.channel_id
  };

  if (applyExclusiveStatus && Number.isFinite(startMs)) {
    item = applyExclusiveStatus(item, nowMs);
  }

  return item;
}

function buildExclusiveChannelsRail(dataPath, nowMs) {
  const raw = readCustomChannels(dataPath).filter(function (ch) {
    return ch && ch.enabled !== false;
  });
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    title: 'Exclusive Channels',
    type: 'featured',
    items: raw.map(function (ch) {
      return channelToHomeItem(ch, now);
    })
  };
}

function injectExclusiveChannelsRail(body, dataPath, nowMs) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.rails)) return body;

  const rail = buildExclusiveChannelsRail(dataPath, nowMs);
  const rails = body.rails.filter(function (r) {
    const title = String((r && r.title) || '').toLowerCase();
    return title !== 'exclusive channels';
  });

  // Put Exclusive Channels at the top of Home.
  rails.unshift(rail);
  return Object.assign({}, body, { rails: rails });
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    if (
      req.body !== undefined &&
      req.body !== null &&
      typeof req.body === 'object' &&
      !Buffer.isBuffer(req.body)
    ) {
      resolve(req.body);
      return;
    }

    var raw = '';
    req.on('data', function (chunk) {
      raw += chunk;
    });
    req.on('end', function () {
      if (!raw) {
        resolve([]);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {import('express').Express} app
 * @param {{ dataPath?: string, adminPath?: string, apiPath?: string }} [options]
 */
function installExclusiveChannels(app, options) {
  if (!app || typeof app.get !== 'function') {
    throw new Error('installExclusiveChannels(app) needs an Express app');
  }

  const opts = options || {};
  const dataPath =
    opts.dataPath || path.join(process.cwd(), 'data', 'custom-channels.json');
  const adminPath = opts.adminPath || '/admin/channels';
  const apiPath = opts.apiPath || '/api/custom-channels';

  app.get(adminPath, function (req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderAdminChannelsPage());
  });

  app.get(apiPath, function (req, res) {
    res.json(readCustomChannels(dataPath));
  });

  app.post(apiPath, function (req, res) {
    readJsonBody(req)
      .then(function (body) {
        const list = Array.isArray(body) ? body : [];
        writeCustomChannels(dataPath, list);
        res.json({ ok: true, count: list.length });
      })
      .catch(function (err) {
        res.status(400).json({ ok: false, error: err.message || 'Bad JSON' });
      });
  });

  function exclusiveChannelsHomeMiddleware(req, res, next) {
    const reqPath = req.path || '';
    if (reqPath !== '/api/home') return next();

    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body) {
      try {
        body = injectExclusiveChannelsRail(body, dataPath, Date.now());
      } catch (err) {
        // never break home
      }
      return originalJson(body);
    };
    return next();
  }

  // Prepend so this still wraps /api/home even if install() is called
  // after the home route was already registered in index.js.
  app.use(exclusiveChannelsHomeMiddleware);
  try {
    if (app._router && Array.isArray(app._router.stack) && app._router.stack.length) {
      const layer = app._router.stack.pop();
      app._router.stack.unshift(layer);
    }
  } catch (err) {
    // ignore — middleware still registered, just may need earlier install
  }
}

module.exports = {
  installExclusiveChannels: installExclusiveChannels,
  buildExclusiveChannelsRail: buildExclusiveChannelsRail,
  injectExclusiveChannelsRail: injectExclusiveChannelsRail,
  channelToHomeItem: channelToHomeItem,
  easternWallTimeToMs: easternWallTimeToMs
};
