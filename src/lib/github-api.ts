import type { CommitDayActivity } from '../types/github';

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
