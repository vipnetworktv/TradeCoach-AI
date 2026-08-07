/**
 * Drop-in helper for VIPFLIX my-backend.
 *
 * Exclusive / Featured events should show:
 *   - before start          -> date/time label (e.g. "8/6 8:00 PM")
 *   - start .. start+duration -> "LIVE"  (isLive: true)
 *   - after end             -> "ENDED" (isLive: false)
 *
 * MLB schedule items already do this. Featured/custom items were leaving
 * raw "20:00" in `time` and never flipping isLive.
 *
 * Install in server.js (BEFORE routes):
 *
 *   const { installExclusiveLiveLabels } = require('./exclusive-live-labels');
 *   installExclusiveLiveLabels(app);
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format start time in US Eastern, matching schedule rails: "8/6 8:00 PM" */
function formatUpcomingLabel(startMs) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const parts = fmt.formatToParts(new Date(startMs));
    const get = (type) => {
      const p = parts.find((x) => x.type === type);
      return p ? p.value : '';
    };
    const month = get('month');
    const day = get('day');
    const hour = get('hour');
    const minute = get('minute');
    const dayPeriod = get('dayPeriod');
    if (!month || !day || !hour) {
      const d = new Date(startMs);
      return d.toLocaleString('en-US', { timeZone: 'America/New_York' });
    }
    return month + '/' + day + ' ' + hour + ':' + minute + ' ' + dayPeriod;
  } catch (err) {
    const d = new Date(startMs);
    const h24 = d.getUTCHours(); // fallback only
    const h12 = h24 % 12 || 12;
    const ap = h24 >= 12 ? 'PM' : 'AM';
    return d.getUTCMonth() + 1 + '/' + d.getUTCDate() + ' ' + h12 + ':' + pad2(d.getUTCMinutes()) + ' ' + ap;
  }
}

function applyExclusiveStatus(item, nowMs) {
  if (!item || typeof item !== 'object') return item;

  const startMs = Number(item.startTimeMs);
  const endMs = Number(item.endTimeMs);
  if (!Number.isFinite(startMs)) return item;

  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const end = Number.isFinite(endMs)
    ? endMs
    : startMs + (Number(item.durationHours) || 4) * 3600000;

  const next = Object.assign({}, item);
  next.endTimeMs = end;

  if (now >= end) {
    next.time = 'ENDED';
    next.isLive = false;
    next.status = 'ended';
    return next;
  }

  if (now >= startMs) {
    next.time = 'LIVE';
    next.isLive = true;
    next.status = 'live';
    return next;
  }

  next.time = formatUpcomingLabel(startMs);
  next.isLive = false;
  next.status = 'upcoming';
  return next;
}

function isExclusiveRail(rail) {
  if (!rail || typeof rail !== 'object') return false;
  const title = String(rail.title || '').toLowerCase();
  const type = String(rail.type || '').toLowerCase();
  return (
    type === 'featured' ||
    title === 'featured' ||
    title.indexOf('exclusive') !== -1
  );
}

function patchPayload(body, nowMs) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.rails)) return body;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return Object.assign({}, body, {
    rails: body.rails.map(function (rail) {
      if (!isExclusiveRail(rail) || !Array.isArray(rail.items)) return rail;
      return Object.assign({}, rail, {
        items: rail.items.map(function (item) {
          return applyExclusiveStatus(item, now);
        })
      });
    })
  });
}

function installExclusiveLiveLabels(app) {
  if (!app || typeof app.use !== 'function') {
    throw new Error('installExclusiveLiveLabels(app) needs an Express app');
  }

  app.use(function exclusiveLiveLabelsMiddleware(req, res, next) {
    const path = req.path || '';
    if (path !== '/api/home' && path !== '/api/live') {
      return next();
    }

    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body) {
      try {
        body = patchPayload(body, Date.now());
      } catch (err) {
        // Never break the API if labeling fails
      }
      return originalJson(body);
    };
    return next();
  });
}

module.exports = {
  applyExclusiveStatus: applyExclusiveStatus,
  formatUpcomingLabel: formatUpcomingLabel,
  patchPayload: patchPayload,
  installExclusiveLiveLabels: installExclusiveLiveLabels
};
