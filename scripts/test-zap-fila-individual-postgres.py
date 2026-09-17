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
    db.file(base.REPO / "supabase/migrations/20260917230000_zap_fila_individual_pausa.sql")

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
