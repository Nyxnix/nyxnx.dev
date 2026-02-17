import { useMemo, type ComponentPropsWithoutRef } from 'react';
import Markdown from 'markdown-to-jsx';
import type { CommitDayActivity, GitHubUser, LanguageUsage } from '../types/github';

interface ProfileCardProps {
  user: GitHubUser;
  readme: string;
  commitHistory: CommitDayActivity[];
  topLanguageUsage: LanguageUsage[];
}

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const BLOCKED_HTML_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'video',
  'audio',
  'source'
] as const;

function sanitizeMarkdownUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  if (url.startsWith('//')) {
    return undefined;
  }

  const isRelative = !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url);
  if (isRelative) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

function MarkdownLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  const safeHref = sanitizeMarkdownUrl(href);
  if (!safeHref) {
    return <span>{children}</span>;
  }

  const isExternal = safeHref.startsWith('http://') || safeHref.startsWith('https://');
  return (
    <a
      title={rest.title}
      href={safeHref}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer nofollow' : undefined}
    >
      {children}
    </a>
  );
}

function MarkdownImage({ src, alt, ...rest }: ComponentPropsWithoutRef<'img'>) {
  const safeSrc = sanitizeMarkdownUrl(src);
  if (!safeSrc) {
    return null;
  }

  return (
    <img
      src={safeSrc}
      alt={alt ?? ''}
      title={rest.title}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}

function getCommitLevel(commitCount: number, maxCount: number): number {
  if (commitCount <= 0) {
    return 0;
  }

  if (maxCount <= 1) {
    return 4;
  }

  const ratio = commitCount / maxCount;
  if (ratio <= 0.25) {
    return 1;
  }

  if (ratio <= 0.5) {
    return 2;
  }

  if (ratio <= 0.75) {
    return 3;
  }

  return 4;
}

export default function ProfileCard({ user, readme, commitHistory, topLanguageUsage }: ProfileCardProps) {
  const hasReadme = readme.trim().length > 0;
  const displayDays = 180;

  const displayedCommitHistory = useMemo(
    () => commitHistory.slice(Math.max(0, commitHistory.length - displayDays)),
    [commitHistory, displayDays]
  );

  const totalCommits = displayedCommitHistory.reduce((sum, day) => sum + day.commit_count, 0);
  const maxDailyCommits = displayedCommitHistory.reduce((max, day) => Math.max(max, day.commit_count), 0);

  const firstDate = displayedCommitHistory[0]
    ? new Date(`${displayedCommitHistory[0].date}T00:00:00.000Z`)
    : null;
  const leadingEmptyCells = firstDate ? firstDate.getUTCDay() : 0;
  const paddedHistory: Array<CommitDayActivity | null> = [
    ...Array.from({ length: leadingEmptyCells }, () => null),
    ...displayedCommitHistory
  ];

  while (paddedHistory.length % 7 !== 0) {
    paddedHistory.push(null);
  }

  const topLanguageLabel = topLanguageUsage
    .map((item) => `${item.language} ${Math.round(item.percentage)}%`)
    .join(', ');

  return (
    <section className="panel profile-panel">
      <header className="panel-header">
        <h2>Profile</h2>
      </header>

      <div className="profile-top">
        <img src={user.avatar_url} alt={`${user.login} avatar`} className="avatar" />
        <div>
          <h3>{user.name ?? user.login}</h3>
          <a href={user.html_url} target="_blank" rel="noreferrer">
            @{user.login}
          </a>
          {user.bio ? <p>{user.bio}</p> : null}
        </div>
      </div>

      <section className="commit-history" aria-label={`Last ${displayDays} days commit history`}>
        <div className="commit-history-head">
          <h3>{displayDays}-day commits</h3>
          <p>{totalCommits} total</p>
        </div>
        <div className="commit-graph">
          <div className="commit-day-labels" aria-hidden="true">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>
          <div className="commit-grid">
            {paddedHistory.map((day, index) =>
              day ? (
                <span
                  key={day.date}
                  className={`commit-cell level-${getCommitLevel(day.commit_count, maxDailyCommits)}`}
                  title={`${day.date}: ${day.commit_count} commit${day.commit_count === 1 ? '' : 's'}`}
                />
              ) : (
                <span
                  key={`empty-${index}`}
                  className="commit-cell commit-cell-empty"
                />
              )
            )}
          </div>
        </div>
        <div className="commit-legend" aria-hidden="true">
          <span>Less</span>
          <span className="commit-cell level-0" />
          <span className="commit-cell level-1" />
          <span className="commit-cell level-2" />
          <span className="commit-cell level-3" />
          <span className="commit-cell level-4" />
          <span>More</span>
        </div>
      </section>

      <section className="language-usage" aria-label="Top language usage">
        <div className="language-usage-head">
          <h3>Top languages</h3>
          <p>By repository share</p>
        </div>
        {topLanguageUsage.length > 0 ? (
          <>
            <div
              className="language-usage-bar"
              role="img"
              aria-label={`Top language usage: ${topLanguageLabel}`}
            >
              {topLanguageUsage.map((item) => (
                <span
                  key={item.language}
                  className="language-usage-segment"
                  style={{ width: `${item.percentage}%` }}
                  title={`${item.language}: ${Math.round(item.percentage)}% (${item.repo_count} repos)`}
                />
              ))}
            </div>
            <div className="language-usage-list" aria-hidden="true">
              {topLanguageUsage.map((item) => (
                <span key={item.language} className="language-usage-item">
                  <span className="language-usage-dot" />
                  <span>
                    {item.language} {Math.round(item.percentage)}%
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="language-usage-empty">No language data available.</p>
        )}
      </section>

      {hasReadme ? (
        <details className="readme-wrap" open>
          <summary>Profile README</summary>
          <article className="readme markdown-body">
            <Markdown
              options={{
                overrides: {
                  a: { component: MarkdownLink },
                  img: { component: MarkdownImage },
                  ...Object.fromEntries(BLOCKED_HTML_TAGS.map((tag) => [tag, { component: () => null }]))
                }
              }}
            >
              {readme}
            </Markdown>
          </article>
        </details>
      ) : (
        <section className="readme-empty" aria-live="polite">
          <h3>No profile README available</h3>
          <p>This profile does not currently expose a public README. Check back later for updates.</p>
        </section>
      )}
    </section>
  );
}
