import assert from 'node:assert/strict';
import test from 'node:test';
import { startLab } from './harness.ts';
import { openRelayStore } from '../relay/state.ts';
import { loadFixture } from '../relay/intake.ts';
import { identify } from '../relay/contract.ts';
import { waitUntil, controlRequest } from '../runtime.ts';
import { readVendorList } from '../relay/evidence.ts';

test('scripted resume retains mixed operator and harness approval history', async () => {
  const lab = await startLab({ mode: 'new' });
  try {
    const fixture = await lab.command(['fixture', 'northstar']);
    assert.equal(fixture.code, 0);
    const [job] = JSON.parse(fixture.stdout);
    assert.equal((await lab.command(['approve', job.jobId, '0', 'operator'])).code, 0);
    assert.equal((await lab.command(['approve', job.jobId, '1', 'harness'])).code, 0);
    assert.equal((await lab.command(['dispatch', job.jobId])).code, 0);
  } finally {
    await lab.stop();
  }
  const { launchExercise } = await import('../launch.ts');
  const { renderEvidence } = await import('../relay/evidence.ts');
  const evidence = await launchExercise({
    mode: 'resume',
    runId: lab.runId,
    scenario: 'response-loss',
    scripted: true,
  });
  assert.equal(evidence.status, 'passed');
  assert.deepEqual(
    evidence.events.filter((event) => event.kind === 'approved').map((event) => event.reason),
    ['operator', 'harness'],
  );
  const markdown = renderEvidence(evidence).markdown;
  assert.match(markdown, /revision 1, operator/);
  assert.match(markdown, /revision 2, harness/);
  assert.match(markdown, /Launcher mode: scripted/);
});

for (const stopAt of ['before-admission', 'admission'] as const) {
  test('changed content at ' + stopAt + ' preserves the exact admitted HTTP body', async () => {
    const lab = await startLab({ mode: 'new' });
    const store = openRelayStore(lab.relayPath, 'resume');
    try {
      const original = loadFixture('northstar').orders[0];
      const key = identify(original).idempotencyKey;
      const worker = lab.startRelay({ fixture: 'northstar', scripted: true, stopAt });
      const { jobId } = await worker.admitted;
      const approvedRevision = store.snapshot(jobId).approvalRevision;
      store.enqueue(
        { ...original, quantity: original.quantity + 1 },
        lab.connection.storeId,
        Date.now(),
      );
      worker.child.send({ continue: true });
      assert.equal((await worker.result).code, 0);
      assert.equal((await lab.command(['dispatch', jobId])).code, 0);
      const job = store.snapshot(jobId);
      assert.equal(job.holdReason, 'content_conflict');
      assert.deepEqual(job.order, original);
      const readback = await readVendorList(lab.connection);
      assert.equal(readback.count, stopAt === 'before-admission' ? 0 : 1);
      const observed = await lab.observeFault(key);
      assert.equal(
        (observed.lifetimeRequestCount as { post: number }).post,
        stopAt === 'before-admission' ? 0 : 1,
      );
      const admission = store.events(jobId).find((event) => event.kind === 'post_reserved');
      if (stopAt === 'admission') {
        assert.equal(admission?.approvalRevision, approvedRevision);
        assert.deepEqual(readback.orders[0].order, original);
      } else assert.equal(admission, undefined);
    } finally {
      store.close();
      await lab.stop();
    }
  });
}

test('launcher resume recovers a committed order missing its local receipt', async () => {
  const lab = await startLab({ mode: 'new' });
  const store = openRelayStore(lab.relayPath, 'resume');
  let deadline: number | null;
  try {
    const key = identify(loadFixture('northstar').orders[0]).idempotencyKey;
    await lab.configureFault(key, ['hold_after_commit']);
    const worker = lab.startRelay({ fixture: 'northstar', scripted: true, stopAt: 'commit' });
    const { jobId } = await worker.admitted;
    await waitUntil(
      async () => (await controlRequest(lab.connection, '/v1/orders')).body.count === 1,
    );
    await worker.stop();
    const before = store.snapshot(jobId);
    assert.equal(before.receipt, null);
    deadline = before.deadlineAt;
    await waitUntil(() => Date.now() > (before.leaseExpiresAt ?? 0), 6_000);
  } finally {
    store.close();
    await lab.stop();
  }
  const { launchExercise } = await import('../launch.ts');
  const evidence = await launchExercise({
    mode: 'resume',
    runId: lab.runId,
    scripted: true,
    scenario: 'response-loss',
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.scenarioResults[0].expectedCount, 1);
  assert.equal(evidence.jobs[0].postReservations, 1);
  assert.equal(evidence.jobs[0].deadlineAt, deadline);
});

for (const fault of ['malformed_success_absent', '429_repeat']) {
  test('changed content stays held after ' + fault, async () => {
    const lab = await startLab({ mode: 'new' });
    const store = openRelayStore(lab.relayPath, 'resume');
    try {
      const original = loadFixture('northstar').orders[0];
      const key = identify(original).idempotencyKey;
      await lab.configureFault(key, [fault]);
      const worker = lab.startRelay({ fixture: 'northstar', scripted: true });
      const { jobId } = await worker.admitted;
      assert.equal((await worker.result).code, 0);
      const before = store.snapshot(jobId);
      if (fault === '429_repeat') assert.equal(before.holdReason, 'post_budget_exhausted');
      else assert.equal(before.outcome, 'unknown');
      store.enqueue(
        { ...original, amountMinor: original.amountMinor + 1 },
        lab.connection.storeId,
        Date.now(),
      );
      assert.equal((await lab.command(['dispatch', jobId])).code, 0);
      assert.equal(store.snapshot(jobId).holdReason, 'content_conflict');
      assert.equal(store.snapshot(jobId).postReservations, before.postReservations);
      assert.equal((await readVendorList(lab.connection)).count, 0);
      assert.equal(
        (await lab.observeFault(key)).lifetimeRequestCount &&
          store.snapshot(jobId).identity.canonical,
        identify(original).canonical,
      );
      assert.equal(
        ((await lab.observeFault(key)).lifetimeRequestCount as { post: number }).post,
        before.postReservations,
      );
    } finally {
      store.close();
      await lab.stop();
    }
  });
}

for (const milestone of ['admission', 'commit'] as const) {
  test(
    'real relay crash at ' + milestone + ' retains budgets and recovers through readback',
    async () => {
      const lab = await startLab({ mode: 'new' });
      const store = openRelayStore(lab.relayPath, 'resume');
      try {
        const key = identify(loadFixture('northstar').orders[0]).idempotencyKey;
        if (milestone === 'commit') await lab.configureFault(key, ['hold_after_commit']);
        const worker = lab.startRelay({ fixture: 'northstar', scripted: true, stopAt: milestone });
        const { jobId } = await worker.admitted;
        if (milestone === 'commit')
          await waitUntil(
            async () => (await controlRequest(lab.connection, '/v1/orders')).body.count === 1,
          );
        await worker.stop();
        const before = store.snapshot(jobId);
        assert.equal(before.postReservations, 1);
        await lab.restartVendor();
        await waitUntil(() => Date.now() > (before.leaseExpiresAt ?? 0), 6_000);
        const recovered = await lab.command(['dispatch', jobId]);
        assert.equal(recovered.code, 0);
        const after = store.snapshot(jobId);
        assert.equal(after.outcome, 'delivered');
        assert.equal(after.deadlineAt, before.deadlineAt);
        assert.equal(after.postReservations, milestone === 'admission' ? 2 : 1);
        const events = store.events(jobId);
        assert.ok(events.find((event) => event.kind === 'read_reserved'));
        if (milestone === 'admission')
          assert.ok(
            events.find((event) => event.kind === 'read_settled')!.sequence <
              events.findLast((event) => event.kind === 'post_reserved')!.sequence,
          );
        const readback = await readVendorList(lab.connection);
        assert.equal(readback.count, 1);
        assert.deepEqual(readback.orders[0].order, after.order);
        assert.equal(readback.orders[0].vendorOrderId, after.receipt?.vendorOrderId);
      } finally {
        store.close();
        await lab.stop();
      }
    },
  );
}

test('two real relay workers cannot create a second vendor order', async () => {
  const lab = await startLab({ mode: 'new' });
  try {
    const workers = [
      lab.startRelay({ fixture: 'northstar', scripted: true }),
      lab.startRelay({ fixture: 'northstar', scripted: true }),
    ];
    const results = await Promise.all(workers.map((worker) => worker.result));
    assert.ok(results.some((result) => result.code === 0));
    const store = openRelayStore(lab.relayPath, 'resume');
    try {
      const [job] = store.list();
      assert.equal(job.postReservations, 1);
      assert.equal(job.outcome, 'delivered');
      assert.equal((await readVendorList(lab.connection)).count, 1);
    } finally {
      store.close();
    }
  } finally {
    await lab.stop();
  }
});

test('late commit after a client timeout shares the same stored order as its retry', async () => {
  const lab = await startLab({ mode: 'new' });
  try {
    const key = identify(loadFixture('northstar').orders[0]).idempotencyKey;
    await lab.configureFault(key, ['hold_before_commit']);
    const worker = lab.startRelay({ fixture: 'northstar', scripted: true });
    const { jobId } = await worker.admitted;
    const store = openRelayStore(lab.relayPath, 'resume');
    try {
      await waitUntil(() => store.snapshot(jobId).postReservations === 2);
      assert.equal((await worker.result).code, 0);
      const first = await readVendorList(lab.connection);
      assert.equal(first.count, 1);
      assert.equal(((await lab.observeFault(key)).effects as Record<string, number>)?.committed, 1);
      await lab.releaseBarrier(key);
      await waitUntil(
        async () => ((await lab.observeFault(key)).effects as Record<string, number>)?.replay === 1,
      );
      const final = await readVendorList(lab.connection);
      assert.equal(final.count, 1);
      assert.equal(final.orders[0].vendorOrderId, first.orders[0].vendorOrderId);
      assert.deepEqual(final.orders[0].order, store.snapshot(jobId).order);
    } finally {
      store.close();
    }
  } finally {
    await lab.stop();
  }
});

test('timeout after vendor commit is verified without a duplicate and survives both restarts', async () => {
  const { launchExercise } = await import('../launch.ts');
  const evidence = await launchExercise({ mode: 'new', scenario: 'response-loss', scripted: true });
  assert.equal(evidence.vendorReadback.count, 1);
  assert.deepEqual(evidence.vendorReadback.orders[0].order, evidence.jobs[0].order);
  assert.equal(evidence.jobs[0].postReservations, 1);
  assert.equal(evidence.jobs[0].observed, 'present');
  assert.equal(
    evidence.jobs[0].receipt?.vendorOrderId,
    evidence.vendorReadback.orders[0].vendorOrderId,
  );
  assert.equal(evidence.events.find((event) => event.kind === 'approved')?.reason, 'harness');
  const resumed = await launchExercise({
    mode: 'resume',
    runId: evidence.metadata.runId,
    scenario: 'response-loss',
    scripted: true,
  });
  assert.equal(resumed.vendorReadback.count, 1);
  assert.equal(
    resumed.vendorReadback.orders[0].vendorOrderId,
    evidence.vendorReadback.orders[0].vendorOrderId,
  );
  assert.equal(resumed.jobs[0].postReservations, 1);
  assert.equal(resumed.jobs[0].deadlineAt, evidence.jobs[0].deadlineAt);
  assert.equal(resumed.metadata.cleanupVerified, true);
});
