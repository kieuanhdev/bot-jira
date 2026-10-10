---
description: Audit and implement one safe improvement, review it, validate it, retry up to the configured limit, and report evidence
agent: auto-improve
---

Execute the AutoImprove protocol defined by the `auto-improve` agent.

Use `autoimprove/goal.md` as the objective. Process one improvement only. Capture
a passing baseline before any edit, delegate audit and independent review, run the
configured validator, perform no more than the configured number of evidence-led
repair attempts, and write a timestamped structured report. Stop safely and report
BLOCKED or FAILED when any required condition cannot be met.
