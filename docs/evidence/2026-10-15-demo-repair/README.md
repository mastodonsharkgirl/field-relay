# Repaired demo and published preview evidence

Implementation: `b6ce88951f46270bf94e98e4ef3487fe961a04f1`. [Release, review and limits](../../integration/DEMO_REPAIR_AND_PREVIEW_2026-10-15.md).

- [Integration summary](integration-summary.json), [Node output](node-ci.log), [Python output](python-ci.log): 101 Node / 27 Python, zero failures/skips/cancellations.
- [Fresh demo 1](demo-1.md), [demo 2](demo-2.md), [demo 3](demo-3.md), [resume](resume.md): clean source, passing scenarios, exact final readback, cleanup and credential scans.
- [Control-timeout observation](control-timeout.md) and [JSON](control-timeout.json): later desktop failure at `cfde951`, retained separately from the historical unknown failure.
- [Build inventory](build-provenance.json), [deployment readback](deployment.json), [live browser check](live-check.json): tested bundle, hosted source identity, live file hashes and interaction evidence.
- Failing and passing focused logs are retained here. Their overlapping counts are not added to the full suite. The historical unknown failure remains in [the earlier record](../2026-10-15-mock-http/audited/failed-initial.md).

The source and hosted demonstration use fictional data. Database files and credentials are excluded. Reports were copied without changing source, commands or outcomes; formatting may normalize whitespace only. Screenshots remain local under `.local/visual/deployed/` and were visually inspected at their emulated widths.
