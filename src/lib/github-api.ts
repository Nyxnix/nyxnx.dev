import type { CommitDayActivity, GitHubRepo, GitHubUser, ReadmeContentResponse } from '../types/github';

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubApiError extends Error {
  status: number;
  rateLimitRemaining: number | null;
  rateLimitResetEpoch: number | null;

  constructor(
    message: string,
    status: number,
    rateLimitRemaining: number | null = null,
    rateLimitResetEpoch: number | null = null
  ) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.rateLimitRemaining = rateLimitRemaining;
    this.rateLimitResetEpoch = rateLimitResetEpoch;
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    const rateLimitRemaining = Number.parseInt(response.headers.get('x-ratelimit-remaining') ?? '', 10);
    const rateLimitReset = Number.parseInt(response.headers.get('x-ratelimit-reset') ?? '', 10);

    let detail: string | null = null;
    try {
      const payload = (await response.json()) as { message?: string };
      detail = payload.message ?? null;
    } catch {
      detail = null;
    }

    const message = detail
      ? `GitHub request failed: ${response.status} ${response.statusText} - ${detail}`
      : `GitHub request failed: ${response.status} ${response.statusText}`;

    throw new GitHubApiError(
      message,
      response.status,
      Number.isNaN(rateLimitRemaining) ? null : rateLimitRemaining,
      Number.isNaN(rateLimitReset) ? null : rateLimitReset
    );
  }

  return response.json() as Promise<T>;
}

function decodeBase64Utf8(base64Content: string): string {
  const binary = atob(base64Content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sanitizeReadmeContent(markdown: string): string {
  // GitHub may tolerate malformed duplicate closing anchors that render literally in markdown-to-jsx.
  const normalized = markdown.replace(/<\/a>\s*<\/a>/g, '</a>');

  // Strip high-risk tags before rendering markdown with raw HTML enabled.
  const withoutDangerousTags = normalized
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|video|audio|source)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ''
    )
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|video|audio|source)\b[^>]*\/?\s*>/gi,
      ''
    );

  // Remove inline event handlers such as onclick/onerror.
  const withoutInlineHandlers = withoutDangerousTags.replace(
    /\s(on[a-z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    ''
  );

  // Drop dangerous URI schemes in href/src-like attributes.
  const withoutDangerousUris = withoutInlineHandlers
    .replace(
      /\s(href|src|xlink:href|formaction|poster)\s*=\s*("|\')\s*(javascript:|vbscript:|data:(?!image\/))[^"']*\2/gi,
      ''
    )
    .replace(
      /\s(href|src|xlink:href|formaction|poster)\s*=\s*(javascript:|vbscript:|data:(?!image\/))[^\s>]+/gi,
      ''
    );

  return withoutDangerousUris;
}

interface GitHubPublicEvent {
  type: string;
  created_at: string;
  payload?: {
    size?: number;
    commits?: unknown[];
  };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildEmptyCommitHistory(days = 30): CommitDayActivity[] {
  const today = startOfUtcDay(new Date());
  const history: CommitDayActivity[] = [];

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

export async function fetchGitHubRepos(username: string): Promise<GitHubRepo[]> {
  const repos = await request<GitHubRepo[]>(`/users/${username}/repos?per_page=100`);
  return repos.sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
}

export function fetchGitHubUser(username: string): Promise<GitHubUser> {
  return request<GitHubUser>(`/users/${username}`);
}

export async function fetchGitHubProfileReadme(username: string): Promise<string> {
  const readme = await request<ReadmeContentResponse>(`/repos/${username}/${username}/readme`);

  if (readme.encoding !== 'base64') {
    throw new Error(`Unsupported README encoding: ${readme.encoding}`);
  }

  return sanitizeReadmeContent(decodeBase64Utf8(readme.content));
}

export async function fetchGitHubCommitHistory(username: string, days = 30): Promise<CommitDayActivity[]> {
  const baseHistory = buildEmptyCommitHistory(days);
  const historyByDate = new Map(baseHistory.map((day) => [day.date, day.commit_count]));
  const rangeStart = Date.parse(`${baseHistory[0].date}T00:00:00.000Z`);
  const maxPages = days <= 30 ? 3 : days <= 60 ? 5 : days <= 120 ? 7 : 10;

  // Public events are limited; fetch a bounded number of pages to cover the requested range.
  for (let page = 1; page <= maxPages; page += 1) {
    const events = await request<GitHubPublicEvent[]>(
      `/users/${username}/events/public?per_page=100&page=${page}`
    );

    if (events.length === 0) {
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
