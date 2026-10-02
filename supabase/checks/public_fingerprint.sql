-- Fingerprint of everything in `public` (plus Realtime publication and the
-- API roles' schema grants). Run before and after a capture migration: the
-- hashes must match, proving the live site's objects were not touched.
with
tbl as (select md5(string_agg(format('%s|%s|%s|%s|%s', c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, coalesce(c.relacl::text,'')), ',' order by c.relname)) h
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
col as (select md5(string_agg(format('%s.%s|%s|%s|%s|%s', table_name, column_name, data_type, is_nullable, coalesce(column_default,''), ordinal_position), ',' order by table_name, column_name)) h
        from information_schema.columns where table_schema='public'),
con as (select md5(string_agg(format('%s|%s', conname, pg_get_constraintdef(c.oid)), ',' order by conname, c.oid)) h
        from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
idx as (select md5(string_agg(indexdef, ',' order by indexname)) h from pg_indexes where schemaname='public'),
pol as (select md5(string_agg(format('%s|%s|%s|%s|%s|%s', tablename, policyname, cmd, roles::text, coalesce(qual,''), coalesce(with_check,'')), ',' order by tablename, policyname)) h
        from pg_policies where schemaname='public'),
fn as (select md5(string_agg(format('%s(%s)|%s|%s|%s', p.proname, pg_get_function_identity_arguments(p.oid), md5(p.prosrc), p.prosecdef, coalesce(p.proacl::text,'')), ',' order by p.proname, pg_get_function_identity_arguments(p.oid))) h
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
trg as (select md5(string_agg(format('%s|%s', c.relname, pg_get_triggerdef(t.oid)), ',' order by c.relname, t.tgname)) h
        from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
rit as (select count(*) n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgisinternal),
vw as (select md5(string_agg(format('%s|%s', viewname, md5(definition)), ',' order by viewname)) h from pg_views where schemaname='public'),
pub as (select md5(coalesce(string_agg(format('%s.%s', schemaname, tablename), ',' order by schemaname, tablename),'')) h from pg_publication_tables where pubname='supabase_realtime'),
nsp as (select md5(coalesce(nspacl::text,'')) h from pg_namespace where nspname='public')
select tbl.h tables, col.h columns, con.h constraints, idx.h indexes, pol.h policies, fn.h functions, trg.h triggers, rit.n internal_fk_triggers, vw.h views, pub.h realtime_pub, nsp.h schema_grants
from tbl, col, con, idx, pol, fn, trg, rit, vw, pub, nsp;
