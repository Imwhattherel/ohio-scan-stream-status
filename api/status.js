// Vercel serverless function: GET /api/status
// Calls the ThinLine Radio public API with a server-side key and returns a
// sanitized summary for the status page. The key never reaches the browser.

const HOST = (process.env.TLR_HOST || '').replace(/\/+$/, '');
const KEY = process.env.TLR_API_KEY || '';
const TITLE = process.env.STATUS_TITLE || 'ThinLine Radio Status';
const SHOW_SYSTEMS = (process.env.SHOW_SYSTEMS || 'true') !== 'false';
const SHOW_REASONS = (process.env.SHOW_REASONS || 'true') !== 'false';
const SHOW_VERSION = process.env.SHOW_VERSION === 'true';
const SYSTEM_REFS = (process.env.SYSTEM_REFS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function tlr(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${HOST}/api/public/v1${path}`, {
      headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch (_) {}
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSystems(body) {
  const arr = Array.isArray(body) ? body : (body && (body.systems || body.results)) || [];
  return arr
    .map((s) => ({
      systemRef: s.systemRef,
      label: s.label || `System ${s.systemRef}`,
      lastCallAt: typeof s.lastCallAt === 'number' ? s.lastCallAt : null,
      callsLastHour: typeof s.callsLastHour === 'number' ? s.callsLastHour : 0,
    }))
    .filter((s) => SYSTEM_REFS.length === 0 || SYSTEM_REFS.includes(String(s.systemRef)));
}

module.exports = async (req, res) => {
  // Keeps us far under the 120 req/min/key limit, even with many visitors.
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!HOST || !KEY) {
    res.statusCode = 500;
    res.end(JSON.stringify({ overall: 'unknown', title: TITLE, message: 'Status page is not configured.' }));
    return;
  }

  const [health, systems] = await Promise.all([
    tlr('/health'),
    SHOW_SYSTEMS ? tlr('/health/systems') : Promise.resolve(null),
  ]);

  const out = {
    title: TITLE,
    checkedAt: Date.now(),
    overall: 'unknown',
    message: '',
    reasons: [],
    uptimeSeconds: null,
    version: null,
    systems: [],
  };

  if (health.status === 0) {
    out.overall = 'down';
    out.message = 'The scanner cannot be reached.';
  } else if (health.status === 200) {
    out.overall = 'operational';
    out.message = 'All systems operational.';
  } else if (health.status === 503) {
    out.overall = 'degraded';
    out.message = 'The scanner is running but degraded.';
  } else if (health.status >= 500) {
    out.overall = 'down';
    out.message = 'The scanner returned an error.';
  } else {
    // 401 / 403 / 429 etc: a problem with this page's check, not necessarily the scanner.
    out.overall = 'unknown';
    out.message = 'Status could not be determined right now.';
  }

  const b = health.body || {};
  if (typeof b.uptime_seconds === 'number') out.uptimeSeconds = b.uptime_seconds;
  if (SHOW_VERSION && b.version) out.version = String(b.version);
  if (SHOW_REASONS && Array.isArray(b.reasons)) out.reasons = b.reasons.map(String);

  if (systems && systems.ok) out.systems = normalizeSystems(systems.body);

  res.statusCode = 200;
  res.end(JSON.stringify(out));
};
