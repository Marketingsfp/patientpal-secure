#!/usr/bin/env python3
"""Synthetic, socket-only PostgreSQL tests. No remote database or WhatsApp."""
import argparse
import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("distribution", Path(__file__).with_name("test-zap-distribuicao-postgres.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
L = base.literal


def run(db):
    db.sql("""CREATE TABLE whatsapp_mensagens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid, conversa_id uuid,
      direction text, enviada_por text, status text, recebida_em timestamptz DEFAULT now());
      GRANT ALL ON whatsapp_mensagens TO authenticated, service_role;""")
    canonical = base.REPO / "supabase/migrations/20260917144041_b618961f-ac79-4d95-977a-1eac1d3541fa.sql"
    compatibility = base.REPO / "supabase/migrations/20260917230000_zap_fila_individual_pausa.sql"
    compatibility_sql = compatibility.read_text(encoding="utf-8")

    def missing_canonical():
        error = db.sql(compatibility_sql, error=True)
        assert "Fila individual incompleta" in error
        assert db.sql("SELECT count(*) FROM pg_attribute WHERE attrelid='atend_conversas'::regclass AND attname='fila_pendente';") == "0"
    db.case("compatibility entry refuses missing canonical migration without creating objects", missing_canonical)

    db.file(canonical)

    def schema_snapshot():
        return db.sql("""
          SELECT jsonb_build_object(
            'functions', (SELECT jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl) ORDER BY p.oid)
              FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'atend_%'),
            'triggers', (SELECT jsonb_agg(jsonb_build_array(oid,pg_get_triggerdef(oid),tgenabled) ORDER BY oid)
              FROM pg_trigger WHERE NOT tgisinternal),
            'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),
            'indexes', (SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid)
              FROM pg_index WHERE indrelid='atend_conversas'::regclass),
            'conversations', (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM atend_conversas c),
            'presence', (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM atend_agente_presenca p),
            'events', (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM atend_conversa_eventos e)
          )::text;
        """)

    def sequential_and_repeated():
        # An existing pending queue, including one global item, is preserved.
        c, (a, m) = db.fixture()
        db.presence(c, a, "PAUSA")
        db.queue(c, 11)
        db.rpc("atend_distribuir_fila_status", f"{L(c)},200", m)
        before = schema_snapshot()
        db.file(compatibility)
        # Proves that the historical alias performs no DDL or data writes.
        db.sql("BEGIN READ ONLY;\n" + compatibility_sql + "\nCOMMIT;")
        assert schema_snapshot() == before
    db.case("canonical then compatibility, including retry, preserve schema, ACLs and queues", sequential_and_repeated)

    def preserve_later_function():
        # A later compatible implementation must not be overwritten by the
        # old CREATE OR REPLACE statements from the duplicated migration.
        db.sql("""
          BEGIN;
          CREATE OR REPLACE FUNCTION public.atend_configurar_capacidade(
            _clinica_id uuid, _user_id uuid, _max_simultaneas integer
          ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
          AS $later$ BEGIN RAISE EXCEPTION 'Synthetic later version'; END; $later$;
        """ + compatibility_sql + """
          DO $check$ BEGIN
            IF position('Synthetic later version' IN
              pg_get_functiondef('atend_configurar_capacidade(uuid,uuid,integer)'::regprocedure)) = 0 THEN
              RAISE EXCEPTION 'Compatibility migration overwrote a later function';
            END IF;
          END; $check$;
          ROLLBACK;
        """)
    db.case("compatibility entry preserves later function versions", preserve_later_function)

    def history_audit():
        # Synthetic history only. The production audit must not write to it.
        db.sql("""CREATE SCHEMA supabase_migrations;
          CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
          INSERT INTO supabase_migrations.schema_migrations VALUES ('20260917144041');""")
        before = schema_snapshot()
        report = db.sql((base.REPO / "scripts/sql/auditar-zap-fila-individual.sql").read_text(encoding="utf-8"))
        assert "20260917144041" in report and "fila_pendente" in report
        assert db.sql("SELECT string_agg(version, ',') FROM supabase_migrations.schema_migrations;") == "20260917144041"
        assert schema_snapshot() == before
    db.case("read-only audit reports recorded version and schema without changing history", history_audit)

    def reject_drift(sql):
        before = schema_snapshot()
        error = db.sql("BEGIN;\n" + sql + "\n" + compatibility_sql + "\nROLLBACK;", error=True)
        assert "Fila individual incompleta" in error
        assert schema_snapshot() == before

    for label, sql in [
        ("nullable column", "ALTER TABLE atend_conversas ALTER COLUMN fila_pendente DROP NOT NULL;"),
        ("wrong default", "ALTER TABLE atend_conversas ALTER COLUMN fila_pendente SET DEFAULT true;"),
        ("missing index", "DROP INDEX atend_fila_individual_idx;"),
        ("disabled trigger", "ALTER TABLE atend_conversas DISABLE TRIGGER trg_atend_normalizar_fila_individual;"),
        ("missing policy", "DROP POLICY atend_fila_individual_privada ON atend_conversas;"),
        ("disabled RLS", "ALTER TABLE atend_conversas DISABLE ROW LEVEL SECURITY;"),
    ]:
        db.case("compatibility refuses " + label + " without silently repairing it", lambda sql=sql: reject_drift(sql))

    def pending(clinic, user=None):
        return int(db.sql(f"SELECT count(*) FROM atend_conversas WHERE clinica_id={L(clinic)} AND fila_pendente" + (f" AND atribuida_user_id={L(user)}" if user else "") + ";"))

    def distribute(clinic, manager):
        return db.rpc("atend_distribuir_fila_status", f"{L(clinic)},200", manager)

    def message(clinic, conversation, user, sender="humano", direction="out", status="sent"):
        return db.sql(f"INSERT INTO whatsapp_mensagens(clinica_id,conversa_id,direction,enviada_por,status) VALUES({L(clinic)},{L(conversation)},{L(direction)},{L(sender)},{L(status)}) RETURNING id;", user)

    def overflow():
        c, (a,b,off,m) = db.fixture(("telefonia","telefonia","telefonia","gestor"))
        db.presence(c,a,"PAUSA"); db.presence(c,b,"PAUSA"); db.presence(c,off,"OFFLINE")
        db.queue(c,25); distribute(c,m)
        assert pending(c,a)==10 and pending(c,b)==10 and db.assigned(c,off)==0
        assert db.assigned(c)==20
        # A new pause with free capacity also drains global overflow.
        db.presence(c,off,"PAUSA")
        assert pending(c,off)==5
        assert db.assigned(c)==25
        db.presence(c,off,"OFFLINE")
        db.queue(c,3); distribute(c,m)
        assert db.assigned(c)==25
        result=db.presence(c,off,"ONLINE")
        assert db.assigned(c,off)==8 and pending(c,off)==5
        assert result["distribuicao"]["meu"]["reservadas"]==5
        assert result["distribuicao"]["meu"]["carga_atual"]==8
    db.case("Pausa max 10 per person; overflow global; Offline excluded; new Pausa drains global", overflow)

    def mixed():
        c, (a,b,m) = db.fixture(("telefonia","telefonia","gestor"))
        db.presence(c,a,"ONLINE"); db.presence(c,b,"PAUSA")
        # Historical configuration cannot cap Online; new writes are refused.
        db.sql(f"INSERT INTO atend_capacidade_atendentes(clinica_id,user_id,max_simultaneas,atualizado_por) VALUES({L(c)},{L(a)},1,{L(m)});")
        db.sql(f"SELECT atend_configurar_capacidade({L(c)},{L(a)},1);",m,error=True)
        db.queue(c,8); distribute(c,m)
        assert db.assigned(c,a)==4 and pending(c,b)==4
        db.queue(c,40); distribute(c,m)
        assert db.assigned(c,a)==38 and pending(c,b)==10
    db.case("Online and Pausa balanced together; Online unlimited even with legacy cap", mixed)

    def total_load():
        c, (a,b,m) = db.fixture(("telefonia","telefonia","gestor"))
        db.queue(c,6,owner=a)
        db.presence(c,a,"PAUSA"); db.presence(c,b,"ONLINE")
        db.queue(c,4); distribute(c,m)
        assert pending(c,a)==0 and db.assigned(c,b)==4
    db.case("balance counts active plus reserved conversations", total_load)

    def first_reply():
        c,(a,b,m)=db.fixture(("telefonia","telefonia","gestor"))
        db.presence(c,a,"PAUSA")
        ids=db.queue(c,2); distribute(c,m)
        db.presence(c,a,"OFFLINE"); assert pending(c,a)==2
        db.presence(c,a,"ONLINE"); assert pending(c,a)==2
        # Legacy/inbound status updates must not promote reserved conversations.
        db.sql(f"UPDATE atend_conversas SET status='active' WHERE id={L(ids[0])};")
        assert pending(c,a)==2
        message(c,ids[0],a,sender="nina")
        message(c,ids[0],a,sender="paciente",direction="in")
        failed=message(c,ids[0],a,status="failed")
        assert pending(c,a)==2
        message(c,ids[0],b)  # another sender cannot activate this person's queue
        assert pending(c,a)==2
        db.sql(f"UPDATE whatsapp_mensagens SET status='sent' WHERE id={L(failed)};",a)
        assert pending(c,a)==1
        message(c,ids[0],a); assert pending(c,a)==1  # idempotent
        assert db.sql(f"SELECT status FROM atend_conversas WHERE id={L(ids[0])};")=="active"
    db.case("only successful first human reply activates; Online/Offline and Nina do not", first_reply)

    def freed():
        c,(a,m)=db.fixture()
        db.presence(c,a,"PAUSA")
        ids=db.queue(c,12); distribute(c,m)
        assert pending(c,a)==10 and db.assigned(c)==10
        db.sql(f"UPDATE atend_conversas SET status='closed',atribuida_user_id=NULL WHERE id={L(ids[0])};",a)
        assert pending(c,a)==10 and db.assigned(c)==10
        message(c,ids[1],a)
        assert pending(c,a)==10 and db.assigned(c)==11
    db.case("closing or first reply frees one pending slot and redistributes global", freed)

    def access():
        c,(a,b,m)=db.fixture(("telefonia","telefonia","gestor"))
        db.presence(c,a,"PAUSA"); ids=db.queue(c,1); distribute(c,m)
        q=f"SELECT count(*) FROM atend_conversas WHERE id={L(ids[0])};"
        assert db.sql(q,a)=="1" and db.sql(q,m)=="1" and db.sql(q,b)=="0"
        db.sql(f"UPDATE atend_conversas SET atribuida_user_id=NULL,owner_type='AI',status='bot_attending',ai_enabled=true WHERE id={L(ids[0])};")
        assert pending(c)==0
    db.case("private reservations restricted by RLS; return to Nina clears reservation", access)

    def isolation():
        c,(a,m)=db.fixture(); other,(b,_)=db.fixture()
        db.presence(c,a,"PAUSA"); db.presence(other,b,"ONLINE")
        db.queue(c,12); tests=db.queue(c,3,is_test=True); distribute(c,m)
        assert pending(c)==10 and db.assigned(other)==0
        assert db.sql(f"SELECT count(*) FROM atend_conversas WHERE id IN ({','.join(map(L,tests))}) AND atribuida_user_id IS NOT NULL;")=="0"
    db.case("clinic isolation; homologation never assigned to a real attendant", isolation)

    def concurrency():
        c,(a,m)=db.fixture(); db.presence(c,a,"PAUSA"); db.queue(c,30)
        query=f"SELECT atend_distribuir_fila_status({L(c)},200)"
        db.overlap(query,query,m,m)
        assert pending(c,a)==10 and db.assigned(c)==10
        assert int(db.sql(f"SELECT count(*) FROM atend_conversa_eventos WHERE clinica_id={L(c)} AND evento='ASSUMIDA';"))==10
    db.case("concurrent distributors cannot exceed 10 or assign the same conversation twice", concurrency)

    def offline_race():
        c,(a,m)=db.fixture(); db.presence(c,a,"PAUSA"); db.queue(c,4)
        db.overlap(f"SELECT atend_definir_presenca_manual({L(c)},'OFFLINE')",f"SELECT atend_distribuir_fila_status({L(c)},200)",a,m)
        assert db.assigned(c)==0
    db.case("Offline winning concurrent race prevents new reservations", offline_race)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", default="/usr/lib/postgresql/18/bin")
    parser.add_argument("--pg-share")
    parser.add_argument("--pg-lib")
    parser.add_argument("--keep",action="store_true")
    args=parser.parse_args()
    args.migration=base.REPO / "supabase/migrations/20260914211605_zap_distribuicao_capacidade_presenca_atomica.sql"
    db=base.Cluster(args)
    try:
        db.start(); run(db)
        print(f"All {db.passed} private queue PostgreSQL scenarios passed.")
    finally:
        db.close()


if __name__ == "__main__": main()
