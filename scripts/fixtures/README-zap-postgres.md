# Zap OS: isolated PostgreSQL regression

`scripts/test-zap-distribuicao-postgres.py` starts a fresh PostgreSQL cluster,
loads this bounded fixture, applies the existing assignment migrations and then
the new migration. The cases exercise the real SQL functions, triggers, row
locks, advisory locks, grants and capacity policies. Concurrency uses separate
`psql` processes with overlapping transactions, synchronized through
`pg_stat_activity`.

Requirements: Python 3 and PostgreSQL server/client binaries. No Python packages
are required. Run from Linux or WSL as a non-root user:

```sh
python3 scripts/test-zap-distribuicao-postgres.py --pg-bin /usr/lib/postgresql/18/bin
```

The harness never accepts a connection string and removes inherited `PG*`
connection settings. It creates a private temporary directory, disables TCP,
uses only its private Unix socket, and stops/removes the cluster on completion.
`--keep` retains the stopped local cluster for troubleshooting. There are no
production credentials, patient records, WhatsApp tables or network hooks.

For an extracted runtime, supply `--pg-share` and `--pg-lib`, plus the library
path for that runtime. The run on this workspace used Ubuntu's PostgreSQL
18.3-1 packages, downloaded with `apt-get download` and extracted with
`dpkg-deb -x` under `work/postgres-runtime`, without installing system packages.

```sh
runtime=/path/to/work/postgres-runtime/root
LD_LIBRARY_PATH="$runtime/usr/lib/x86_64-linux-gnu" \
  python3 scripts/test-zap-distribuicao-postgres.py \
  --pg-bin "$runtime/usr/lib/postgresql/18/bin" \
  --pg-share "$runtime/usr/share/postgresql/18" \
  --pg-lib "$runtime/usr/lib/postgresql/18/lib"
```

Scope limits: this is a bounded schema, not a full Supabase instance. Auth claims
are supplied by local session settings; baseline role helpers are fixture
predicates. The product assignment/presence/capacity functions come from the
actual migrations. The test does not validate PostgREST, frontend rendering,
Supabase deployment, webhook delivery or cron scheduling by a running pg_cron
extension. The migration's optional cron registration is skipped when that
extension is unavailable.
