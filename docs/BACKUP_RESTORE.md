# Backup & Restore

> Scope: PostgreSQL (`teamweb` DB) — the read model, queue storage, releases,
> audit log and per-user (encrypted) credentials.
> RPO target: ≤ 24 h (nightly dump). RTO target: ≤ 30 min (tested procedure).

## Backup

A nightly `pg_dump` of the `teamweb` database. In `compose.yaml` the Postgres
container is `db` (published on `5433`).

### Daily dump (cron, on the host)

```bash
# Backs up to ./backups/, keeps 14 days of dailies.
mkdir -p backups
TS=$(date +%Y%m%d-%H%M%S)
podman exec teamweb-pg pg_dump -U teamweb -d teamweb --format=custom \
  -f /tmp/teamweb-$TS.dump
podman cp teamweb-pg:/tmp/teamweb-$TS.dump backups/teamweb-$TS.dump
podman exec teamweb-pg rm -f /tmp/teamweb-$TS.dump
find backups -name 'teamweb-*.dump' -mtime +14 -delete
```

Suggested crontab (02:30 daily):

```
30 2 * * * cd /path/to/bot-jira && /bin/bash -c '...' # the dump block above
```

> The dump contains encrypted per-user credentials (AES-256-GCM). Treat the
> dump file as sensitive; store it with the same protection as
> `CRED_ENCRYPTION_KEY`.

## Restore (tested procedure)

Restore is verified against a scratch container so production data is never
touched during the test.

```bash
# 1. Start a scratch Postgres on a separate port.
podman run -d --name teamweb-restore -e POSTGRES_USER=teamweb \
  -e POSTGRES_PASSWORD=teamweb -e POSTGRES_DB=teamweb \
  -p 5434:5432 docker.io/library/postgres:16-alpine

# 2. Wait for readiness.
until podman exec teamweb-restore pg_isready -U teamweb -d teamweb; do sleep 1; done

# 3. Load the dump.
podman cp backups/teamweb-<TS>.dump teamweb-restore:/tmp/restore.dump
podman exec teamweb-restore pg_restore -U teamweb -d teamweb --clean \
  --if-exists --no-owner /tmp/restore.dump
podman exec teamweb-restore rm -f /tmp/restore.dump

# 4. Sanity-check row counts.
podman exec teamweb-restore psql -U teamweb -d teamweb -c \
  "SELECT (SELECT count(*) FROM \"IssueCache\"),
          (SELECT count(*) FROM \"Release\"),
          (SELECT count(*) FROM \"AuditLog\"),
          (SELECT count(*) FROM \"User\");"
```

### Restore into the live environment (only during a real incident)

1. Stop the web and worker so they cannot write: `podman compose stop web worker`.
2. Drop and recreate the schema, then load the dump:
   ```bash
   podman exec teamweb-pg dropdb -U teamweb --if-exists teamweb
   podman exec teamweb-pg createdb -U teamweb teamweb
   podman cp backups/teamweb-<TS>.dump teamweb-pg:/tmp/restore.dump
   podman exec teamweb-pg pg_restore -U teamweb -d teamweb \
     --no-owner /tmp/restore.dump
   ```
3. Apply any migrations newer than the dump: `podman compose run --rm worker npx prisma migrate deploy`
   (or `npx prisma migrate deploy` with the DATABASE_URL pointed at the DB).
4. Start the services: `podman compose up -d`.
5. Confirm `/api/health` is healthy and the row counts match.

## Pre-migration backup rule

Before any production `prisma migrate deploy`, take a fresh dump (the procedure
above) so the migration can be rolled back to that snapshot. Migrations follow
expand–migrate–contract: never drop a column/table in the same release that
added a new one.
