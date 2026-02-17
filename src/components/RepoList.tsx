import { useMemo, useState } from 'react';
import type { RepoActivityBucket, RepoViewModel } from '../types/github';

interface RepoListProps {
  repos: RepoViewModel[];
}

type SortField = 'stargazers_count' | 'pushed_at';
type SortDirection = 'asc' | 'desc';
type ActivityFilter = 'all' | RepoActivityBucket;

function RepoGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3A1.5 1.5 0 0 1 8 3.5v9A1.5 1.5 0 0 1 6.5 14h-3A1.5 1.5 0 0 1 2 12.5v-9Zm6 1A1.5 1.5 0 0 1 9.5 3h3A1.5 1.5 0 0 1 14 4.5v8A1.5 1.5 0 0 1 12.5 14h-3A1.5 1.5 0 0 1 8 12.5v-8Z" />
    </svg>
  );
}

function ActivityGlyph({ bucket }: { bucket: RepoActivityBucket }) {
  if (bucket === 'active') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1.5A6.5 6.5 0 1 1 1.5 8 6.5 6.5 0 0 1 8 1.5Zm0 2A4.5 4.5 0 1 0 12.5 8 4.5 4.5 0 0 0 8 3.5Z" />
      </svg>
    );
  }

  if (bucket === 'warm') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1.75a6.25 6.25 0 1 1 0 12.5A6.25 6.25 0 0 1 8 1.75Zm0 2a4.25 4.25 0 1 0 4.25 4.25A4.25 4.25 0 0 0 8 3.75Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2.25a5.75 5.75 0 1 1-5.75 5.75A5.75 5.75 0 0 1 8 2.25Zm0 2A3.75 3.75 0 1 0 11.75 8 3.75 3.75 0 0 0 8 4.25Z" />
    </svg>
  );
}

function LanguageGlyph({ language }: { language: string | null }) {
  const normalized = (language ?? '').toLowerCase();

  if (normalized.includes('typescript') || normalized.includes('javascript')) {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2.5 2h11A1.5 1.5 0 0 1 15 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9A1.5 1.5 0 0 1 2.5 2Zm2 3v1.5H6v5h1.5v-5H9V5H4.5Z" />
      </svg>
    );
  }

  if (normalized.includes('python')) {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8.2 1.5c2.2 0 2.8 1 2.8 2.4v1.5H6.5c-1.4 0-2.5 1.1-2.5 2.5v1.2H2.8C1.6 9.1 1 8.2 1 7V5.8C1 3.2 2.7 1.5 5.3 1.5h2.9Zm-2 1.2a.8.8 0 1 0 .8.8.8.8 0 0 0-.8-.8Zm1.6 11.8c-2.2 0-2.8-1-2.8-2.4v-1.5h4.5c1.4 0 2.5-1.1 2.5-2.5V6.9h1.2c1.2 0 1.8.9 1.8 2.1v1.2c0 2.6-1.7 4.3-4.3 4.3H7.8Zm2-1.2a.8.8 0 1 0-.8-.8.8.8 0 0 0 .8.8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2 1.5 5.5v5L8 14l6.5-3.5v-5L8 2Zm0 2.2 4.3 2.3L8 8.8 3.7 6.5 8 4.2Zm-4 3.6 3.3 1.8v2.7L4 10.5V7.8Zm8 0v2.7l-3.3 1.8V9.6L12 7.8Z" />
    </svg>
  );
}

const ACTIVITY_LABELS: Record<RepoActivityBucket, string> = {
  active: 'Active',
  warm: 'Warm',
  stale: 'Stale'
};

export default function RepoList({ repos }: RepoListProps) {
  const [sortField, setSortField] = useState<SortField>('pushed_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [query, setQuery] = useState('');
  const [maxItems, setMaxItems] = useState(12);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [minimumStars, setMinimumStars] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  const filteredRepos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return repos.filter((repo) => {
      if (!includeArchived && repo.is_archived) {
        return false;
      }

      if (activityFilter !== 'all' && repo.activity_bucket !== activityFilter) {
        return false;
      }

      if (repo.stargazers_count < minimumStars) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [repo.name, repo.description ?? '', repo.language ?? '', ...(repo.topics ?? [])]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [repos, query, includeArchived, activityFilter, minimumStars]);

  const sortedRepos = useMemo(() => {
    const sorted = [...filteredRepos].sort((a, b) => {
      if (sortField === 'stargazers_count') {
        return a.stargazers_count - b.stargazers_count;
      }

      return Date.parse(a.pushed_at) - Date.parse(b.pushed_at);
    });

    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredRepos, sortField, sortDirection]);

  const visibleRepos = sortedRepos.slice(0, maxItems);
  const hasMoreResults = sortedRepos.length > visibleRepos.length;

  return (
    <section className="panel" id="repositories">
      <header className="panel-header">
        <h2>Repositories</h2>

        <div className="repo-sort-controls">
          <label>
            Search
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name, topic, language"
            />
          </label>

          <label>
            Show top
            <select value={maxItems} onChange={(event) => setMaxItems(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={12}>12</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <label>
            Sort by
            <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}>
              <option value="pushed_at">Last commit</option>
              <option value="stargazers_count">Stars</option>
            </select>
          </label>

          <label>
            Order
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as SortDirection)}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className="advanced-toggle"
          onClick={() => setShowAdvancedFilters((current) => !current)}
          aria-expanded={showAdvancedFilters}
        >
          {showAdvancedFilters ? 'Hide advanced filters' : 'Show advanced filters'}
        </button>

        {showAdvancedFilters ? (
          <div className="advanced-filters">
            <label>
              Activity
              <select
                value={activityFilter}
                onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}
              >
                <option value="all">All</option>
                <option value="active">Active (0-14 days)</option>
                <option value="warm">Warm (15-60 days)</option>
                <option value="stale">Stale (61+ days)</option>
              </select>
            </label>

            <label>
              Minimum stars
              <input
                type="number"
                min={0}
                value={minimumStars}
                onChange={(event) => setMinimumStars(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>

            <label className="archived-toggle">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              Include archived repos
            </label>
          </div>
        ) : null}
      </header>

      {sortedRepos.length === 0 ? (
        <div className="empty-state" role="status">
          <h3>No repositories match your filters</h3>
          <p>Try loosening filters or visit the full profile to review every repository.</p>
          <a href="https://github.com/nyxnix?tab=repositories" target="_blank" rel="noreferrer">
            Open all repositories on GitHub
          </a>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Description</th>
                <th>Language</th>
                <th>Last Commit</th>
                <th>Stars</th>
              </tr>
            </thead>
            <tbody>
              {visibleRepos.map((repo) => {
                const fullDescription = repo.description ?? 'No description available.';
                const shouldTruncate = fullDescription.length > 120;
                const isExpanded = expandedDescriptions[repo.id] ?? false;
                const shortDescription = `${fullDescription.slice(0, 117)}...`;
                const description = shouldTruncate && !isExpanded ? shortDescription : fullDescription;

                return (
                  <tr key={repo.id}>
                    <td data-label="Repository">
                      <div className="repo-name-cell">
                        <span className="cell-icon" aria-hidden="true">
                          <RepoGlyph />
                        </span>
                        <div>
                          <a href={repo.html_url} target="_blank" rel="noreferrer">
                            {repo.name}
                          </a>
                          {repo.is_archived ? <span className="archived-badge">Archived</span> : null}
                        </div>
                      </div>
                    </td>
                    <td data-label="Description">
                      <p className="repo-description">{description}</p>
                      {shouldTruncate ? (
                        <button
                          type="button"
                          className="description-toggle"
                          onClick={() =>
                            setExpandedDescriptions((current) => ({
                              ...current,
                              [repo.id]: !current[repo.id]
                            }))
                          }
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      ) : null}
                    </td>
                    <td data-label="Language">
                      <span className="chip">
                        <span className="cell-icon" aria-hidden="true">
                          <LanguageGlyph language={repo.language} />
                        </span>
                        {repo.language ?? 'Unknown'}
                      </span>
                    </td>
                    <td data-label="Last Commit">
                      <span className={`chip activity-${repo.activity_bucket}`}>
                        <span className="cell-icon" aria-hidden="true">
                          <ActivityGlyph bucket={repo.activity_bucket} />
                        </span>
                        {new Date(repo.pushed_at).toLocaleDateString()} ({ACTIVITY_LABELS[repo.activity_bucket]})
                      </span>
                    </td>
                    <td data-label="Stars">{repo.stargazers_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {hasMoreResults ? <p className="result-note">Showing {visibleRepos.length} of {sortedRepos.length} repositories.</p> : null}
        </div>
      )}
    </section>
  );
}
