import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const empty = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
const event = { at: '2026-10-28T23:00:00+01:00', job: 'job', owner: 'rook', status: 'ok' };

describe('readNight', () => {
  let runsDir: string;
  beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-')); });
  afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

  function writeEvents(events: unknown[]) {
    writeFileSync(join(runsDir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join('\n'));
  }

  it('reads the supplied night without dropping missing owners or recovered errors', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 1, retries: 0 });
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
      lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('orders by timestamp instant, breaks ties by file order, and preserves offsets', () => {
    writeEvents([
      { ...event, at: '2026-10-29T01:00:00+02:00', status: 'fail', error: 'latest error' },
      { ...event, at: '2026-10-28T22:00:00Z', status: 'retry', error: 'earlier error' },
      { ...event, at: '2026-10-28T18:00:00-05:00', owner: null },
      { ...event, job: 'Z' },
      { ...event, job: 'a' },
    ]);
    const digest = readNight(runsDir, night);
    expect(digest?.rows.map((row) => row.job)).toEqual(['Z', 'a', 'job']);
    expect(digest?.rows[2]).toEqual({
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-28T22:00:00Z', lastAt: '2026-10-28T18:00:00-05:00',
    });
    expect(digest?.counts).toEqual({ ok: 3, retry: 1, fail: 1 });
  });

  it('counts malformed JSON and schema failures while continuing to later valid lines', () => {
    const invalid: unknown[] = [
      null, [], 7, 'text', {},
      { ...event, at: 7 }, { ...event, at: 'not a date' },
      { ...event, at: '2026-02-30T23:00:00Z' },
      { ...event, at: '2026-10-28T23:00:00' },
      { ...event, at: '2026-10-28T24:00:00Z' },
      { ...event, job: null }, { ...event, job: ' ' },
      { ...event, owner: undefined }, { ...event, owner: 7 },
      { ...event, status: 'unknown' }, { ...event, error: null }, { ...event, error: 7 },
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      ' ', '{broken', ...invalid.map((value) => JSON.stringify(value)), '', JSON.stringify(event), '',
    ].join('\r\n'));
    expect(readNight(runsDir, night)).toEqual({
      rows: [{ job: 'job', owner: 'rook', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: event.at, lastAt: event.at }],
      badLines: invalid.length + 1,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
  });

  it('keeps an explicitly supplied empty error', () => {
    writeEvents([{ ...event, error: 'previous' }, { ...event, error: '' }, event]);
    expect(readNight(runsDir, night)?.rows[0].lastError).toBe('');
  });

  it('returns null for missing files and invalid or traversing night identifiers', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeEvents([event]);
    // This path would resolve to the existing fixture if the night were not checked.
    expect(readNight(runsDir, `../${basename(runsDir)}/${night}`)).toBeNull();
    for (const invalid of ['../2026-10-28', '/2026-10-28', '2026-10-28.jsonl', '2026-02-30', '2026-1-1', '']) {
      expect(readNight(runsDir, invalid)).toBeNull();
    }
  });

  it.each(['', ' \n\t\r\n'])('returns an empty digest for empty or blank-only files', (source) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), source);
    expect(readNight(runsDir, night)).toEqual(empty);
  });

  it('propagates filesystem errors other than a missing file', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});
