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
