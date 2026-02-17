export interface GitHubRepo {
  id: number;
  name: string;
  html_url: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  language: string | null;
  stargazers_count: number;
  open_issues_count?: number;
  forks_count?: number;
  topics?: string[];
  archived?: boolean;
}

export type RepoActivityBucket = 'active' | 'warm' | 'stale';

export interface RepoViewModel extends GitHubRepo {
  days_since_last_commit: number;
  activity_bucket: RepoActivityBucket;
  is_archived: boolean;
}

export interface CommitDayActivity {
  date: string;
  commit_count: number;
}

export interface LanguageUsage {
  language: string;
  percentage: number;
  repo_count: number;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  bio: string | null;
  followers: number;
  following: number;
  public_repos: number;
}

export interface GitHubCacheMeta {
  username: string;
  fetched_at: string;
  source: 'github-api';
  cache_ttl_minutes: number;
}

export interface GitHubDashboardCache {
  meta: GitHubCacheMeta;
  user: GitHubUser;
  repos: GitHubRepo[];
  readme: string;
  commit_history: CommitDayActivity[];
}

export interface HugoPostSummary {
  title: string;
  summary: string;
  date: string;
  permalink: string;
  reading_time: number;
  content_html?: string;
}
