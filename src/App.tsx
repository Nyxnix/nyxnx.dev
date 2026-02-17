import { useCallback, useEffect, useMemo, useState } from 'react';
import ProfileCard from './components/ProfileCard';
import PostsList from './components/PostsList';
import RepoList from './components/RepoList';
import { buildEmptyCommitHistory } from './lib/github-api';
import { fetchGitHubCache, GitHubCacheError } from './lib/github-cache';
import { fetchHugoPosts } from './lib/hugo-api';
import type {
  CommitDayActivity,
  GitHubRepo,
  HugoPostSummary,
  GitHubUser,
  LanguageUsage,
  RepoActivityBucket,
  RepoViewModel
} from './types/github';
import './App.css';

const USERNAME = 'nyxnix';
const MAX_COMMIT_HISTORY_DAYS = 180;

type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';
type ContentView = 'repos' | 'posts';

interface FriendlyError {
  heading: string;
  details: string;
}

function getDaysSince(date: string): number {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return 999;
  }

  const diffMs = Date.now() - parsed;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function getActivityBucket(daysSince: number): RepoActivityBucket {
  if (daysSince <= 14) {
    return 'active';
  }

  if (daysSince <= 60) {
    return 'warm';
  }

  return 'stale';
}

function toRepoViewModel(repo: GitHubRepo): RepoViewModel {
  const daysSinceLastCommit = getDaysSince(repo.pushed_at);

  return {
    ...repo,
    days_since_last_commit: daysSinceLastCommit,
    activity_bucket: getActivityBucket(daysSinceLastCommit),
    is_archived: Boolean(repo.archived)
  };
}

function formatFriendlyError(error: Error): FriendlyError {
  if (error instanceof GitHubCacheError) {
    if (error.status === 404) {
      return {
        heading: 'GitHub cache service not found',
        details: 'The `/api/github-dashboard` endpoint is unavailable. Check the Railway backend deployment.'
      };
    }

    return {
      heading: 'Could not load cached GitHub data',
      details: 'The cache service could not return data. Retry in a moment.'
    };
  }

  return {
    heading: 'Could not load GitHub data',
    details: 'Unexpected error while loading data. Retry to try again.'
  };
}

export default function App() {
  const [repos, setRepos] = useState<RepoViewModel[]>([]);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [lastCacheRefreshAt, setLastCacheRefreshAt] = useState<string | null>(null);
  const [posts, setPosts] = useState<HugoPostSummary[]>([]);
  const [readme, setReadme] = useState('');
  const [commitHistory, setCommitHistory] = useState<CommitDayActivity[]>(
    buildEmptyCommitHistory(MAX_COMMIT_HISTORY_DAYS)
  );
  const [contentView, setContentView] = useState<ContentView>('repos');
  const [isLoading, setIsLoading] = useState(true);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [postsError, setPostsError] = useState<Error | null>(null);
  const [hasLoadedPosts, setHasLoadedPosts] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const nextTheme: ResolvedTheme =
        themePreference === 'system' ? (media.matches ? 'dark' : 'light') : themePreference;

      setResolvedTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
    };

    applyTheme();
    media.addEventListener('change', applyTheme);

    return () => media.removeEventListener('change', applyTheme);
  }, [themePreference]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const cachedData = await fetchGitHubCache({ commitHistoryDays: MAX_COMMIT_HISTORY_DAYS });

      setRepos(cachedData.repos.map(toRepoViewModel));
      setUser(cachedData.user);
      setReadme(cachedData.readme);
      setCommitHistory(cachedData.commit_history);
      setLastCacheRefreshAt(cachedData.meta.fetched_at);
    } catch (err) {
      const fallback = new Error('Unexpected error while loading GitHub data.');
      setError(err instanceof Error ? err : fallback);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPosts = useCallback(async () => {
    setIsPostsLoading(true);
    setPostsError(null);

    try {
      const postData = await fetchHugoPosts();
      setPosts(postData);
      setHasLoadedPosts(true);
    } catch (err) {
      const fallback = new Error('Unexpected error while loading posts.');
      setPostsError(err instanceof Error ? err : fallback);
    } finally {
      setIsPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contentView !== 'posts' || hasLoadedPosts || isPostsLoading) {
      return;
    }

    void loadPosts();
  }, [contentView, hasLoadedPosts, isPostsLoading, loadPosts]);

  const summary = useMemo(() => {
    const totalRepos = repos.length;
    const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);

    const languageCounts = repos.reduce<Record<string, number>>((counts, repo) => {
      if (!repo.language) {
        return counts;
      }

      counts[repo.language] = (counts[repo.language] ?? 0) + 1;
      return counts;
    }, {});

    const topLanguage = Object.entries(languageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Mixed';

    const newestPushEpoch = repos.reduce((latest, repo) => {
      const pushTime = Date.parse(repo.pushed_at);
      if (Number.isNaN(pushTime)) {
        return latest;
      }

      return Math.max(latest, pushTime);
    }, 0);

    const lastCommitDate = newestPushEpoch ? new Date(newestPushEpoch).toLocaleDateString() : '-';

    return {
      totalRepos,
      totalStars,
      topLanguage,
      lastCommitDate
    };
  }, [repos]);

  const activeRepoCount = useMemo(
    () => repos.filter((repo) => repo.activity_bucket === 'active').length,
    [repos]
  );

  const topLanguageUsage = useMemo<LanguageUsage[]>(() => {
    const languageCounts = repos.reduce<Record<string, number>>((counts, repo) => {
      if (!repo.language) {
        return counts;
      }

      counts[repo.language] = (counts[repo.language] ?? 0) + 1;
      return counts;
    }, {});

    const totalTaggedRepos = Object.values(languageCounts).reduce((sum, count) => sum + count, 0);
    if (totalTaggedRepos === 0) {
      return [];
    }

    return Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([language, count]) => ({
        language,
        percentage: (count / totalTaggedRepos) * 100,
        repo_count: count
      }));
  }, [repos]);

  const friendlyError = error ? formatFriendlyError(error) : null;
  const isReposView = contentView === 'repos';
  const reposTabClassName = `hero-nav-link hero-nav-button${isReposView ? ' hero-nav-link-active' : ''}`;
  const postsTabClassName = `hero-nav-link hero-nav-button${
    !isReposView ? ' hero-nav-link-active hero-nav-link-posts' : ''
  }`;
  const lastCacheRefreshDisplay = useMemo(() => {
    if (!lastCacheRefreshAt) {
      return {
        label: isLoading ? 'Loading…' : 'Unavailable',
        machineDate: null as string | null
      };
    }

    const parsed = Date.parse(lastCacheRefreshAt);
    if (Number.isNaN(parsed)) {
      return {
        label: lastCacheRefreshAt,
        machineDate: null as string | null
      };
    }

    return {
      label: new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(parsed),
      machineDate: new Date(parsed).toISOString()
    };
  }, [isLoading, lastCacheRefreshAt]);

  return (
    <main className="app-shell">
      <header className="hero" id="home">
        <nav className="hero-nav" aria-label="Primary">
          <button
            type="button"
            className={reposTabClassName}
            onClick={() => setContentView('repos')}
            aria-pressed={isReposView}
          >
            Repositories
          </button>
          <button
            type="button"
            className={postsTabClassName}
            onClick={() => setContentView('posts')}
            aria-pressed={!isReposView}
          >
            Posts
          </button>
          <div className="hero-nav-refresh" aria-live="polite">
            <span className="hero-nav-refresh-label">GitHub cache</span>
            {lastCacheRefreshDisplay.machineDate ? (
              <time dateTime={lastCacheRefreshDisplay.machineDate}>{lastCacheRefreshDisplay.label}</time>
            ) : (
              <span>{lastCacheRefreshDisplay.label}</span>
            )}
          </div>
        </nav>

        <div className="hero-grid">
          <div>
            <h1>Nyx&apos;s Home</h1>
            <div className="hero-notes" aria-label="Quick profile highlights">
              <span>Total repos: {summary.totalRepos}</span>
              <span>Active (14d): {activeRepoCount}</span>
              <span>Total stars: {summary.totalStars}</span>
            </div>
          </div>

          <aside className="hero-tools" aria-label="Dashboard controls">
            <label className="theme-select">
              Theme
              <select
                value={themePreference}
                onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
                aria-label="Theme preference"
              >
                <option value="system">System ({resolvedTheme})</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>

            <a className="hero-link" href={`https://github.com/${USERNAME}`} target="_blank" rel="noreferrer">
              View full GitHub profile
            </a>
          </aside>
        </div>
      </header>

      {isLoading ? <p className="status">Loading data...</p> : null}

      {friendlyError ? (
        <section className="status status-error-panel" role="alert" aria-live="assertive">
          <h2>{friendlyError.heading}</h2>
          <p>{friendlyError.details}</p>
          <button type="button" className="retry-button" onClick={() => void load()}>
            Retry
          </button>
        </section>
      ) : null}

      {!isLoading && !error && user ? (
        <section className="content-grid" id="repositories">
          {isReposView ? (
            <RepoList repos={repos} />
          ) : (
            <PostsList posts={posts} isLoading={isPostsLoading} error={postsError} onRetry={() => void loadPosts()} />
          )}
          <ProfileCard
            user={user}
            readme={readme}
            commitHistory={commitHistory}
            topLanguageUsage={topLanguageUsage}
          />
        </section>
      ) : null}
    </main>
  );
}
