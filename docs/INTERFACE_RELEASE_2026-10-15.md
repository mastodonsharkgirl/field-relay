# Field Relay interface refresh � 15 October 2026

The approved direction adapts the Model Signal prompts: stronger typography, restrained lavender and navy, raised controls, a thin navigation bar, and useful working data above the fold. Field Relay keeps its own identity and fictional supply-chain problem. A new relay mark, export-pair illustration, structured findings and evidence inspector replace the previous cramped visual hierarchy. The walkthrough and case study share the same typography and navigation.

All four Saran skills informed this change: design direction (composition and semantic palette), interface craft (review hierarchy and natural keyboard order), motion craft (brief transitions, no ambient loop, reduced-motion alternatives), and visual QA (rendered states and interaction checks). The installed LottieFiles motion guidance was applied without adding a runtime.

## Local evidence before hosted verification

Browser inspection covered 320, 390, 768, 1440 and 1920 px widths, setup with 200% text at 320 px, selected evidence, unsaved-review dismissal, saved review, mobile detail/back focus, simulator, walkthrough and case study. No horizontal overflow or page errors were observed; requests stayed on the local origin. Reduced motion produced zero running animations. The first finding begins at y=693.64 on 390 px and y=591.23 on 1440 px. These are viewport emulations, not physical-device tests.

[Inspection receipt](evidence/2026-10-15-interface/inspection.json). [Axe receipt](evidence/2026-10-15-interface/axe.json): zero WCAG A/AA rule violations in the five named settled states, using reduced motion. An initial scan during entrance opacity produced transient contrast failures; settled-state rechecks cleared those. Two real simulator defects were repaired: invalid list semantics and insufficient stage-number contrast. Download controls now follow findings in both visual and DOM order. Automated scans do not establish complete accessibility compliance.

Astro check reported 20 files with zero errors, warnings or hints; lint and formatting passed. Full build, unit/browser tests and integration walkthroughs run on hosted CI to avoid competing with Compass laptop work. Hosted and deployment evidence will be added after results are confirmed.

## Factual boundaries

The coordinator story is hypothetical. CSV reconciliation and delivery simulation are browser-local. The Python/SQLite HTTP exercise is a separate local experiment with recorded evidence. No customer, supplier integration or Claude call is claimed. The historical unexplained failure remains preserved; the prior repair and its limits are in [the demo repair release](integration/DEMO_REPAIR_AND_PREVIEW_2026-10-15.md).

## Hosted failures and targeted corrections

The first UI run [38718289612](https://github.com/mastodonsharkgirl/field-relay/actions/runs/38718289612) failed one mobile browser test and four HTTP tests. The mobile stage number is visually hidden at narrow widths; a stable accessible name now preserves its step identity. The outage/retry/replay/download flow passed a focused mobile retest.

The HTTP fixture consumed each invalid-absence response once, then silently returned healthy. If a busy runner timed out before seeing its headers, a later valid absence could legitimately authorize another POST, violating the test's intended setup. Invalid-absence GET faults now persist until explicit reconfiguration. A regression failed for all four faults before the change and passed after it; the four existing no-second-POST tests also passed unchanged. Only test-harness startup/admin waits increased (5 to 15 seconds and 2 to 10 seconds). The relay's 750 ms HTTP deadline, recovery limits, approval checks and retry budgets are unchanged. The original run also recorded startup/admin timeouts. This explains a reproducible fixture weakness; exact scheduling in that hosted run was not captured.

## Verified publication

Implementation `abc15248a1972b53699832e42f0bf3178ceacff6` is pushed to main and the implementation branch. [Final successful CI](https://github.com/mastodonsharkgirl/field-relay/actions/runs/38719596640) passed 15 website unit tests, 22 browser tests, the static build, type/lint/format checks, 101 Node integration tests, 28 Python tests, three fresh scripted walkthroughs and one saved-session resume. All four final demo reports identify this clean source, passed cleanup and credential scanning. Independent UI and fault-fixture reviews approved the final changes.

The exact CI artifact was checked against its 14-file SHA-256 inventory before deployment. [Stable preview](https://field-relay-saran.pages.dev/labs/field-relay/) and [immutable deployment](https://813155e9.field-relay-saran.pages.dev/labs/field-relay/) serve this build. Twelve public files returned HTTP 200 and matched the artifact hashes; `X-Robots-Tag: noindex` is present. The two remaining package files configure hosting headers and redirects. The [five-minute walkthrough](https://field-relay-saran.pages.dev/labs/field-relay/walkthrough/) is included.

The live multi-width/state browser pass repeated the local flow with no overflow, page errors or external request origins. Review save, dialog dismissal, mobile detail/back focus, reduced motion and both documentation routes passed. The inspection script was corrected to wait for the application's next-frame focus restoration and navigation/font loading before measuring. These harness timing corrections did not change deployed source. One additional capture attempt timed out navigating to the public URL; the subsequent complete capture passed. [Live receipt](evidence/2026-10-15-interface/live-inspection.json), [asset hashes](evidence/2026-10-15-interface/live-hashes.json), [build provenance](evidence/2026-10-15-interface/build-provenance.json), [integration summary](evidence/2026-10-15-interface/integration-summary.json), and [fresh demo summary](evidence/2026-10-15-interface/demo-summary.json) preserve the evidence.

No custom-domain DNS was changed. This remains a public noindex interview preview. The portfolio registry was updated narrowly and left uncommitted with its pre-existing unrelated work. Documentation may advance beyond the implementation commit; the deployed artifact remains tied to the exact tested source above.
