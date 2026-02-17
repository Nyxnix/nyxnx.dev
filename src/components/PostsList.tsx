import { useMemo, useState } from 'react';
import type { HugoPostSummary } from '../types/github';

interface PostsListProps {
  posts: HugoPostSummary[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

type SortField = 'date' | 'title';
type SortDirection = 'asc' | 'desc';

function safeDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleDateString();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getPostPreview(post: HugoPostSummary): string {
  const summary = post.summary.trim();
  if (summary.length > 0) {
    return summary;
  }

  if (post.content_html) {
    const plain = stripHtml(post.content_html);
    return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;
  }

  return 'No summary provided.';
}

export default function PostsList({ posts, isLoading, error, onRetry }: PostsListProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [query, setQuery] = useState('');
  const [maxItems, setMaxItems] = useState(12);
  const [selectedPermalink, setSelectedPermalink] = useState<string | null>(null);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return posts;
    }

    return posts.filter((post) => {
      const previewText = getPostPreview(post);
      const haystack = `${post.title} ${previewText}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [posts, query]);

  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts].sort((a, b) => {
      if (sortField === 'title') {
        return a.title.localeCompare(b.title);
      }

      return Date.parse(a.date) - Date.parse(b.date);
    });

    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredPosts, sortField, sortDirection]);

  const visiblePosts = sortedPosts.slice(0, maxItems);
  const hasMoreResults = sortedPosts.length > visiblePosts.length;

  const selectedPostIndex = selectedPermalink
    ? sortedPosts.findIndex((post) => post.permalink === selectedPermalink)
    : -1;
  const selectedPost = selectedPostIndex >= 0 ? sortedPosts[selectedPostIndex] : null;

  const openRelativePost = (offset: number) => {
    if (selectedPostIndex < 0) {
      return;
    }

    const targetPost = sortedPosts[selectedPostIndex + offset];
    if (!targetPost) {
      return;
    }

    setSelectedPermalink(targetPost.permalink);
  };

  if (selectedPost) {
    return (
      <section className="panel posts-panel" id="posts">
        <header className="panel-header post-reader-head">
          <p className="post-reader-kicker">Reading view</p>
          <h2>{selectedPost.title}</h2>
          <p>
            {safeDateLabel(selectedPost.date)} · {Math.max(1, selectedPost.reading_time)} min read
          </p>

          <div className="post-reader-toolbar">
            <button type="button" className="advanced-toggle" onClick={() => setSelectedPermalink(null)}>
              Back to posts
            </button>

            <div className="post-reader-nav" aria-label="Post navigation">
              <button
                type="button"
                className="description-toggle"
                onClick={() => openRelativePost(-1)}
                disabled={selectedPostIndex <= 0}
              >
                Newer
              </button>
              <button
                type="button"
                className="description-toggle"
                onClick={() => openRelativePost(1)}
                disabled={selectedPostIndex === -1 || selectedPostIndex >= sortedPosts.length - 1}
              >
                Older
              </button>
            </div>
          </div>
        </header>

        {selectedPost.content_html ? (
          <article className="post-reader-body markdown-body" aria-label={`Post content: ${selectedPost.title}`}>
            <div dangerouslySetInnerHTML={{ __html: selectedPost.content_html }} />
          </article>
        ) : (
          <div className="empty-state" role="status">
            <h3>Content unavailable</h3>
            <p>The selected post body was not included in the feed yet. Rebuild Hugo output and retry.</p>
            <button type="button" className="retry-button" onClick={onRetry}>
              Reload posts
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="panel posts-panel" id="posts">
      <header className="panel-header">
        <h2>Posts</h2>
        <p>Open any post directly in this panel.</p>

        <div className="repo-sort-controls">
          <label>
            Search
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by title or summary"
            />
          </label>

          <label>
            Show top
            <select value={maxItems} onChange={(event) => setMaxItems(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={12}>12</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>

          <label>
            Sort by
            <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}>
              <option value="date">Published</option>
              <option value="title">Title</option>
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
      </header>

      {isLoading ? <p className="status">Loading posts...</p> : null}

      {error ? (
        <div className="empty-state" role="alert">
          <h3>Could not load posts</h3>
          <p>The Hugo feed is unavailable right now. Start Hugo or rebuild the site output.</p>
          <button type="button" className="retry-button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}

      {!isLoading && !error && sortedPosts.length === 0 ? (
        <div className="empty-state" role="status">
          <h3>No posts match your filters</h3>
          <p>Try a different search term or publish a new Hugo post.</p>
        </div>
      ) : null}

      {!isLoading && !error && sortedPosts.length > 0 ? (
        <div className="posts-shell" role="list" aria-label="Posts">
          {visiblePosts.map((post) => (
            <article key={post.permalink} className="post-card" role="listitem">
              <div className="post-card-meta">
                <span>{safeDateLabel(post.date)}</span>
                <span className="meta-divider" aria-hidden="true">
                  ·
                </span>
                <span>{Math.max(1, post.reading_time)} min read</span>
              </div>

              <h3 className="post-card-title">
                <button type="button" className="post-open-button" onClick={() => setSelectedPermalink(post.permalink)}>
                  {post.title}
                </button>
              </h3>

              <p className="post-card-summary">{getPostPreview(post)}</p>

              <div className="post-card-actions">
                <button type="button" className="post-action" onClick={() => setSelectedPermalink(post.permalink)}>
                  Read in panel
                </button>
              </div>
            </article>
          ))}

          {hasMoreResults ? (
            <p className="result-note">
              Showing {visiblePosts.length} of {sortedPosts.length} posts.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
