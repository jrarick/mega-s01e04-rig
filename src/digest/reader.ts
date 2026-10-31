import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, DigestStatus, ReadNight } from './types.js';

type LogEvent = {
  at: string;
  instant: number;
  job: string;
  owner: string | null;
  status: DigestStatus;
  error?: string;
};

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseEvent(line: string): LogEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { at, job, owner, status, error } = record;
  if (
    typeof at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(at) ||
    !isDate(at.slice(0, 10)) ||
    typeof job !== 'string' || job.trim() === '' ||
    (typeof owner !== 'string' && owner !== null) ||
    (status !== 'ok' && status !== 'retry' && status !== 'fail') ||
    ('error' in record && typeof error !== 'string')
  ) return null;
  const instant = Date.parse(at);
  if (!Number.isFinite(instant)) return null;
  return { at, instant, job, owner, status, ...(typeof error === 'string' ? { error } : {}) };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isDate(night)) return null;
  let source: string;
  try {
    source = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: DigestNight = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const events: LogEvent[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event === null) {
      digest.badLines += 1;
    } else {
      events.push(event);
      digest.counts[event.status] += 1;
    }
  }

  // Stable sort preserves file order when timestamp instants are equal.
  events.sort((a, b) => a.instant - b.instant);
  const jobs = new Map<string, DigestRow>();
  for (const event of events) {
    const row = jobs.get(event.job);
    if (row === undefined) {
      jobs.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstAt: event.at,
        lastAt: event.at,
      });
    } else {
      row.owner = event.owner;
      row.runs += 1;
      row.retries += event.status === 'retry' ? 1 : 0;
      row.lastStatus = event.status;
      row.lastError = event.error ?? row.lastError;
      row.lastAt = event.at;
    }
  }
  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
