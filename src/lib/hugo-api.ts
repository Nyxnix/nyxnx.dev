import type { HugoPostSummary } from '../types/github';

const REQUEST_TIMEOUT_MS = 8000;

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function getPostIndexCandidates(): string[] {
  if (import.meta.env.DEV) {
    return ['/hugo/index.json', '/posts/index.json'];
  }

  const baseUrl = withTrailingSlash(import.meta.env.BASE_URL);
  const primary = `${baseUrl}posts/index.json`;
  return primary === '/posts/index.json' ? [primary] : [primary, '/posts/index.json'];
}

function isPostSummary(value: unknown): value is HugoPostSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.permalink === 'string' &&
    typeof candidate.reading_time === 'number' &&
    (typeof candidate.content_html === 'string' || typeof candidate.content_html === 'undefined')
  );
}

async function fetchJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const response = await fetch(path, {
    headers: {
      Accept: 'application/json'
    },
    signal: controller.signal
  });
  window.clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Failed to load posts feed (${response.status} ${response.statusText}) from ${path}`);
  }

  return response.json() as Promise<unknown>;
}

export async function fetchHugoPosts(): Promise<HugoPostSummary[]> {
  const candidates = getPostIndexCandidates();
  let lastError: Error | null = null;

  for (const path of candidates) {
    try {
      const payload = await fetchJson(path);
      if (!Array.isArray(payload)) {
        throw new Error(`Posts payload has an invalid format for ${path}.`);
      }

      const posts = payload.filter(isPostSummary);
      return posts.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error(`Timed out loading posts from ${path} after ${REQUEST_TIMEOUT_MS / 1000}s.`);
      } else {
        lastError = error instanceof Error ? error : new Error('Unknown posts loading error.');
      }
    }
  }

  throw lastError ?? new Error('Failed to load posts feed.');
}
