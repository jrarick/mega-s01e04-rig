export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestCounts = {
  ok: number;
  retry: number;
  fail: number;
};

/** One job's valid log events, aggregated in chronological order. */
export type DigestRow = {
  job: string;
  /** Owner on the latest event; null remains null, even after an earlier owner. */
  owner: string | null;
  /** Total valid events for this job, including retries and failures. */
  runs: number;
  /** Number of events whose status is retry. */
  retries: number;
  lastStatus: DigestStatus;
  /** Most recent error encountered, or null if no event supplied an error. */
  lastError: string | null;
  /** Earliest event's original timestamp string, including its offset. */
  firstAt: string;
  /** Latest event's original timestamp string, including its offset. */
  lastAt: string;
};

export type DigestNight = {
  /** One row per job, sorted ascending by job using string/code-unit order. */
  rows: DigestRow[];
  /** Nonblank lines that fail JSON parsing or log-event validation. */
  badLines: number;
  /** Status counts across all valid events, including failures before recovery. */
  counts: DigestCounts;
};

/**
 * Shared signature for the synchronous readNight implementation in this directory.
 * Read runsDir/<night>.jsonl, with night supplied as YYYY-MM-DD.
 * Return null for a missing file; an empty or blank-only file returns
 * { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } }.
 * Count and skip malformed lines without throwing.
 * Other filesystem errors may propagate.
 *
 * Order each job's events by timestamp instant, preserving the original strings
 * for display. File order breaks timestamp ties. The latest event supplies
 * owner and lastStatus. lastError retains the most recent supplied error even
 * when later events have no error; it is null only if no event supplied one.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
