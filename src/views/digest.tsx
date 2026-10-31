import type { DigestNight, DigestRow } from '../digest/types.js';

const missing = '—';

function valueOrMissing(value: string | null): string {
  return value ?? missing;
}

function rowClass(row: DigestRow): string | undefined {
  return row.retries >= 3 || row.lastStatus === 'fail' ? 'warn' : undefined;
}

export function DigestPage({ night, digest }: { night: string; digest: DigestNight }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p>{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'} skipped</p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {[...digest.rows].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0)).map((row) => (
              <tr class={rowClass(row)}>
                <td>{row.job}</td>
                <td>{valueOrMissing(row.owner)}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{valueOrMissing(row.lastError)}</td>
                <td>{row.firstAt || missing}</td>
                <td>{row.lastAt || missing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
