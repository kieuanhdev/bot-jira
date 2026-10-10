# AutoImprove objective

Improve maintainability and reliability without changing intended product
behavior.

Each invocation must select exactly one evidence-backed issue with clear impact,
bounded scope, acceptable risk, and deterministic validation. Prioritize:

1. Reproducible defects or unsafe edge-case handling.
2. Type-safety gaps that can hide runtime defects.
3. Narrowly scoped duplication or unnecessary complexity.
4. Missing regression coverage for important existing behavior.
5. Performance anti-patterns supported by direct code evidence.

Reject style-only, speculative, cosmetic, or low-value changes. Do not select
dependency updates, migrations, secrets, deployment/infrastructure changes, or
broad refactors. Edit this file before `/auto-improve` to set a narrower objective.
