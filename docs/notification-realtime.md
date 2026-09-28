# Notification delivery

All notification types use the same persisted web notification and Discord/push
outbox. PostgreSQL signals committed notification inserts/updates to the web
process; `/api/notify/stream` authenticates the session and sends invalidations
only to that user. Browser reconnects refresh persisted state. Existing polling
remains a fallback if a proxy or database connection interrupts the stream.

The worker enables pg-boss LISTEN/NOTIFY to wake consumers on enqueue. A full
100-row outbox batch schedules another run immediately. Delivery leases prevent
concurrent workers from claiming the same row; expired leases recover through
the periodic sweep. Wake-up jobs are consumed in batches so notification fan-out
does not leave a long queue of empty delivery runs. Failed delivery schedules a
job at the next retry deadline (default exponential backoff starts at five
seconds); Discord 429 responses use the provider's retry delay instead.
External delivery is at-least-once: a process crash after
Discord accepts a message but before the database update can still cause a retry.

## External changes

Immediate source-driven delivery requires inbound webhooks:

- Jira: `/api/webhooks/jira`, issue-created/updated and comment events.
- Bitbucket: `/api/webhooks/bitbucket`, PR and PR-comment events.
- Sentry: `/api/webhooks/sentry`.
- CI: `/api/webhooks/ci`.

Configure each source to use the existing signature verification contract in
`src/lib/events/signatures.ts`. Never disable authentication to enable realtime.
Verify accepted events in `IntegrationEvent`, including `receivedAt`,
`processedAt`, and `processingError`. An empty event table means there is no
evidence of accepted webhooks; polling cannot guarantee immediate source events.

Watched Jira issues also have a dedicated five-second reconciliation loop using
direct issue/comment reads, with four concurrent tasks and no overlapping watch
jobs. Latency includes Jira response time and time to scan all watches. General
Jira and PR polling remain recovery paths. AI results and release/CI/Sentry
notifications enter the common delivery pipeline when their producing operation
finishes; time-based stale and health alerts retain their detection schedules.

## Deployment and verification

Apply migrations and rebuild/restart both web and worker services. The
`20260927093000_notification_realtime` migration installs the commit-time signal.
Reverse proxies must allow streaming and must not buffer `/api/notify/stream`.

Check that the stream returns `text/event-stream`, emits `ready` on connection,
and emits `changed` on a notification belonging to the logged-in user. Verify
webhook receipt, notification creation, and outbox delivery timestamps separately
to distinguish source latency from delivery latency. A controlled end-to-end
check should use a test task and an explicitly chosen Discord recipient.
