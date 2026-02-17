import { buildEmptyCommitHistory } from './github-api';
import type { CommitDayActivity, GitHubDashboardCache } from '../types/github';

const GITHUB_CACHE_API_PATH = '/api/github-dashboard';

export class GitHubCacheError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'GitHubCacheError';
    this.status = status;
  }
}

function isCommitDayActivity(value: unknown): value is CommitDayActivity {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.date === 'string' && typeof candidate.commit_count === 'number';
}

function normalizeCommitHistory(rawHistory: unknown, days: number): CommitDayActivity[] {
  if (!Array.isArray(rawHistory)) {
    return buildEmptyCommitHistory(days);
  }

  const history = rawHistory.filter(isCommitDayActivity);
  if (history.length === 0) {
    return buildEmptyCommitHistory(days);
  }

  return history.slice(Math.max(0, history.length - days));
}

function isDashboardCache(value: unknown): value is GitHubDashboardCache {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (!candidate.meta || typeof candidate.meta !== 'object') {
    return false;
  }

  const meta = candidate.meta as Record<string, unknown>;
  const hasValidMeta =
    typeof meta.username === 'string' &&
    typeof meta.fetched_at === 'string' &&
    meta.source === 'github-api' &&
    typeof meta.cache_ttl_minutes === 'number';

  if (!hasValidMeta || !candidate.user || typeof candidate.user !== 'object') {
    return false;
  }

  if (!Array.isArray(candidate.repos) || typeof candidate.readme !== 'string') {
    return false;
  }

  return true;
}

interface CacheFetchOptions {
  commitHistoryDays?: number;
}

export async function fetchGitHubCache({ commitHistoryDays = 180 }: CacheFetchOptions = {}): Promise<GitHubDashboardCache> {
  const response = await fetch(GITHUB_CACHE_API_PATH, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    let details = '';

    try {
      const payload = (await response.json()) as { message?: string };
      details = payload.message ? ` - ${payload.message}` : '';
    } catch {
      details = '';
    }

    throw new GitHubCacheError(
      `Failed to load GitHub cache: ${response.status} ${response.statusText}${details}`,
      response.status
    );
  }

  const payload = (await response.json()) as unknown;
  if (!isDashboardCache(payload)) {
    throw new GitHubCacheError('GitHub cache payload has an invalid format.');
  }

  const repos = payload.repos
    .filter((repo) => repo && typeof repo === 'object')
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));

  return {
    ...payload,
    repos,
    commit_history: normalizeCommitHistory(payload.commit_history, commitHistoryDays)
  };
}
