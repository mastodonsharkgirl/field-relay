# Security maintenance, 23 October 2026

This patch starts from the exact previously deployed source 0b2d74d782ecfa6adc96b05a5f091c12bc7984cb.
It updates compatible build/test dependencies and pins Node 24.22.1, the
21 October security release. Direct dependency minimums match the tested
patched lockfile. Application routes, privacy behavior and product content
remain unchanged.

The full and production npm advisory checks returned zero matches. The
repository full QA suite passed; skipped and retried browser cases remain
visible in the central portfolio maintenance evidence. Independent focused
rendering at mobile, tablet and desktop widths and sampled hosted route/asset
preservation checks completed. These are bounded checks, not a guarantee
that the application is vulnerability-free.

Where a shadcn stylesheet import existed, its exact upstream 4.16.0 CSS and
MIT license are retained locally with verified provenance, while the unused
generator/server package closure is removed. Existing owned components remain.

Publication and live readback are tracked in the central portfolio maintenance
record; no hosted CI success is inferred from local results.
