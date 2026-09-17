#!/usr/bin/env python3
"""Exercise real unread/read SQL with synthetic data in a socket-only database."""
import argparse
import importlib.util
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("distribution", Path(__file__).with_name("test-zap-distribuicao-postgres.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
L = base.literal


def run(db):
    db.sql("ALTER TYPE app_role ADD VALUE 'supervisor';")
    db.sql("""
      ALTER TABLE atend_conversas ADD COLUMN last_assigned_user_id uuid,
        ADD COLUMN resolved_by uuid, ADD COLUMN unread_count integer NOT NULL DEFAULT 238;
      CREATE TABLE whatsapp_mensagens (
        id uuid PRIMARY KEY, clinica_id uuid, conversa_id uuid, direction text,
        enviada_por text, status text, recebida_em timestamptz NOT NULL);
      GRANT ALL ON whatsapp_mensagens TO authenticated, service_role;
      CREATE FUNCTION clinicas_do_usuario() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path=public AS $$ SELECT array_agg(clinica_id) FROM clinica_memberships
        WHERE user_id=auth.uid() AND ativo $$;
      CREATE FUNCTION _touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
      CREATE PUBLICATION supabase_realtime;
    """)
    db.file(base.REPO / "supabase/migrations/20260917144041_b618961f-ac79-4d95-977a-1eac1d3541fa.sql")
    db.file(base.REPO / "supabase/migrations/20260917230000_zap_fila_individual_pausa.sql")
    db.file(base.REPO / "supabase/migrations/20260906153037_6fa5e136-c373-45f1-9609-440a2e04e9f7.sql")

    def message(c, conv, time="2026-09-17 10:00:00+00", msg_id=None, direction="in"):
        mid = msg_id or str(uuid.uuid4())
        db.sql(f"INSERT INTO whatsapp_mensagens VALUES({L(mid)},{L(c)},{L(conv)},{L(direction)},'paciente','received',{L(time)});")
        return mid

    def read(c, conv, user, mid, error=False):
        return db.sql(f"SELECT atend_registrar_leitura({L(c)},{L(conv)},{L(mid)});", user, error=error)

    def unread(c, conv, user):
        return db.sql(f"SELECT nao_lidas FROM atend_nao_lidas({L(c)},ARRAY[{L(conv)}]::uuid[]);", user)

    # A historical admin read must not be mistaken for an operational read.
    c, (a, manager, admin, supervisor) = db.fixture(("telefonia", "gestor", "admin", "supervisor"))
    conv = db.queue(c, 1, owner=a)[0]
    m1 = message(c, conv)
    read(c, conv, admin, m1)
    old = db.sql("SELECT row_to_json(l)::text FROM atend_leituras l;")
    canonica = base.REPO / "supabase/migrations/20260917170404_d758959e-1e5c-43ac-9994-9f30c52f6720.sql"
    compatibilidade = base.REPO / "supabase/migrations/20260917233000_zap_leitura_operacional.sql"
    db.file(canonica)
    db.file(compatibilidade)

    def history():
        assert db.sql("SELECT row_to_json(l)::text FROM atend_leituras l;") == old
        assert db.sql("SELECT count(*) FROM atend_leitura_operacional;") == "0"
        assert unread(c, conv, admin) == "1"
        assert db.sql("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='atend_leitura_operacional';") == "1"
    db.case("migration preserves history and does not treat old admin reads as operational", history)

    def protected_profiles():
        for user in (manager, admin, supervisor):
            assert db.sql(f"SELECT atend_permite_leitura_operacional({L(c)});", user) == "f"
            assert "permissao" in read(c, conv, user, m1, error=True)
        assert unread(c, conv, admin) == "1"
        assert db.sql("SELECT count(*) FROM atend_leitura_operacional;") == "0"
    db.case("admin, gestor and supervisor cannot consume real unread messages via direct RPC", protected_profiles)

    def shared():
        before = db.sql(f"SELECT row_to_json(c)::text FROM atend_conversas c WHERE id={L(conv)};")
        read(c, conv, a, m1)
        assert unread(c, conv, a) == unread(c, conv, admin) == unread(c, conv, manager) == "0"
        assert db.sql(f"SELECT row_to_json(c)::text FROM atend_conversas c WHERE id={L(conv)};") == before
        # Further admin openings do not consume the next message.
        m2 = message(c, conv, "2026-09-17 10:01:00+00")
        read(c, conv, admin, m2, error=True)
        assert unread(c, conv, admin) == "1"
        # Missing cutoff cannot consume messages not loaded by the attendant.
        read(c, conv, a, None, error=True)
        assert unread(c, conv, a) == "1"
    db.case("Telefonia read clears team badge, preserves status and legacy 238; next message counts", shared)

    def compatibility():
        antes = db.sql("SELECT row_to_json(l)::text FROM atend_leitura_operacional l ORDER BY conversa_id;")
        individuais = db.sql("SELECT row_to_json(l)::text FROM atend_leituras l ORDER BY conversa_id, user_id;")
        db.file(compatibilidade)
        db.file(compatibilidade)
        assert db.sql("SELECT row_to_json(l)::text FROM atend_leitura_operacional l ORDER BY conversa_id;") == antes
        assert db.sql("SELECT row_to_json(l)::text FROM atend_leituras l ORDER BY conversa_id, user_id;") == individuais
        assert unread(c, conv, admin) == "1"
        sql = compatibilidade.read_text()
        erro = db.sql("BEGIN; ALTER TABLE atend_leitura_operacional DISABLE ROW LEVEL SECURITY;\n" + sql, error=True)
        assert "RLS ausente" in erro
        db.file(compatibilidade)  # A transação abortada preservou o RLS original.
    db.case("compatibility migration can repeat without changing reads and detects missing RLS", compatibility)

    def access():
        c2, (other, _) = db.fixture()
        foreign = db.queue(c2, 1, owner=other)[0]
        foreign_msg = message(c2, foreign)
        read(c2, foreign, a, foreign_msg, error=True)
        read(c, conv, a, foreign_msg, error=True)
        read(c, conv, other, m1, error=True)
        colleague = str(uuid.uuid4())
        db.sql(f"INSERT INTO auth.users VALUES({L(colleague)}); INSERT INTO clinica_memberships(clinica_id,user_id,role) VALUES({L(c)},{L(colleague)},'telefonia');")
        assert unread(c, conv, colleague) == ""
        read(c, conv, colleague, m1, error=True)
        db.sql(f"UPDATE atend_leitura_operacional SET user_id={L(admin)} WHERE conversa_id={L(conv)};", admin, error=True)
        assert db.sql(f"SELECT count(*) FROM atend_leitura_operacional WHERE conversa_id={L(conv)};", colleague) == "0"
    db.case("clinic, colleague, message and direct-write access remain protected", access)

    def own_history_and_nina():
        for mode in ("nina", "closed"):
            cid = db.queue(c, 1)[0]
            if mode == "nina":
                db.sql(f"UPDATE atend_conversas SET owner_type='AI',status='bot_attending' WHERE id={L(cid)};")
            else:
                db.sql(f"UPDATE atend_conversas SET status='closed',last_assigned_user_id={L(a)} WHERE id={L(cid)};")
            mid = message(c, cid)
            read(c, cid, a, mid)
            assert unread(c, cid, a) == unread(c, cid, admin) == "0"
    db.case("authorized Nina and own closed conversations can be read without a current assignee", own_history_and_nina)

    def pending():
        c3, (paused, manager3) = db.fixture()
        db.presence(c3, paused, "PAUSA")
        cid = db.queue(c3, 1)[0]
        db.rpc("atend_distribuir_fila_status", f"{L(c3)},200", manager3)
        mid = message(c3, cid)
        before = db.sql(f"SELECT row_to_json(c)::text FROM atend_conversas c WHERE id={L(cid)};")
        read(c3, cid, paused, mid)
        assert unread(c3, cid, manager3) == "0"
        assert db.sql(f"SELECT fila_pendente FROM atend_conversas WHERE id={L(cid)};") == "t"
        assert db.sql(f"SELECT row_to_json(c)::text FROM atend_conversas c WHERE id={L(cid)};") == before
    db.case("reading a paused attendant's private queue does not activate, answer or redistribute", pending)

    def concurrent():
        cid = db.queue(c, 1, owner=a)[0]
        old_msg = message(c, cid, msg_id="00000000-0000-0000-0000-000000000001")
        # Same timestamp, deterministically ordered message not included in cutoff.
        new_msg = message(c, cid, msg_id="00000000-0000-0000-0000-000000000002")
        read(c, cid, a, old_msg)
        assert unread(c, cid, a) == "1"
        db.overlap(f"SELECT atend_registrar_leitura({L(c)},{L(cid)},{L(new_msg)})",
                   f"SELECT atend_registrar_leitura({L(c)},{L(cid)},{L(old_msg)})", a, a)
        assert unread(c, cid, admin) == "0"
        next_id = str(uuid.uuid4())
        db.overlap(f"SELECT atend_registrar_leitura({L(c)},{L(cid)},{L(new_msg)})",
                   f"INSERT INTO whatsapp_mensagens VALUES({L(next_id)},{L(c)},{L(cid)},'in','paciente','received','2026-09-17 10:02:00+00')", a, a)
        assert unread(c, cid, admin) == "1"
    db.case("delayed read cannot regress cutoff; same-time and concurrent new messages stay unread", concurrent)

    def homologation():
        test = db.queue(c, 1, is_test=True)[0]
        mid = message(c, test)
        read(c, test, admin, mid)
        assert db.sql(f"SELECT count(*) FROM atend_leituras WHERE conversa_id={L(test)} AND user_id={L(admin)};") == "1"
        assert db.sql(f"SELECT count(*) FROM atend_leitura_operacional WHERE conversa_id={L(test)};") == "0"
        assert unread(c, test, admin) == ""
    db.case("test console keeps its isolated personal reading without changing real badge", homologation)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", default="/usr/lib/postgresql/18/bin")
    parser.add_argument("--pg-share")
    parser.add_argument("--pg-lib")
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    args.migration = base.REPO / "supabase/migrations/20260914211605_zap_distribuicao_capacidade_presenca_atomica.sql"
    db = base.Cluster(args)
    try:
        db.start()
        run(db)
        print(f"All {db.passed} operational reading PostgreSQL scenarios passed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
