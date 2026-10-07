import type { ReconciliationMapping } from './reconcile';

const csv = (headers: string[], rows: string[][]) =>
  [headers, ...rows]
    .map((row) =>
      row.map((cell) => (/[,"\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','),
    )
    .join('\n');

const baseRows = Array.from({ length: 42 }, (_, index) => {
  const number = index + 1;
  return [
    String(number).padStart(5, '0'),
    `SKU-${String(number).padStart(2, '0')}`,
    String((number % 5) + 1),
    `${(number * 17.25).toFixed(2)}`,
    number % 3 === 0 ? 'pending' : 'confirmed',
    number === 31 ? 'Dock B\nCall before arrival' : `Batch ${Math.ceil(number / 8)}`,
  ];
});
const candidateRows = baseRows
  .filter((row) => row[0] !== '00005' && row[0] !== '00006')
  .map((row) => [row[0], row[1], row[2], row[3], row[4], row[5]]);
const amend = (id: string, column: number, value: string) => {
  const row = candidateRows.find((item) => item[0] === id);
  if (row) row[column] = value;
};
amend('00009', 2, '9');
amend('00013', 3, '999.00');
amend('00018', 5, 'Candidate note changed');

baseRows.push(['BASE-ONLY-1', 'SKU-BO1', '1', '44.00', 'confirmed', 'Not yet in candidate']);
baseRows.push(['BASE-ONLY-2', 'SKU-BO2', '3', '79.00', 'pending', 'Not yet in candidate']);
baseRows.push(['00017', 'SKU-17', '7', '293.25', 'confirmed', 'Conflicting duplicate']);
baseRows.push(['', 'SKU-BLANK', '1', '30.00', 'pending', 'Blank ID stays visible']);
candidateRows.push(['CAND-ONLY-1', 'SKU-CO1', '2', '66.00', 'confirmed', 'Candidate addition']);
candidateRows.push(['CAND-ONLY-2', 'SKU-CO2', '4', '88.00', 'pending', 'Candidate addition']);
candidateRows.push(['00022', 'SKU-22', '8', '379.50', 'confirmed', 'Conflicting duplicate']);
candidateRows.push(['', 'SKU-BLANK', '1', '30.00', 'pending', 'Blank ID stays visible']);

export const demoBaseline = csv(
  ['Order code', 'SKU', 'Units ordered', 'Invoice amount', 'Status', 'Note'],
  baseRows,
);
export const demoCandidate = csv(
  ['Fulfilment ref', 'Item', 'Units shipped', 'Amount', 'State', 'Comment'],
  candidateRows,
);
export const demoMapping: ReconciliationMapping = {
  baselineId: 'Order code',
  candidateId: 'Fulfilment ref',
  fields: [
    { baseline: 'SKU', candidate: 'Item', label: 'SKU / item' },
    { baseline: 'Units ordered', candidate: 'Units shipped', label: 'Units' },
    { baseline: 'Invoice amount', candidate: 'Amount', label: 'Amount' },
    { baseline: 'Status', candidate: 'State', label: 'Status' },
    { baseline: 'Note', candidate: 'Comment', label: 'Note' },
  ],
};
