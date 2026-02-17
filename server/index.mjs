import express from 'express';
import { createClient } from 'redis';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const app = express();

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const GITHUB_USERNAME = process.env.GITHUB_USERNAME ?? 'nyxnix';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_COMMIT_HISTORY_DAYS = Number.parseInt(process.env.GITHUB_COMMIT_HISTORY_DAYS ?? '180', 10);
const GITHUB_CACHE_TTL_MINUTES = Number.parseInt(process.env.GITHUB_CACHE_TTL_MINUTES ?? '30', 10);
const GITHUB_CACHE_REFRESH_MS = Number.parseInt(process.env.GITHUB_CACHE_REFRESH_MS ?? '900000', 10);
const CACHE_REFRESH_TOKEN = process.env.CACHE_REFRESH_TOKEN ?? '';
const GITHUB_TOKEN = process.env.GH_API_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const REDIS_URL = process.env.REDIS_URL ?? '';
const STATIC_DIR = path.resolve(process.cwd(), process.env.STATIC_DIR ?? 'docs');

const cacheKey = `github-dashboard-cache:${GITHUB_USERNAME}:v1`;
let redisClient = null;
let inMemoryCache = null;
let refreshPromise = null;

if (REDIS_URL) {
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', (error) => {
    console.error('Redis error:', error);
  });

  try {
    await redisClient.connect();
    console.log('Connected to Redis cache.');
  } catch (error) {
    console.error('Redis connection failed, continuing with in-memory cache:', error);
    redisClient = null;
  }
}

function assertPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const normalizedHistoryDays = assertPositiveInteger(GITHUB_COMMIT_HISTORY_DAYS, 180);
const normalizedTtlMinutes = assertPositiveInteger(GITHUB_CACHE_TTL_MINUTES, 30);
const normalizedRefreshMs = assertPositiveInteger(GITHUB_CACHE_REFRESH_MS, 900000);

async function githubRequest(pathname) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': `${GITHUB_USERNAME}-railway-cache-service`
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, { headers });

  if (!response.ok) {
    let details = '';

    try {
      const payload = await response.json();
      if (payload?.message && typeof payload.message === 'string') {
        details = ` - ${payload.message}`;
      }
    } catch {
      details = '';
    }

    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}${details}`);
  }

  return response.json();
}

function decodeBase64Utf8(base64Content) {
  return Buffer.from(base64Content.replace(/\n/g, ''), 'base64').toString('utf8');
}

function sanitizeReadmeContent(markdown) {
  const normalized = markdown.replace(/<\/a>\s*<\/a>/g, '</a>');

  const withoutDangerousTags = normalized
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|video|audio|source)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ''
    )
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|video|audio|source)\b[^>]*\/?\s*>/gi,
      ''
    );

  const withoutInlineHandlers = withoutDangerousTags.replace(
    /\s(on[a-z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    ''
  );

  return withoutInlineHandlers
    .replace(
      /\s(href|src|xlink:href|formaction|poster)\s*=\s*("|\')\s*(javascript:|vbscript:|data:(?!image\/))[^"']*\2/gi,
      ''
    )
    .replace(/\s(href|src|xlink:href|formaction|poster)\s*=\s*(javascript:|vbscript:|data:(?!image\/))[^\s>]+/gi, '');
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildEmptyCommitHistory(days) {
  const today = startOfUtcDay(new Date());
  const history = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(today);
    current.setUTCDate(current.getUTCDate() - offset);
    history.push({
      date: formatUtcDate(current),
      commit_count: 0
    });
  }

  return history;
}

async function fetchCommitHistory(username, days) {
  const baseHistory = buildEmptyCommitHistory(days);
  const historyByDate = new Map(baseHistory.map((day) => [day.date, day.commit_count]));
  const rangeStart = Date.parse(`${baseHistory[0].date}T00:00:00.000Z`);
  const maxPages = days <= 30 ? 3 : days <= 60 ? 5 : days <= 120 ? 7 : 10;

  for (let page = 1; page <= maxPages; page += 1) {
    const events = await githubRequest(`/users/${username}/events/public?per_page=100&page=${page}`);

    if (!Array.isArray(events) || events.length === 0) {
      break;
    }

    let reachedOlderEvents = false;

    for (const event of events) {
      const eventTime = Date.parse(event.created_at);
      if (Number.isNaN(eventTime)) {
        continue;
      }

      if (eventTime < rangeStart) {
        reachedOlderEvents = true;
        continue;
      }

      if (event.type !== 'PushEvent') {
        continue;
      }

      const dayKey = formatUtcDate(new Date(eventTime));
      if (!historyByDate.has(dayKey)) {
        continue;
      }

      const payloadSize =
        typeof event.payload?.size === 'number'
          ? event.payload.size
          : Array.isArray(event.payload?.commits)
            ? event.payload.commits.length
            : 1;

      historyByDate.set(dayKey, (historyByDate.get(dayKey) ?? 0) + Math.max(1, payloadSize));
    }

    if (reachedOlderEvents) {
      break;
    }
  }

  return baseHistory.map((day) => ({
    ...day,
    commit_count: historyByDate.get(day.date) ?? 0
  }));
}

function normalizeUser(user) {
  return {
    login: user.login,
    avatar_url: user.avatar_url,
    html_url: user.html_url,
    name: user.name ?? null,
    bio: user.bio ?? null,
    followers: user.followers,
    following: user.following,
    public_repos: user.public_repos
  };
}

function normalizeRepo(repo) {
  return {
    id: repo.id,
    name: repo.name,
    html_url: repo.html_url,
    description: repo.description ?? null,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    pushed_at: repo.pushed_at,
    language: repo.language ?? null,
    stargazers_count: repo.stargazers_count,
    open_issues_count: repo.open_issues_count,
    forks_count: repo.forks_count,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    archived: Boolean(repo.archived)
  };
}

async function readCachedPayload() {
  if (redisClient) {
    const raw = await redisClient.get(cacheKey);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  }

  return inMemoryCache;
}

async function writeCachedPayload(payload) {
  if (redisClient) {
    await redisClient.set(cacheKey, JSON.stringify(payload));
  }

  inMemoryCache = payload;
}

async function loadRepoSnapshot() {
  const snapshotPath = path.resolve(process.cwd(), 'repos');

  try {
    const raw = await readFile(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildPayload({ user, repos, readme, commitHistory }) {
  return {
    meta: {
      username: GITHUB_USERNAME,
      fetched_at: new Date().toISOString(),
      source: 'github-api',
      cache_ttl_minutes: normalizedTtlMinutes
    },
    user,
    repos,
    readme,
    commit_history: commitHistory
  };
}

function buildFallbackPayloadFromSnapshot(reposSnapshot) {
  if (!Array.isArray(reposSnapshot) || reposSnapshot.length === 0) {
    return null;
  }

  const repos = reposSnapshot
    .map(normalizeRepo)
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));

  const owner = reposSnapshot.find((repo) => repo && typeof repo.owner === 'object')?.owner;
  const login = typeof owner?.login === 'string' ? owner.login : GITHUB_USERNAME;

  return buildPayload({
    user: {
      login,
      avatar_url:
        typeof owner?.avatar_url === 'string'
          ? owner.avatar_url
          : `https://avatars.githubusercontent.com/${encodeURIComponent(login)}`,
      html_url: typeof owner?.html_url === 'string' ? owner.html_url : `https://github.com/${encodeURIComponent(login)}`,
      name: null,
      bio: null,
      followers: 0,
      following: 0,
      public_repos: repos.length
    },
    repos,
    readme: '',
    commitHistory: buildEmptyCommitHistory(normalizedHistoryDays)
  });
}

async function fetchFreshPayload() {
  const [userResponse, reposResponse, readmeResponse] = await Promise.all([
    githubRequest(`/users/${GITHUB_USERNAME}`),
    githubRequest(`/users/${GITHUB_USERNAME}/repos?per_page=100`),
    githubRequest(`/repos/${GITHUB_USERNAME}/${GITHUB_USERNAME}/readme`)
  ]);

  if (!Array.isArray(reposResponse)) {
    throw new Error('Invalid GitHub repos response.');
  }

  if (readmeResponse.encoding !== 'base64' || typeof readmeResponse.content !== 'string') {
    throw new Error('Unsupported README format from GitHub API.');
  }

  let commitHistory = buildEmptyCommitHistory(normalizedHistoryDays);

  try {
    commitHistory = await fetchCommitHistory(GITHUB_USERNAME, normalizedHistoryDays);
  } catch (error) {
    console.warn('Failed to refresh commit history, using empty history.', error);
  }

  const repos = reposResponse
    .map(normalizeRepo)
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));

  return buildPayload({
    user: normalizeUser(userResponse),
    repos,
    readme: sanitizeReadmeContent(decodeBase64Utf8(readmeResponse.content)),
    commitHistory
  });
}

async function refreshCache() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const payload = await fetchFreshPayload();
    await writeCachedPayload(payload);
    return payload;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function isPayloadFresh(payload) {
  if (!payload?.meta?.fetched_at) {
    return false;
  }

  const fetchedAt = Date.parse(payload.meta.fetched_at);
  if (Number.isNaN(fetchedAt)) {
    return false;
  }

  return Date.now() - fetchedAt <= normalizedTtlMinutes * 60_000;
}

app.get('/api/github-dashboard', async (_req, res) => {
  const cached = await readCachedPayload();

  if (cached && isPayloadFresh(cached)) {
    res.setHeader('X-Cache-Status', 'HIT');
    return res.json(cached);
  }

  try {
    const fresh = await refreshCache();
    res.setHeader('X-Cache-Status', cached ? 'REFRESH' : 'MISS');
    return res.json(fresh);
  } catch (error) {
    if (cached) {
      res.setHeader('X-Cache-Status', 'STALE');
      return res.json(cached);
    }

    const reposSnapshot = await loadRepoSnapshot();
    const fallbackPayload = buildFallbackPayloadFromSnapshot(reposSnapshot);

    if (fallbackPayload) {
      await writeCachedPayload(fallbackPayload);
      res.setHeader('X-Cache-Status', 'FALLBACK');
      return res.json(fallbackPayload);
    }

    console.error('GitHub cache refresh failed with no fallback:', error);

    return res.status(503).json({
      message: 'Unable to refresh GitHub data cache. Configure GH_API_TOKEN to increase API limits.'
    });
  }
});

app.post('/api/github-dashboard/refresh', async (req, res) => {
  if (CACHE_REFRESH_TOKEN && req.headers['x-refresh-token'] !== CACHE_REFRESH_TOKEN) {
    return res.status(401).json({ message: 'Unauthorized refresh request.' });
  }

  try {
    const payload = await refreshCache();
    res.setHeader('X-Cache-Status', 'REFRESH');
    return res.json(payload);
  } catch (error) {
    console.error('Manual cache refresh failed:', error);
    return res.status(503).json({ message: 'GitHub cache refresh failed.' });
  }
});

app.use(express.static(STATIC_DIR));

app.get(/^\/(?!api\/).*/, (req, res) => {
  return res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

setInterval(() => {
  void refreshCache().catch((error) => {
    console.error('Scheduled cache refresh failed:', error);
  });
}, normalizedRefreshMs).unref();

void refreshCache().catch((error) => {
  console.error('Startup cache warmup failed:', error);
  void loadRepoSnapshot().then(async (reposSnapshot) => {
    const fallbackPayload = buildFallbackPayloadFromSnapshot(reposSnapshot);
    if (!fallbackPayload) {
      return;
    }

    await writeCachedPayload(fallbackPayload);
    console.warn('Loaded fallback GitHub cache from local repos snapshot.');
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}. Static dir: ${STATIC_DIR}`);
});
