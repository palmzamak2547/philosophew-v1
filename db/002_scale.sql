-- The hourly per-visitor limits read these on every phew and every report.
-- Indexed, a busy day stays an index lookup instead of a scan of the whole table.
create index if not exists phews_by_ip on pw.phews (ip_hash, created_at desc);
create index if not exists reports_by_ip on pw.reports (ip_hash, created_at desc);
