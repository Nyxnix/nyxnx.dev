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

function XLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18.244 2h3.308l-7.227 8.26L22.8 22h-6.633l-5.196-6.792L4.99 22H1.68l7.73-8.835L1.2 2h6.801l4.697 6.231L18.244 2Zm-1.161 18h1.833L7.014 3.896H5.046L17.083 20Z" />
    </svg>
  );
}

function DiscordLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3a13.914 13.914 0 0 0-.635 1.285 18.27 18.27 0 0 0-6.5 0A13.468 13.468 0 0 0 8.115 3a19.736 19.736 0 0 0-4.432 1.369C.533 9.017-.321 13.549.106 18.018a19.899 19.899 0 0 0 5.993 2.981c.485-.667.918-1.371 1.293-2.108a12.969 12.969 0 0 1-2.035-.975c.171-.125.338-.253.5-.384 3.924 1.843 8.178 1.843 12.056 0 .163.133.329.261.5.384-.65.383-1.332.71-2.035.975.375.737.808 1.441 1.293 2.108a19.853 19.853 0 0 0 5.993-2.981c.5-5.183-.854-9.674-3.347-13.649ZM8.02 15.331c-1.182 0-2.156-1.085-2.156-2.419 0-1.333.948-2.418 2.156-2.418 1.219 0 2.168 1.096 2.156 2.418 0 1.334-.948 2.419-2.156 2.419Zm7.96 0c-1.182 0-2.156-1.085-2.156-2.419 0-1.333.948-2.418 2.156-2.418 1.219 0 2.168 1.096 2.156 2.418 0 1.334-.937 2.419-2.156 2.419Z" />
    </svg>
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
        <div className="profile-identity">
          <h3>{user.name ?? user.login}</h3>
          <a href={user.html_url} target="_blank" rel="noreferrer" className="profile-handle">
            @{user.login}
          </a>
          <div className="profile-social-list" aria-label="Additional social accounts">
            <a
              href="https://x.com/nyxcyrix"
              target="_blank"
              rel="noreferrer"
              className="profile-social-link"
              aria-label="X account @nyxcyrix"
            >
              <span className="profile-social-icon">
                <XLogoIcon />
              </span>
              <span>@nyxcyrix</span>
            </a>
            <span className="profile-social-link profile-social-static" aria-label="Discord account @nyxnx">
              <span className="profile-social-icon">
                <DiscordLogoIcon />
              </span>
              <span>@nyxnx</span>
            </span>
          </div>
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
