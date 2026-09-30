import { useMemo, useState } from 'react';
import {
  approve,
  ingest,
  safeCsv,
  simulateDelivery,
  type Ledger,
  type Mapping,
  type Registry,
} from '../lib/core';
type Approval = { key: string; fingerprint: string; decision: 'approved' };
const fixtures = {
  Northstar:
    'Order ID,Region,Quantity,Amount\nN-100,North,3,42.50\nN-100,North,3,42.50\nN-200,South,1,19.00\nN-200,East,1,19.00\nN-300,West,0,11.00\nN-400,Unknown,1,5.00\nN-500,Central,1,8.00\nN-600,East,1,500.00\nN-700,South,2,27.25',
  Orbit: 'reference,territory,units,total\nO-8,South,2,19.25\nO-9,East,1,7.00',
};
const maps = {
  Northstar: { order: 'Order ID', region: 'Region', quantity: 'Quantity', amount: 'Amount' },
  Orbit: { order: 'reference', region: 'territory', quantity: 'units', amount: 'total' },
} satisfies Record<string, Mapping>;
const download = (n: string, d: string, t: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([d], { type: t }));
  a.download = n;
  a.click();
  URL.revokeObjectURL(a.href);
};
export default function Workbench() {
  const [partner, setPartner] = useState<keyof typeof fixtures>('Northstar'),
    [text, setText] = useState(fixtures.Northstar),
    [validated, setValidated] = useState(text),
    [mapping, setMapping] = useState<Mapping>(maps.Northstar),
    [approved, setApproved] = useState<Approval[]>([]),
    [ledger, setLedger] = useState<Ledger[]>([]),
    [registry, setRegistry] = useState<Registry>({}),
    [outage, setOutage] = useState(false),
    [fileError, setFileError] = useState('');
  const run = useMemo(
    () => ingest(validated, partner.toLowerCase(), mapping),
    [validated, partner, mapping],
  );
  const applied = run.accepted.map((x) =>
    approved.some((a) => a.key === x.key && a.fingerprint === x.fingerprint)
      ? approve([x], x.key, true)[0]
      : x,
  );
  const ready = applied.filter((x) => x.approval === 'approved'),
    stale = text !== validated;
  const reset = () => {
    setText('');
    setValidated('');
    setApproved([]);
    setLedger([]);
    setRegistry({});
    setOutage(false);
    setFileError('');
    setMapping(maps[partner]);
  };
  const pick = (p: keyof typeof fixtures) => {
    setPartner(p);
    setText(fixtures[p]);
    setValidated(fixtures[p]);
    setMapping(maps[p]);
    setApproved([]);
    setLedger([]);
    setRegistry({});
    setOutage(false);
    setFileError('');
  };
  const deliver = () => {
    const next = simulateDelivery(ready, ledger, outage, registry);
    setLedger(next.ledger);
    setRegistry(next.registry);
  };
  const evidence = {
    partner,
    mapping,
    run: { ...run, accepted: applied },
    ledger,
    registry,
    approvals: approved,
  };
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">FIELD RELAY · LOCAL SIMULATION</p>
          <h1>
            Field <i>Relay</i>
          </h1>
          <p className="lede">
            A careful handoff between a partner CSV and a simulated destination.
          </p>
        </div>
        <nav>
          <a href="case-study/">Case study</a>
          <a href="https://github.com/mastodonsharkgirl/field-relay" rel="noreferrer">
            GitHub
          </a>
          <button className="ghost" onClick={reset}>
            Reset session
          </button>
        </nav>
      </header>
      <section className="rail">
        <span>01 Import</span>
        <span>02 Validate</span>
        <span>03 Decide</span>
        <span>04 Replay</span>
      </section>
      <div className="grid">
        <section className="panel import">
          <div className="section-title">
            <h2>Source intake</h2>
            <small>500 KB · 5,000 rows max</small>
          </div>
          <div className="chips">
            <button
              onClick={() => pick('Northstar')}
              className={partner === 'Northstar' ? 'active' : ''}
            >
              Northstar retail
            </button>
            <button onClick={() => pick('Orbit')} className={partner === 'Orbit' ? 'active' : ''}>
              Orbit wholesale
            </button>
          </div>
          <label htmlFor="csv">Editable CSV fixture</label>
          <textarea id="csv" value={text} onChange={(e) => setText(e.target.value)} />
          <input
            aria-label="Read local CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 500000) {
                setFileError('Input exceeds the 500 KB local limit.');
                setValidated('');
                setApproved([]);
                setLedger([]);
                setRegistry({});
                return;
              }
              setFileError('');
              setText(await f.text());
            }}
          />
          <button onClick={() => setValidated(text)}>Validate mapping and rows</button>
          <div className="mapping">
            {(['order', 'region', 'quantity', 'amount'] as const).map((k) => (
              <label key={k}>
                {k[0].toUpperCase() + k.slice(1)} column
                <input
                  value={mapping[k]}
                  onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          {stale && <p className="error">Draft changed. Validate it before delivery.</p>}
          {[...run.errors, fileError].filter(Boolean).map((e) => (
            <p className="error" key={e}>
              {e}
            </p>
          ))}
        </section>
        <section className="panel outcome">
          <div className="section-title">
            <h2>Decision queue</h2>
            <small>
              {ready.length} ready · {applied.length - ready.length} awaiting approval ·{' '}
              {run.quarantine.length} held
            </small>
          </div>
          <div className="stats">
            <b>
              {ready.length}
              <small>delivery ready</small>
            </b>
            <b>
              {run.suppressed.length}
              <small>duplicates</small>
            </b>
            <b>
              {run.quarantine.length}
              <small>quarantined</small>
            </b>
          </div>
          <ul>
            {applied.map((x) => (
              <li key={x.key}>
                <strong>
                  {x.orderId} · {x.route}
                </strong>
                <span>
                  Row {x.row} · {x.region} · {(x.amountMinor / 100).toFixed(2)}
                </span>
                <small>
                  {x.reason} Source: {x.cells.join(' | ')}
                </small>
                {x.approval === 'pending' &&
                  !approved.some((a) => a.key === x.key && a.fingerprint === x.fingerprint) && (
                    <button
                      onClick={() =>
                        setApproved([
                          ...approved,
                          { key: x.key, fingerprint: x.fingerprint, decision: 'approved' },
                        ])
                      }
                      aria-label={`Approve ${x.orderId}`}
                    >
                      Approve record
                    </button>
                  )}
              </li>
            ))}
            {run.quarantine.map((x) => (
              <li className="held" key={`${x.row}${x.code}`}>
                <strong>
                  Row {x.row} · {x.code}
                </strong>
                <small>
                  {x.reason} Source: {x.source}
                </small>
              </li>
            ))}
            {run.suppressed.map((x) => (
              <li key={`s${x.row}`}>
                <strong>Row {x.row} · duplicate suppressed</strong>
                <small>Source: {x.source}</small>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button
              onClick={() =>
                download(
                  'field-relay-evidence.json',
                  JSON.stringify(evidence, null, 2),
                  'application/json',
                )
              }
            >
              Export evidence JSON
            </button>
            <button
              className="ghost"
              onClick={() => download('quarantine.csv', safeCsv(run.quarantine), 'text/csv')}
            >
              Safe CSV report
            </button>
          </div>
        </section>
      </div>
      <section className="panel delivery">
        <div>
          <p className="eyebrow">SIMULATED DESTINATION</p>
          <h2>Delivery ledger</h2>
          <p>
            Keys bind to a payload fingerprint. The session registry outlives the 500-event display.
          </p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} />{' '}
          Inject endpoint outage
        </label>
        <button onClick={deliver} disabled={!ready.length || stale}>
          Deliver / retry ready records
        </button>
        <ol>
          {ledger.length ? (
            <>
              <li className="empty">Showing latest {Math.min(ledger.length, 20)} events.</li>
              {ledger.slice(-20).map((x, i) => (
                <li key={`${x.key}${i}`} className={x.status}>
                  <code>{x.key}</code>
                  <span>
                    {x.status} · attempt {x.attempt || '—'}
                  </span>
                  <small>{x.detail}</small>
                </li>
              ))}
            </>
          ) : (
            <li className="empty">No local delivery attempts yet.</li>
          )}
        </ol>
      </section>
      <footer>
        Fictional partner-order ingestion demo. No network calls, accounts, storage or real vendors.
      </footer>
    </main>
  );
}
