#!/usr/bin/env python3
"""Testa publicação versionada em PostgreSQL descartável, sem conexão externa."""
import argparse
import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("local_pg", Path(__file__).with_name("test-zap-distribuicao-postgres.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin")
    args = parser.parse_args()
    args.pg_share = args.pg_lib = None
    args.keep = False
    args.migration = base.REPO / "supabase/migrations/20260914211605_zap_distribuicao_capacidade_presenca_atomica.sql"
    db = base.Cluster(args)
    migration = base.REPO / "supabase/migrations/20260918001000_nina_regras_catalogo_sfp_idade.sql"
    try:
        db.start()
        schema = (base.REPO / "supabase/migrations/20260906233216_da6d8f4d-78c2-4f6c-a0c0-88f8b0d5a9a0.sql").read_text()
        db.sql(schema.split("GRANT SELECT")[0])
        old_rule = next(line for line in (base.REPO / "src/lib/nina/confidence/fixtures/prompt-publicado-v19.ts").read_text().splitlines()
                        if line.startswith("Preserve o sentido dos critérios publicados."))
        old_text = "Regra de pagamento preservada.\n" + old_rule
        old_id = db.sql(f"INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',19,{base.literal(old_text)},'publicada') RETURNING id;")
        db.sql("INSERT INTO nina_instrucoes_versoes(escopo,versao,conteudo,status) VALUES('whatsapp',42,'rascunho em edição','rascunho'),('painel_interno',3,'prompt interno','publicada');")
        draft = db.sql("SELECT row_to_json(v)::text FROM nina_instrucoes_versoes v WHERE status='rascunho';")
        db.file(migration)
        assert db.sql("SELECT versao FROM nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada';") == "43"
        new_text = db.sql("SELECT conteudo FROM nina_instrucoes_versoes WHERE versao=43;")
        assert "REGRAS DO CATÁLOGO" in new_text and "Regra de pagamento preservada." in new_text
        assert "Não acrescente “a partir de”" not in new_text
        assert db.sql(f"SELECT conteudo FROM nina_instrucoes_versoes WHERE id={base.literal(old_id)};") == old_text
        assert db.sql(f"SELECT status FROM nina_instrucoes_versoes WHERE id={base.literal(old_id)};") == "arquivada"
        assert db.sql("SELECT versao_anterior_id FROM nina_instrucoes_versoes WHERE versao=43;") == old_id
        assert db.sql("SELECT row_to_json(v)::text FROM nina_instrucoes_versoes v WHERE status='rascunho';") == draft
        assert db.sql("SELECT conteudo FROM nina_instrucoes_versoes WHERE escopo='painel_interno' AND status='publicada';") == "prompt interno"
        db.file(migration)
        assert db.sql("SELECT count(*) FROM nina_instrucoes_versoes;") == "4"
        print("PASS: nova versão, histórico intacto, rascunho preservado, painel interno intacto, idempotência.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
