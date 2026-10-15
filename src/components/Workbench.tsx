import { useEffect, useMemo, useRef, useState } from 'react';
import DeliveryLab from './DeliveryLab';
import Brand from './Brand';
import { demoBaseline, demoCandidate, demoMapping } from '../lib/comparison-fixture';
import {
  canAcceptCandidate,
  buildReviewPack,
  compareExports,
  safeReconciliationCsv,
  validReviewDecisions,
  type ComparisonItem,
  type ComparisonStatus,
  type FieldMap,
  type ReconciliationMapping,
  type ReviewDecision,
} from '../lib/reconcile';

type View = 'compare' | 'lab';
type Disposition = '' | 'hold' | 'accept-candidate' | 'ignore';
type Decision = ReviewDecision;
type DraftDecision = { disposition: Disposition; reason: string };
const statuses: Array<{ id: 'all' | ComparisonStatus; label: string }> = [
  { id: 'all', label: 'All findings' },
  { id: 'changed', label: 'Changed' },
  { id: 'baseline-only', label: 'Missing from candidate' },
  { id: 'candidate-only', label: 'Only in candidate' },
  { id: 'ambiguous', label: 'Duplicate IDs' },
  { id: 'blank-id', label: 'Blank IDs' },
];
const download = (name: string, data: string, type: string) => {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([data], { type }));
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};
const emptyMapping = (): ReconciliationMapping => ({ baselineId: '', candidateId: '', fields: [] });
const stateLabel: Record<ComparisonStatus, string> = {
  unchanged: 'Unchanged',
  changed: 'Changed',
  'baseline-only': 'Missing from candidate',
  'candidate-only': 'Only in candidate',
  ambiguous: 'Duplicate ID',
  'blank-id': 'Blank ID',
};

function RowEvidence({ title, rows }: { title: string; rows: ComparisonItem['baseline'] }) {
  const [shown, setShown] = useState(20);
  const visibleRows = rows.slice(0, shown);
  return (
    <section className="evidence-side">
      <p className="eyebrow">{title}</p>
      {rows.length ? (
        visibleRows.map((row) => (
          <div className="source-card" key={`${title}-${row.row}`}>
            <strong>CSV line {row.row}</strong>
            <dl className="raw-cells">
              {Object.entries(row.values).map(([header, value]) => (
                <div key={header}>
                  <dt>{header}</dt>
                  <dd>{value || <em>(empty)</em>}</dd>
                </div>
              ))}
            </dl>
            <details>
              <summary>Exact raw CSV record</summary>
              <code>{row.raw}</code>
            </details>
          </div>
        ))
      ) : (
        <p className="plain-help">No matching record in this export.</p>
      )}
      {rows.length > shown && (
        <button className="text-button" onClick={() => setShown(shown + 20)}>
          Show 20 more of {rows.length} source rows
        </button>
      )}
    </section>
  );
}

function ReconciliationDesk() {
  const [baseline, setBaseline] = useState(demoBaseline);
  const [candidate, setCandidate] = useState(demoCandidate);
  const [baselineFileName, setBaselineFileName] = useState('fictional-baseline.csv');
  const [candidateFileName, setCandidateFileName] = useState('fictional-candidate.csv');
  const [mapping, setMapping] = useState<ReconciliationMapping>(demoMapping);
  const [trimOuterWhitespace, setTrimOuterWhitespace] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | ComparisonStatus>('all');
  const [search, setSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});
  const [exportPrompt, setExportPrompt] = useState<'csv' | 'json' | null>(null);
  const findingsHeadingRef = useRef<{ focus: () => void }>(null);
  const detailHeadingRef = useRef<{ focus: () => void }>(null);
  const exportDialogRef = useRef<{
    open: boolean;
    showModal: () => void;
    close: () => void;
  } | null>(null);
  const exportDialogHeadingRef = useRef<{ focus: () => void }>(null);
  const exportTriggerRef = useRef<{ focus: () => void } | null>(null);
  const report = useMemo(
    () => compareExports({ baseline, candidate, mapping, trimOuterWhitespace }),
    [baseline, candidate, mapping, trimOuterWhitespace],
  );
  const baselineHeaders = report.baseline.headers;
  const candidateHeaders = report.candidate.headers;
  const fictionalExample =
    baseline === demoBaseline &&
    candidate === demoCandidate &&
    baselineFileName === 'fictional-baseline.csv' &&
    candidateFileName === 'fictional-candidate.csv';
  useEffect(() => {
    setDecisions({});
    setDrafts({});
    setSelected(null);
    setMobileDetail(false);
    setVisibleLimit(50);
  }, [baseline, candidate, mapping, trimOuterWhitespace]);
  const issues = report.items.filter((item) => item.status !== 'unchanged');
  const visible = issues.filter(
    (item) =>
      (filter === 'all' || item.status === filter) &&
      `${item.key} ${item.reason} ${item.changes.map((change) => change.label).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selectedItem = issues.find((item) => item.id === selected) ?? null;
  const unsavedDrafts = issues.filter((item) => {
    const draft = drafts[item.id];
    if (!draft || (!draft.disposition && !draft.reason.trim())) return false;
    const saved = decisions[item.id];
    return draft.disposition !== saved?.disposition || draft.reason.trim() !== saved?.reason;
  });
  const unresolved = issues.filter(
    (item) =>
      !decisions[item.id] ||
      decisions[item.id].disposition === 'hold' ||
      item.status === 'ambiguous' ||
      item.status === 'blank-id',
  ).length;
  const hasIncompleteUnsavedReview = unsavedDrafts.some((item) => {
    const draft = drafts[item.id];
    return (
      !draft?.disposition ||
      !draft.reason.trim() ||
      (draft.disposition === 'accept-candidate' && !canAcceptCandidate(item))
    );
  });
  const updateMapping = (change: Partial<ReconciliationMapping>) =>
    setMapping({ ...mapping, ...change });
  const updateField = (index: number, change: Partial<FieldMap>) =>
    setMapping({
      ...mapping,
      fields: mapping.fields.map((field, current) =>
        current === index ? { ...field, ...change } : field,
      ),
    });
  const loadOwnFiles = () => {
    setBaseline('');
    setCandidate('');
    setBaselineFileName('');
    setCandidateFileName('');
    setMapping(emptyMapping());
    setTrimOuterWhitespace(false);
    setSetupOpen(true);
  };
  const loadExample = () => {
    setBaseline(demoBaseline);
    setCandidate(demoCandidate);
    setBaselineFileName('fictional-baseline.csv');
    setCandidateFileName('fictional-candidate.csv');
    setMapping(demoMapping);
    setTrimOuterWhitespace(false);
    setSetupOpen(false);
  };
  const readFile = async (
    file: { name: string; text: () => Promise<string> } | undefined,
    target: 'baseline' | 'candidate',
  ) => {
    if (!file) return;
    const text = await file.text();
    if (target === 'baseline') {
      setBaseline(text);
      setBaselineFileName(file.name);
    } else {
      setCandidate(text);
      setCandidateFileName(file.name);
    }
  };
  const updateDraft = (id: string, change: Partial<DraftDecision>) => {
    const current = drafts[id] ?? { disposition: '', reason: '' };
    setDrafts({ ...drafts, [id]: { ...current, ...change } });
  };
  const saveDecision = (id: string) => {
    const draft = drafts[id];
    const item = issues.find((candidate) => candidate.id === id);
    if (!draft?.disposition || !draft.reason.trim() || !item) return;
    if (draft.disposition === 'accept-candidate' && !canAcceptCandidate(item)) return;
    setDecisions({
      ...decisions,
      [id]: {
        disposition: draft.disposition as Exclude<Disposition, ''>,
        reason: draft.reason.trim(),
        revision: report.revision,
      },
    });
  };
  const saveUnsavedReviews = () => {
    const next = { ...decisions };
    for (const item of unsavedDrafts) {
      const draft = drafts[item.id];
      if (!draft?.disposition || !draft.reason.trim()) continue;
      if (draft.disposition === 'accept-candidate' && !canAcceptCandidate(item)) continue;
      next[item.id] = {
        disposition: draft.disposition as Exclude<Disposition, ''>,
        reason: draft.reason.trim(),
        revision: report.revision,
      };
    }
    setDecisions(next);
  };
  const discardUnsavedReviews = () => {
    const next = { ...drafts };
    for (const item of unsavedDrafts) delete next[item.id];
    setDrafts(next);
    setExportPrompt(null);
  };
  const exportJson = () => {
    const eligibleDecisions = validReviewDecisions(issues, decisions, report.revision);
    download(
      'field-relay-reconciliation-review.json',
      JSON.stringify(
        {
          ...buildReviewPack({
            report,
            baseline,
            candidate,
            baselineFileName,
            candidateFileName,
            decisions,
          }),
          unresolved: issues.filter(
            (item) =>
              !eligibleDecisions[item.id] ||
              eligibleDecisions[item.id].disposition === 'hold' ||
              item.status === 'ambiguous' ||
              item.status === 'blank-id',
          ),
          note: 'Local review only. No source system was updated.',
        },
        null,
        2,
      ),
      'application/json',
    );
  };
  const requestExport = (kind: 'csv' | 'json', trigger?: { focus: () => void }) => {
    if (unsavedDrafts.length) {
      exportTriggerRef.current = trigger ?? null;
      setExportPrompt(kind);
      return;
    }
    if (kind === 'csv')
      download(
        'field-relay-findings.csv',
        safeReconciliationCsv(issues, decisions, report.revision),
        'text/csv',
      );
    else exportJson();
  };
  const completeExport = () => {
    const kind = exportPrompt;
    setExportPrompt(null);
    if (kind === 'csv')
      download(
        'field-relay-findings.csv',
        safeReconciliationCsv(issues, decisions, report.revision),
        'text/csv',
      );
    else if (kind === 'json') exportJson();
  };
  const dismissExportPrompt = () => {
    setExportPrompt(null);
    document.defaultView?.requestAnimationFrame(() => exportTriggerRef.current?.focus());
  };
  useEffect(() => {
    if (mobileDetail && selectedItem)
      document.defaultView?.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }, [mobileDetail, selectedItem]);
  useEffect(() => {
    const dialog = exportDialogRef.current;
    if (!dialog) return;
    if (exportPrompt) {
      if (!dialog.open) dialog.showModal();
      document.defaultView?.requestAnimationFrame(() => exportDialogHeadingRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
    }
  }, [exportPrompt]);
  return (
    <main className="workbench-shell reconciliation-shell">
      <section className="compare-intro">
        <div>
          <p className="eyebrow">
            <span className="status-dot" /> RECONCILIATION WORKSPACE
          </p>
          <h1>Find what changed.</h1>
          <p className="lede">
            Match IDs, inspect changed or missing rows, then download the original evidence.
          </p>
          <div className="intro-actions">
            <button
              onClick={loadExample}
              aria-label={
                fictionalExample ? 'Reload fictional example' : 'Try a fictional order handoff'
              }
            >
              {fictionalExample ? 'Reload example' : 'Try an example'}
            </button>
            <button className="secondary" onClick={loadOwnFiles}>
              Use your files
            </button>
            {!setupOpen && (
              <button
                className="text-button"
                aria-label="Change inputs and mapping"
                onClick={() => setSetupOpen(true)}
              >
                Inputs &amp; mapping
              </button>
            )}
          </div>
          <p className="lifetime-note">
            <strong>Local only.</strong>{' '}
            <span>Save a report before closing; nothing is updated downstream.</span>
          </p>
        </div>
        <div className="comparison-visual" aria-label="Current comparison inputs">
          <div className="document-pair">
            <div className="document-tile">
              <span className="document-letter">A</span>
              <strong>Baseline</strong>
              <span className="document-name">{baselineFileName || 'Pasted input'}</span>
              <i />
              <i />
              <i />
            </div>
            <svg className="document-connector" viewBox="0 0 60 44" fill="none" aria-hidden="true">
              <path
                d="M4 15h46m-8-7 8 7-8 7M56 31H10m8-7-8 7 8 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="document-tile candidate-tile">
              <span className="document-letter">B</span>
              <strong>Candidate</strong>
              <span className="document-name">{candidateFileName || 'Pasted input'}</span>
              <i />
              <i />
              <i />
            </div>
          </div>
          <p>Two exports. One reviewable handoff.</p>
        </div>
      </section>
      {setupOpen && (
        <>
          <section className="input-grid">
            {(
              [
                ['Baseline export', baseline, setBaseline, 'baseline'],
                ['Candidate export', candidate, setCandidate, 'candidate'],
              ] as const
            ).map(([title, value, setValue, target]) => (
              <section className="panel export-input" key={title}>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">
                      {target === 'baseline' ? 'A / BASELINE' : 'B / CANDIDATE'}
                    </p>
                    <h2>{title}</h2>
                  </div>
                  <span className="source-state">
                    {fictionalExample ? 'Fictional example data' : 'Local data in this tab'}
                  </span>
                  <label className="file-input">
                    Read local CSV
                    <input
                      aria-label={`Read ${title} file`}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => void readFile(event.target.files?.[0], target)}
                    />
                  </label>
                </div>
                <label>
                  Paste CSV
                  <textarea
                    value={value}
                    onChange={(event) => {
                      setValue(event.target.value);
                      if (target === 'baseline') setBaselineFileName('');
                      else setCandidateFileName('');
                    }}
                  />
                </label>
                <small>
                  {target === 'baseline'
                    ? report.baseline.fingerprint
                    : report.candidate.fingerprint}
                </small>
              </section>
            ))}
          </section>
          <section className="panel mapping-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">EXPLICIT MATCHING</p>
                <h2>Map the same business record in both exports.</h2>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={trimOuterWhitespace}
                  onChange={(event) => setTrimOuterWhitespace(event.target.checked)}
                />
                Trim outer whitespace while comparing
              </label>
            </div>
            <p className="plain-help">
              IDs and values compare exactly by default. Trimming is visible here and can make
              formerly distinct IDs collide; amounts, dates, and leading zeroes are never converted.
            </p>
            <div className="mapping-grid comparison-map">
              <label>
                Baseline business ID
                <select
                  value={mapping.baselineId}
                  onChange={(event) => updateMapping({ baselineId: event.target.value })}
                >
                  <option value="">Choose a column</option>
                  {baselineHeaders.map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </select>
              </label>
              <label>
                Candidate business ID
                <select
                  value={mapping.candidateId}
                  onChange={(event) => updateMapping({ candidateId: event.target.value })}
                >
                  <option value="">Choose a column</option>
                  {candidateHeaders.map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field-maps">
              <div className="field-map-header">
                <strong>Fields to compare</strong>
                <button
                  className="text-button"
                  onClick={() =>
                    setMapping({
                      ...mapping,
                      fields: [...mapping.fields, { baseline: '', candidate: '', label: '' }],
                    })
                  }
                >
                  Add field
                </button>
              </div>
              {mapping.fields.map((field, index) => (
                <div className="field-map" key={index}>
                  <input
                    aria-label={`Comparison label ${index + 1}`}
                    value={field.label}
                    placeholder="Label"
                    onChange={(event) => updateField(index, { label: event.target.value })}
                  />
                  <select
                    aria-label={`Baseline comparison column ${index + 1}`}
                    value={field.baseline}
                    onChange={(event) => updateField(index, { baseline: event.target.value })}
                  >
                    <option value="">Baseline column</option>
                    {baselineHeaders.map((header) => (
                      <option key={header}>{header}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Candidate comparison column ${index + 1}`}
                    value={field.candidate}
                    onChange={(event) => updateField(index, { candidate: event.target.value })}
                  >
                    <option value="">Candidate column</option>
                    {candidateHeaders.map((header) => (
                      <option key={header}>{header}</option>
                    ))}
                  </select>
                  <button
                    className="text-button"
                    aria-label={`Remove comparison field ${index + 1}`}
                    onClick={() =>
                      setMapping({
                        ...mapping,
                        fields: mapping.fields.filter((_, current) => current !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {report.blocked.length ? (
        <section className="notice error" role="alert">
          <strong>Comparison is blocked.</strong>
          <ul>
            {report.blocked.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <p>
            Fix both inputs and the mapping before interpreting findings. This is not a
            zero-difference result.
          </p>
        </section>
      ) : (
        <>
          <section className="result-strip" aria-label="Comparison summary">
            <div>
              <span>Baseline data records</span>
              <strong>{report.stats.baselineRows}</strong>
            </div>
            <div>
              <span>Candidate data records</span>
              <strong>{report.stats.candidateRows}</strong>
            </div>
            <div>
              <span>Unique nonblank IDs</span>
              <strong>{report.stats.comparedGroups}</strong>
            </div>
            <div>
              <span>Findings to review</span>
              <strong>{issues.length}</strong>
            </div>
            <div>
              <span>Unresolved</span>
              <strong>{unresolved}</strong>
            </div>
          </section>
          <section className="panel findings-panel">
            <div className="panel-heading">
              <div>
                <h2>Review the differences.</h2>
                <p className="source-state result-state">
                  {fictionalExample
                    ? 'Fictional example data loaded'
                    : 'Local CSV or pasted data loaded'}
                </p>
              </div>
              <a className="download-jump" href="#report-downloads">
                Downloads <span aria-hidden="true">↓</span>
              </a>
            </div>
            <dialog
              className="export-review-dialog"
              ref={(element) => {
                exportDialogRef.current = element;
              }}
              aria-labelledby="export-review-dialog-heading"
              onCancel={(event) => {
                event.preventDefault();
                dismissExportPrompt();
              }}
            >
              {exportPrompt && (
                <div>
                  <h2
                    id="export-review-dialog-heading"
                    ref={(element) => {
                      exportDialogHeadingRef.current = element;
                    }}
                    tabIndex={-1}
                  >
                    Unsaved review before download
                  </h2>
                  <p>
                    <strong>
                      {unsavedDrafts.length} unsaved review{unsavedDrafts.length === 1 ? '' : 's'}{' '}
                      will be omitted.
                    </strong>
                  </p>
                  <p>Save these reviews, discard them, or explicitly download without them.</p>
                  <ul>
                    {unsavedDrafts.map((item) => (
                      <li key={item.id}>{item.key}</li>
                    ))}
                  </ul>
                  {hasIncompleteUnsavedReview && (
                    <p>Complete each disposition and reason before saving, or discard its draft.</p>
                  )}
                  <div className="export-prompt-actions">
                    <button
                      onClick={() => {
                        saveUnsavedReviews();
                        dismissExportPrompt();
                      }}
                      disabled={hasIncompleteUnsavedReview}
                    >
                      Save unsaved reviews
                    </button>
                    <button className="secondary" onClick={discardUnsavedReviews}>
                      Discard unsaved reviews
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        completeExport();
                        dismissExportPrompt();
                      }}
                    >
                      Export without {unsavedDrafts.length} unsaved review
                      {unsavedDrafts.length === 1 ? '' : 's'}
                    </button>
                  </div>
                </div>
              )}
            </dialog>

            <div className="finding-controls">
              <div className="filter-bar">
                {statuses.map((status) => (
                  <button
                    key={status.id}
                    className={filter === status.id ? 'filter selected-filter' : 'filter'}
                    aria-pressed={filter === status.id}
                    onClick={() => setFilter(status.id)}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
              <label className="mobile-filter-control">
                Filter findings
                <select
                  aria-label="Filter findings"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as 'all' | ComparisonStatus)}
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search findings
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ID or changed field"
                />
              </label>
            </div>
            <p className="plain-help findings-count" aria-live="polite">
              {visible.length} matching finding{visible.length === 1 ? '' : 's'} · showing{' '}
              {Math.min(visible.length, visibleLimit)}. Downloads include every finding.
            </p>
            <div className={mobileDetail ? 'reconcile-layout mobile-detail' : 'reconcile-layout'}>
              <div className="finding-list" role="region" aria-label="Reconciliation findings">
                <h3
                  ref={(element) => {
                    findingsHeadingRef.current = element;
                  }}
                  tabIndex={-1}
                >
                  Findings
                </h3>
                {visible.slice(0, visibleLimit).map((item) => (
                  <button
                    key={item.id}
                    className={selected === item.id ? 'finding-row selected-row' : 'finding-row'}
                    aria-pressed={selected === item.id}
                    onClick={() => {
                      setSelected(item.id);
                      if (document.defaultView?.matchMedia('(max-width: 900px)').matches)
                        setMobileDetail(true);
                    }}
                  >
                    <span className={`pill ${item.status}`}>{stateLabel[item.status]}</span>
                    <strong>{item.key}</strong>
                    <span>{item.reason}</span>
                    <small>
                      B {item.baseline.map((row) => row.row).join(', ') || '—'} · C{' '}
                      {item.candidate.map((row) => row.row).join(', ') || '—'}
                      {' · '}
                      {decisions[item.id]
                        ? decisions[item.id].disposition === 'hold'
                          ? 'held — reviewed'
                          : 'review saved'
                        : 'unreviewed'}
                    </small>
                  </button>
                ))}
                {!visible.length && <p className="empty-state">No findings match this filter.</p>}
                {visible.length > visibleLimit && (
                  <button
                    className="secondary show-more"
                    onClick={() => setVisibleLimit(visibleLimit + 50)}
                  >
                    Show 50 more of {visible.length} matching findings
                  </button>
                )}
              </div>
              <aside className="inspection reconcile-inspection" aria-live="polite">
                {selectedItem ? (
                  <>
                    {mobileDetail && (
                      <button
                        className="text-button back-to-findings"
                        onClick={() => {
                          setMobileDetail(false);
                          document.defaultView?.requestAnimationFrame(() =>
                            findingsHeadingRef.current?.focus(),
                          );
                        }}
                      >
                        Back to findings
                      </button>
                    )}
                    <p className="eyebrow">SIDE-BY-SIDE EVIDENCE</p>
                    <h3
                      ref={(element) => {
                        detailHeadingRef.current = element;
                      }}
                      tabIndex={-1}
                    >
                      {selectedItem.key}
                    </h3>
                    <p>{selectedItem.reason}</p>
                    {selectedItem.changes.length > 0 && (
                      <dl className="changes">
                        {selectedItem.changes.map((change) => (
                          <div key={change.label}>
                            <dt>{change.label}</dt>
                            <dd>
                              <s>{change.baseline}</s>
                              <b>{change.candidate}</b>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <div className="evidence-grid">
                      <RowEvidence
                        key={`${selectedItem.id}-baseline`}
                        title="Baseline export"
                        rows={selectedItem.baseline}
                      />
                      <RowEvidence
                        key={`${selectedItem.id}-candidate`}
                        title="Candidate export"
                        rows={selectedItem.candidate}
                      />
                    </div>
                    <fieldset>
                      <legend>Reviewer disposition</legend>
                      <label>
                        <select
                          aria-label="Reviewer disposition"
                          value={drafts[selectedItem.id]?.disposition ?? ''}
                          onChange={(event) =>
                            updateDraft(selectedItem.id, {
                              disposition: event.target.value as Disposition,
                            })
                          }
                        >
                          <option value="">Choose a disposition</option>
                          <option value="hold">Hold for follow-up</option>
                          <option
                            value="accept-candidate"
                            disabled={!canAcceptCandidate(selectedItem)}
                          >
                            Accept Candidate as current
                          </option>
                          <option value="ignore">Ignore as expected</option>
                        </select>
                      </label>
                      <label>
                        Reason or next step
                        <textarea
                          value={drafts[selectedItem.id]?.reason ?? ''}
                          onChange={(event) =>
                            updateDraft(selectedItem.id, { reason: event.target.value })
                          }
                          placeholder="Record the local review reason"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => saveDecision(selectedItem.id)}
                        disabled={
                          !drafts[selectedItem.id]?.disposition ||
                          !drafts[selectedItem.id]?.reason.trim()
                        }
                      >
                        Save review
                      </button>
                    </fieldset>
                    {decisions[selectedItem.id] && (
                      <p className="inspection-note">
                        {decisions[selectedItem.id].disposition === 'hold'
                          ? 'Hold saved. This item remains unresolved.'
                          : 'Saved for this exact comparison revision.'}
                      </p>
                    )}
                    {!canAcceptCandidate(selectedItem) && (
                      <p className="notice">
                        Accept Candidate is available only for a one-to-one changed record. Hold or
                        ignore can still document this finding.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <svg
                      className="inspection-illustration"
                      viewBox="0 0 100 88"
                      fill="none"
                      aria-hidden="true"
                    >
                      <rect
                        x="12"
                        y="14"
                        width="48"
                        height="58"
                        rx="8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M24 30h24M24 40h16M24 50h10"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="64"
                        cy="52"
                        r="18"
                        fill="var(--surface)"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="m77 65 12 12M57 52h14M64 45v14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <p className="eyebrow">INSPECTION</p>
                    <h3>Select a finding.</h3>
                    <p>
                      Compare exact source rows and record a local disposition where a one-to-one
                      match exists.
                    </p>
                  </>
                )}
              </aside>
            </div>
            <div className="export-actions report-downloads" id="report-downloads">
              <button onClick={(event) => requestExport('csv', event.currentTarget)}>
                Download findings CSV
              </button>
              <button
                className="secondary"
                onClick={(event) => requestExport('json', event.currentTarget)}
              >
                Download review pack
              </button>
            </div>
            <details className="counting-notes">
              <summary>How these findings are counted</summary>
              <p className="plain-help findings-explanation">
                {report.stats.unchanged} unchanged one-to-one IDs are excluded from this review
                list. Duplicate and blank-ID rows remain findings and cannot be accepted as
                replacements.
              </p>
            </details>
          </section>
        </>
      )}
    </main>
  );
}

export default function Workbench() {
  const [view, setView] = useState<View>('compare');
  const comparisonPanel = useRef<{ focus: () => void }>(null);
  const deliveryPanel = useRef<{ focus: () => void }>(null);
  const changeView = (next: View) => {
    setView(next);
    document.defaultView?.requestAnimationFrame(() =>
      (next === 'compare' ? comparisonPanel : deliveryPanel).current?.focus(),
    );
  };
  return (
    <>
      <header className="app-topbar">
        <Brand />
        <nav className="mode-switch" aria-label="Field Relay mode">
          <button aria-pressed={view === 'compare'} onClick={() => changeView('compare')}>
            Reconcile exports
          </button>
          <button aria-pressed={view === 'lab'} onClick={() => changeView('lab')}>
            Delivery simulator lab
          </button>
        </nav>
        <nav className="app-links" aria-label="Field Relay areas">
          <a href="walkthrough/">
            Interview walkthrough <span aria-hidden="true">↗</span>
          </a>
          <a href="case-study/">Case study</a>
          <a href="https://github.com/mastodonsharkgirl/field-relay" rel="noreferrer">
            Source
          </a>
        </nav>
      </header>
      <div
        ref={(element) => {
          comparisonPanel.current = element;
        }}
        tabIndex={-1}
        hidden={view !== 'compare'}
      >
        <ReconciliationDesk />
      </div>
      <div
        ref={(element) => {
          deliveryPanel.current = element;
        }}
        tabIndex={-1}
        hidden={view !== 'lab'}
      >
        <DeliveryLab />
      </div>
    </>
  );
}
