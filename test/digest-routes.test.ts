import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const tempDirs: string[] = [];

async function runsDir() {
  const dir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writeNight(dir: string, night: string, contents: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${night}.jsonl`), contents, 'utf8');
}

function appFor(dir: string) {
  return createApp({
    adapter: 'test',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
}

describe('digest routes', () => {
  it('serves existing and empty nights as HTML and the full JSON digest', async () => {
    const dir = await runsDir();
    await writeNight(dir, '2026-10-28', '');

    const htmlResponse = await appFor(dir).request('/digest/2026-10-28');
    const jsonResponse = await appFor(dir).request('/api/digest/2026-10-28');
    const html = await htmlResponse.text();

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    } satisfies DigestNight);
  });

  it('returns 404 for missing files and invalid night dates on both routes', async () => {
    const app = appFor(await runsDir());

    for (const night of ['2026-10-27', '2026-02-30', 'not-a-date']) {
      expect((await app.request(`/digest/${night}`)).status).toBe(404);
      expect((await app.request(`/api/digest/${night}`)).status).toBe(404);
    }
  });

  it('keeps HTML and JSON aligned for sorted jobs, retries, failure, owner, timestamps, and errors', async () => {
    const dir = await runsDir();
    const night = '2026-10-28';
    await writeNight(
      dir,
      night,
      [
        '{bad json',
        JSON.stringify({ at: '2026-10-28T09:00:00-05:00', job: 'zeta', status: 'ok', owner: 'Zed' }),
        JSON.stringify({ at: '2026-10-28T09:01:00-05:00', job: 'alpha', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T09:02:00-05:00', job: 'alpha', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T09:03:00-05:00', job: 'alpha', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T09:04:00-05:00', job: 'alpha', status: 'fail', owner: null, error: 'disk full' }),
        JSON.stringify({ at: '2026-10-28T09:05:00-05:00', job: 'alpha', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T10:00:00+02:00', job: 'beta', status: 'ok', owner: 'Bea' }),
        JSON.stringify({ at: '2026-10-28T11:00:00+02:00', job: 'gamma', status: 'fail', owner: 'Gus' }),
      ].join('\n'),
    );

    const app = appFor(dir);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as DigestNight;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 2, retry: 3, fail: 2 });
    expect(digest.rows.map(({ job }) => job)).toEqual(['alpha', 'beta', 'gamma', 'zeta']);

    const alpha = digest.rows[0];
    expect(alpha).toMatchObject({
      job: 'alpha',
      owner: null,
      runs: 5,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'disk full',
      firstAt: '2026-10-28T09:01:00-05:00',
      lastAt: '2026-10-28T09:05:00-05:00',
    });
    expect(html).toContain('—');
    expect(html).toContain('disk full');
    expect(html).toContain('2026-10-28T09:01:00-05:00');
    expect(html).toContain('2026-10-28T09:05:00-05:00');

    const alphaPosition = html.indexOf('alpha');
    const betaPosition = html.indexOf('beta');
    const gammaPosition = html.indexOf('gamma');
    const zetaPosition = html.indexOf('zeta');
    expect(alphaPosition).toBeGreaterThanOrEqual(0);
    expect(betaPosition).toBeGreaterThan(alphaPosition);
    expect(gammaPosition).toBeGreaterThan(betaPosition);
    expect(zetaPosition).toBeGreaterThan(gammaPosition);
    expect(html).toMatch(/alpha[\s\S]*?3[\s\S]*?ok/);
    expect(html.slice(alphaPosition - 30, alphaPosition)).toContain('class="warn"');
    expect(html.slice(gammaPosition - 30, gammaPosition)).toContain('class="warn"');
    expect(html).toMatch(/beta[\s\S]*?ok/);
    expect(html).toMatch(/gamma[\s\S]*?fail/);
    expect(html).toMatch(/zeta[\s\S]*?ok/);
  });
});
