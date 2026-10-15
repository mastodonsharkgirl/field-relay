import { useMemo, useRef, useState } from 'react';
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
type Filter = 'all' | 'ready' | 'review' | 'held' | 'duplicates';
type Stage = 'intake' | 'map' | 'review' | 'deliver';
const fixtures = {
  Northstar:
    'Order ID,Region,Quantity,Amount\nN-100,North,3,42.50\nN-100,North,3,42.50\nN-200,South,1,19.00\nN-200,East,1,19.00\nN-300,West,0,11.00\nN-400,Unknown,1,5.00\nN-500,Central,1,8.00\nN-600,East,1,500.00\nN-700,South,2,27.25',
  Orbit: 'reference,territory,units,total\nO-8,South,2,19.25\nO-9,East,1,7.00',
};
const maps = {
  Northstar: { order: 'Order ID', region: 'Region', quantity: 'Quantity', amount: 'Amount' },
  Orbit: { order: 'reference', region: 'territory', quantity: 'units', amount: 'total' },
} satisfies Record<string, Mapping>;
const download = (name: string, data: string, type: string) => {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([data], { type }));
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};

function RoutingSummary({
  source,
  ready,
  review,
  held,
  duplicates,
  delivered,
}: Record<string, number>) {
  return (
    <div className="routing-summary" aria-label="Local routing state">
      <div className="routing-flow">
        <div className="route-step source">
          <span>Source</span>
          <strong>{source} rows</strong>
        </div>
        <div className="route-step check">
          <span>Checked</span>
          <strong>{held} held</strong>
        </div>
        <div className="route-step review">
          <span>Review</span>
          <strong>{review} pending</strong>
        </div>
        <div className="route-step destination">
          <span>Local delivery</span>
          <strong>{delivered} delivered</strong>
        </div>
      </div>
      <p>
        <b>{ready} ready for local delivery</b> · {duplicates} duplicate
        {duplicates === 1 ? '' : 's'} suppressed before routing
      </p>
    </div>
  );
}

export default function DeliveryLab() {
  const [partner, setPartner] = useState<keyof typeof fixtures>('Northstar');
  const [text, setText] = useState(fixtures.Northstar);
  const [validated, setValidated] = useState(text);
  const [mapping, setMapping] = useState<Mapping>(maps.Northstar);
  const [validatedMapping, setValidatedMapping] = useState<Mapping>(maps.Northstar);
  const [approved, setApproved] = useState<Approval[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [registry, setRegistry] = useState<Registry>({});
  const [outage, setOutage] = useState(false);
  const [fileError, setFileError] = useState('');
  const [stage, setStage] = useState<Stage>('review');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const queueHeadingRef = useRef<{ focus: () => void }>(null);
  const errorSummaryRef = useRef<{ focus: () => void }>(null);
  const run = useMemo(() => ingest(text, partner.toLowerCase(), mapping), [text, partner, mapping]);
  const applied = run.accepted.map((record) =>
    approved.some((item) => item.key === record.key && item.fingerprint === record.fingerprint)
      ? approve([record], record.key, true)[0]
      : record,
  );
  const ready = applied.filter((record) => record.approval === 'approved');
  const review = applied.filter((record) => record.approval === 'pending');
  const mappingChanged = JSON.stringify(mapping) !== JSON.stringify(validatedMapping);
  const stale = text !== validated || mappingChanged;
  const inputStatus = run.errors.length
    ? 'mapping invalid'
    : stale
      ? mappingChanged
        ? 'mapping changed'
        : 'draft changed'
      : validated
        ? 'validated source'
        : 'no source';
  const delivered = ledger.filter((event) => event.status === 'delivered').length;
  const sourceRecords = run.accepted.length + run.quarantine.length + run.suppressed.length;
  const counts = {
    ready: ready.length,
    review: review.length,
    held: run.quarantine.length,
    duplicates: run.suppressed.length,
  };
  const visible = filter === 'ready' ? ready : filter === 'review' ? review : applied;
  const selectedRecord = applied.find((record) => record.key === selected) ?? null;
  const selectedHold = run.quarantine.find((item) => `held-${item.row}` === selected) ?? null;
  const invalidate = () => {
    setApproved([]);
    setSelected(null);
  };
  const validate = () => {
    const prospective = ingest(text, partner.toLowerCase(), mapping);
    invalidate();
    if (prospective.errors.length) {
      setStage('intake');
      document.defaultView?.requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }
    setValidated(text);
    setValidatedMapping(mapping);
    setStage('review');
  };
  const reset = () => {
    setText('');
    setValidated('');
    setApproved([]);
    setLedger([]);
    setRegistry({});
    setOutage(false);
    setFileError('');
    setMapping(maps[partner]);
    setValidatedMapping(maps[partner]);
    setSelected(null);
    setStage('intake');
    setFilter('all');
  };
  const pick = (next: keyof typeof fixtures) => {
    setPartner(next);
    setText(fixtures[next]);
    setValidated(fixtures[next]);
    setMapping(maps[next]);
    setValidatedMapping(maps[next]);
    setApproved([]);
    setLedger([]);
    setRegistry({});
    setOutage(false);
    setFileError('');
    setSelected(null);
    setStage('intake');
  };
  const deliver = () => {
    const next = simulateDelivery(ready, ledger, outage, registry);
    setLedger(next.ledger);
    setRegistry(next.registry);
    setStage('deliver');
  };
  const evidence = {
    partner,
    validatedSource: validated,
    validatedMapping,
    validatedRun: ingest(validated, partner.toLowerCase(), validatedMapping),
    ledger,
    registry,
    approvals: approved,
    note: 'Evidence is available only for the validated local simulation revision.',
  };
  return (
    <main className="workbench-shell">
      <header className="lab-context">
        <div className="masthead-copy">
          <p className="eyebrow">LOCAL SIMULATION / SESSION ONLY</p>
          <p>Partner CSV review desk</p>
        </div>
        <nav aria-label="Workbench links">
          <button className="text-button" onClick={reset}>
            Reset session
          </button>
        </nav>
      </header>
      <section className="identity-bar" aria-label="Current batch">
        <div>
          <span className="label">BATCH</span>
          <strong>{partner} / fixture</strong>
          <small>Browser-only • no upload</small>
        </div>
        <div>
          <span className="label">SOURCE</span>
          <strong>{validated ? `${sourceRecords} source records` : 'No source selected'}</strong>
          <small>500 KB / 5,000 row limit</small>
        </div>
        <div>
          <span className="label">NEXT ACTION</span>
          <strong>
            {stale
              ? 'Validate revised draft'
              : review.length
                ? 'Review approval queue'
                : ready.length
                  ? 'Deliver ready records'
                  : 'Choose a source'}
          </strong>
          <small>
            {stale ? 'Previous approval was cleared.' : 'Every result is derived locally.'}
          </small>
        </div>
      </section>
      <div className="workspace">
        <aside className="operational-rail">
          <p className="rail-title">RUNBOOK</p>
          {(
            [
              ['intake', '01', 'Intake'],
              ['map', '02', 'Map fields'],
              ['review', '03', 'Review queue'],
              ['deliver', '04', 'Deliver / retry'],
            ] as [Stage, string, string][]
          ).map(([id, number, label]) => (
            <button
              key={id}
              className={stage === id ? 'stage active' : 'stage'}
              aria-current={stage === id ? 'step' : undefined}
              aria-label={`${number} ${label}`}
              onClick={() => setStage(id)}
            >
              <span>{number}</span>
              {label}
            </button>
          ))}
          <div className="rail-note">
            <span className="dot" />
            Memory only
            <br />
            Reset removes this session.
          </div>
        </aside>
        <div className="work-area">
          <section className="status-deck">
            <div>
              <p className="eyebrow">ROUTING STATE</p>
              <h1>
                Check a CSV handoff <em>before</em> it moves.
              </h1>
              <p className="lede">
                Review the rows, decisions, and source cells in this browser before you run a local
                delivery simulation. Nothing leaves this device.
              </p>
            </div>
            <RoutingSummary
              source={sourceRecords}
              ready={counts.ready}
              review={counts.review}
              held={counts.held}
              duplicates={counts.duplicates}
              delivered={delivered}
            />
          </section>
          {(stage === 'intake' || stage === 'map') && (
            <section className="panel intake-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">
                    {stage === 'intake' ? '01 / SOURCE INTAKE' : '02 / FIELD MAP'}
                  </p>
                  <h2>
                    {stage === 'intake'
                      ? 'Start with a known source.'
                      : 'Name the four fields that make a record.'}
                  </h2>
                </div>
                <span className={`state-chip ${inputStatus.replaceAll(' ', '-')}`}>
                  {inputStatus}
                </span>
              </div>
              {stage === 'intake' ? (
                <>
                  <div className="partner-picker" role="group" aria-label="Choose fixture">
                    <button
                      className={
                        partner === 'Northstar' ? 'fixture-option selected' : 'fixture-option'
                      }
                      onClick={() => pick('Northstar')}
                    >
                      <b>Northstar retail</b>
                      <span>9 rows, review and conflict examples</span>
                    </button>
                    <button
                      className={partner === 'Orbit' ? 'fixture-option selected' : 'fixture-option'}
                      onClick={() => pick('Orbit')}
                    >
                      <b>Orbit wholesale</b>
                      <span>2 straightforward rows</span>
                    </button>
                  </div>
                  <label htmlFor="csv">
                    Editable CSV fixture{' '}
                    <small>Use a local sample or choose a local .csv file.</small>
                  </label>
                  <textarea
                    id="csv"
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      invalidate();
                    }}
                  />
                  <div className="input-actions">
                    <label className="file-input">
                      Read local CSV file
                      <input
                        aria-label="Read local CSV file"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          if (file.size > 500000) {
                            setFileError('Input exceeds the 500 KB local limit.');
                            setValidated('');
                            invalidate();
                            return;
                          }
                          setFileError('');
                          setText(await file.text());
                          invalidate();
                        }}
                      />
                    </label>
                    <button className="secondary" onClick={() => setStage('map')}>
                      Check field mapping
                    </button>
                    <button onClick={validate}>Validate mapping and rows</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="plain-help">
                    Mapping is explicit so a changed partner header cannot silently enter the queue.
                    Four distinct columns are required.
                  </p>
                  <div className="mapping-grid">
                    {(['order', 'region', 'quantity', 'amount'] as const).map((field) => (
                      <label key={field}>
                        {field === 'order'
                          ? 'Business order ID'
                          : `${field[0].toUpperCase() + field.slice(1)} column`}
                        <input
                          value={mapping[field]}
                          onChange={(event) => {
                            setMapping({ ...mapping, [field]: event.target.value });
                            invalidate();
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="input-actions">
                    <button className="secondary" onClick={() => setStage('intake')}>
                      Back to source
                    </button>
                    <button onClick={validate}>Validate mapping and rows</button>
                  </div>
                </>
              )}
              {[...run.errors, fileError].filter(Boolean).length > 0 && (
                <div
                  className="notice error"
                  role="alert"
                  aria-live="assertive"
                  tabIndex={-1}
                  ref={(element) => {
                    errorSummaryRef.current = element;
                  }}
                >
                  <strong>Fix this before validation:</strong>
                  <ul>
                    {[...run.errors, fileError].filter(Boolean).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {stale && (
                <p className="notice">
                  Draft or mapping changed. Validate it before approval or delivery.
                </p>
              )}
            </section>
          )}
          {(stage === 'review' || stage === 'deliver') && (
            <>
              <section className="panel queue-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">03 / DECISION QUEUE</p>
                    <h2
                      ref={(element) => {
                        queueHeadingRef.current = element;
                      }}
                      tabIndex={-1}
                    >
                      Decision queue
                    </h2>
                  </div>
                  <button className="secondary" onClick={() => setStage('map')}>
                    Edit mapping
                  </button>
                </div>
                <div className="summary-grid">
                  <button
                    onClick={() => setFilter('ready')}
                    aria-pressed={filter === 'ready'}
                    className={filter === 'ready' ? 'metric chosen' : 'metric'}
                  >
                    <b>{counts.ready}</b>
                    <span>ready to deliver</span>
                  </button>
                  <button
                    onClick={() => setFilter('review')}
                    aria-pressed={filter === 'review'}
                    className={filter === 'review' ? 'metric chosen' : 'metric'}
                  >
                    <b>{counts.review}</b>
                    <span>needs approval</span>
                  </button>
                  <button
                    onClick={() => setFilter('held')}
                    aria-pressed={filter === 'held'}
                    className={filter === 'held' ? 'metric chosen warn' : 'metric warn'}
                  >
                    <b>{counts.held}</b>
                    <span>held</span>
                  </button>
                  <button
                    onClick={() => setFilter('duplicates')}
                    aria-pressed={filter === 'duplicates'}
                    className={filter === 'duplicates' ? 'metric chosen' : 'metric'}
                  >
                    <b>{counts.duplicates}</b>
                    <span>duplicates</span>
                  </button>
                </div>
                <div className="filter-bar">
                  <span>Show</span>
                  {(['all', 'ready', 'review', 'held', 'duplicates'] as Filter[]).map((item) => (
                    <button
                      key={item}
                      className={filter === item ? 'filter selected-filter' : 'filter'}
                      aria-pressed={filter === item}
                      onClick={() => setFilter(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="queue-layout">
                  <div className="queue-table" role="region" aria-label="Decision queue">
                    {(filter === 'held' || filter === 'duplicates' ? [] : visible).map((record) => (
                      <button
                        className={selected === record.key ? 'queue-row selected-row' : 'queue-row'}
                        key={record.key}
                        aria-pressed={selected === record.key}
                        onClick={() => setSelected(record.key)}
                      >
                        <span className={`pill ${record.approval}`}>
                          {record.approval === 'pending' ? 'review' : 'ready'}
                        </span>
                        <strong>{record.orderId}</strong>
                        <span>{record.route}</span>
                        <span>Row {record.row}</span>
                      </button>
                    ))}
                    {(filter === 'all' || filter === 'held') &&
                      run.quarantine.map((item) => (
                        <button
                          className={
                            selected === `held-${item.row}`
                              ? 'queue-row held-row selected-row'
                              : 'queue-row held-row'
                          }
                          key={`held-${item.row}-${item.code}`}
                          aria-pressed={selected === `held-${item.row}`}
                          onClick={() => setSelected(`held-${item.row}`)}
                        >
                          <span className="pill held">held</span>
                          <strong>Row {item.row}</strong>
                          <span>{item.code}</span>
                          <span>Inspect source</span>
                        </button>
                      ))}
                    {(filter === 'all' || filter === 'duplicates') &&
                      run.suppressed.map((item) => (
                        <button
                          className={
                            selected === `duplicate-${item.row}`
                              ? 'queue-row selected-row'
                              : 'queue-row'
                          }
                          key={`duplicate-${item.row}`}
                          aria-pressed={selected === `duplicate-${item.row}`}
                          onClick={() => setSelected(`duplicate-${item.row}`)}
                        >
                          <span className="pill duplicate">duplicate</span>
                          <strong>{item.orderId}</strong>
                          <span>suppressed</span>
                          <span>Row {item.row}</span>
                        </button>
                      ))}
                    {!visible.length && filter !== 'held' && filter !== 'duplicates' && (
                      <p className="empty-state">
                        No records in this view. Validate a source or choose another filter.
                      </p>
                    )}
                  </div>
                  <aside className="inspection" aria-live="polite">
                    {selectedRecord ? (
                      <>
                        <p className="eyebrow">SOURCE INSPECTION</p>
                        <h3>{selectedRecord.orderId}</h3>
                        <dl>
                          <dt>Decision</dt>
                          <dd>{selectedRecord.reason}</dd>
                          <dt>Route</dt>
                          <dd>{selectedRecord.route}</dd>
                          <dt>Source row</dt>
                          <dd>{selectedRecord.row}</dd>
                          <dt>Raw cells</dt>
                          <dd>
                            <code>{selectedRecord.cells.join(' | ')}</code>
                          </dd>
                        </dl>
                        {selectedRecord.approval === 'pending' && (
                          <button
                            onClick={() => {
                              setApproved([
                                ...approved,
                                {
                                  key: selectedRecord.key,
                                  fingerprint: selectedRecord.fingerprint,
                                  decision: 'approved',
                                },
                              ]);
                              setSelected(null);
                              setAnnouncement(
                                `${selectedRecord.orderId} approved for the local simulation. ${counts.review - 1} records still need approval.`,
                              );
                              document.defaultView?.requestAnimationFrame(() =>
                                queueHeadingRef.current?.focus(),
                              );
                            }}
                          >
                            Approve record
                          </button>
                        )}
                        <p className="inspection-note">
                          Approval binds to this exact fingerprint. Editing the input clears it.
                        </p>
                      </>
                    ) : selectedHold ? (
                      <>
                        <p className="eyebrow">HELD SOURCE</p>
                        <h3>
                          Row {selectedHold.row} / {selectedHold.code}
                        </h3>
                        <p>{selectedHold.reason}</p>
                        <code>{selectedHold.source}</code>
                        <p className="inspection-note">
                          Held means this row cannot enter delivery. Repair the CSV and validate it
                          again.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="eyebrow">INSPECTION</p>
                        <h3>Select a queue row.</h3>
                        <p>
                          See the routing reason and original cells before approving or repairing a
                          record.
                        </p>
                      </>
                    )}
                  </aside>
                </div>
                <div className="exports">
                  <button
                    onClick={() =>
                      download(
                        'field-relay-evidence.json',
                        JSON.stringify(evidence, null, 2),
                        'application/json',
                      )
                    }
                    disabled={stale}
                  >
                    Export evidence JSON
                  </button>
                  <button
                    className="secondary"
                    onClick={() => download('quarantine.csv', safeCsv(run.quarantine), 'text/csv')}
                    disabled={stale}
                  >
                    Safe CSV report
                  </button>
                  <small>
                    {stale
                      ? 'Validate the revised draft before exporting evidence.'
                      : 'Exports are generated from this validated local revision. CSV values are formula-safe.'}
                  </small>
                </div>
              </section>
              <section className="panel delivery-panel">
                <div>
                  <p className="eyebrow">04 / SIMULATED DESTINATION</p>
                  <h2>Deliver only the reviewed queue.</h2>
                  <p className="plain-help">
                    An outage fails locally, retrying keeps the fingerprint, and a second successful
                    replay is recorded as a skip. No record is sent anywhere.
                  </p>
                </div>
                <div className="delivery-controls">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={outage}
                      onChange={(event) => setOutage(event.target.checked)}
                    />{' '}
                    Inject endpoint outage
                  </label>
                  <button onClick={deliver} disabled={!ready.length || stale}>
                    Deliver / retry ready records
                  </button>
                </div>
                <ol className="ledger">
                  {ledger.length ? (
                    ledger
                      .slice(-20)
                      .reverse()
                      .map((event, index) => (
                        <li key={`${event.key}-${index}`} className={event.status}>
                          <code>{event.key}</code>
                          <span>
                            {event.status} · attempt {event.attempt || '—'}
                          </span>
                          <small>{event.detail}</small>
                        </li>
                      ))
                  ) : (
                    <li className="empty-state">
                      No local delivery attempts yet.{' '}
                      {ready.length
                        ? 'Review the ready records, then simulate delivery.'
                        : 'Validate a source to begin.'}
                    </li>
                  )}
                </ol>
              </section>
            </>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <footer>
        Fictional partner-order ingestion demo. No network calls, accounts, storage, submissions, or
        real vendors.
      </footer>
    </main>
  );
}
