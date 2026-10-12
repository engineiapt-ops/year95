# Database deployment and SSL

## PostgreSQL connection

The API reads `DATABASE_URL` from server-side configuration and uses one bounded `pg.Pool`. TLS uses certificate and hostname verification (`verify-full`) by default. Do not put database connection strings in browser-facing `VITE_*` variables or logs.

## Supabase root CA

1. Open the project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Open **Database settings** and locate **SSL Configuration**.
3. Download the database root certificate using **Download Certificate**. Supabase documents this in [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Postgres SSL Enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).
4. Copy the full PEM contents, including the `BEGIN CERTIFICATE` and `END CERTIFICATE` lines, into the server's `DATABASE_CA_CERT_PEM` environment variable. Keep line breaks intact. Leave it empty when the host certificate chain is already trusted by the runtime.
5. Set `DATABASE_URL` to the connection string copied from the Supabase dashboard's **Connect** panel. Verify the hostname and use the matching pooler/direct connection settings.

The pool supplies the CA through the TLS driver's `ca` option and keeps `rejectUnauthorized: true`; supplying a CA does not turn certificate verification off. It removes SSL-related query parameters from the connection URL so options such as `sslmode=require` cannot replace the explicit verification policy. Rotate/review the CA when Supabase publishes a replacement.

## Transaction pooler compatibility

The Supabase transaction pooler does not support named prepared statements. Persistence's typed query interface intentionally accepts SQL text and values, rather than query config objects with a `name` field. Do not introduce named prepared statements.

## Local integration tests

TLS can only be disabled by the pool factory when `NODE_ENV=test` and the connection string host is loopback (`localhost`, `127.0.0.1`, or `::1`). This mode is intended solely for the disposable local PostgreSQL service used by tests. Production/staging settings and remote database hosts fail closed if asked to disable TLS.
