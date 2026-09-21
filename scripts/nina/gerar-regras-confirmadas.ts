import { readFileSync, writeFileSync } from "node:fs";
import { INSTRUCAO_DADOS_CATALOGO } from "../../src/lib/nina/catalogo-estrutura";

export const MIGRATION_REGRAS_CONFIRMADAS = "supabase/migrations/20260921210000_nina_regras_confirmadas_clinica.sql";
const consolidacao = JSON.parse(readFileSync("supabase/migrations/20260920220000_nina_consolidacao_instrucoes.sql", "utf8").split("$nina_dados$")[1]!);
const anterior = consolidacao.find((p: any) => p.escopo === "whatsapp").conteudo.match(/Cada item de atendimentos_publicados[^\n]+/u)?.[0];
if (!anterior) throw new Error("Bloco histórico do catálogo não encontrado.");

export function gerarRegrasConfirmadas() {
  const trocas = JSON.stringify([
    [anterior, INSTRUCAO_DADOS_CATALOGO],
    ["escolhe um horário para o pré-agendamento, mas quem chegar primeiro será atendido primeiro", "escolhe um horário para o pré-agendamento e, entre os pacientes daquele horário, quem chegar primeiro será atendido primeiro"],
  ]);
  return `-- Regras confirmadas pelo usuário em 21/09/2026. Sem alteração de schema,
-- preços-base, horários, pacientes, agendas, financeiro ou histórico de mensagens.
BEGIN;
DO $instrucoes$
DECLARE
  anterior public.nina_instrucoes_versoes;
  troca jsonb;
  novo text;
  proxima integer;
  comentario_novo text := '21/09/2026: horários publicados, anestesia adicional e modalidades confirmadas pela clínica.';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id
      AND v.escopo=anterior.escopo AND v.comentario=comentario_novo) THEN CONTINUE; END IF;
    novo := anterior.conteudo;
    FOR troca IN SELECT value FROM jsonb_array_elements($trocas$${trocas}$trocas$::jsonb)
    LOOP
      IF position(troca->>1 in novo)>0 THEN CONTINUE; END IF;
      IF position(troca->>0 in novo)=0 THEN RAISE EXCEPTION 'Instrução mudou; reconciliar antes de publicar.'; END IF;
      novo := replace(novo,troca->>0,troca->>1);
    END LOOP;
    IF novo=anterior.conteudo THEN CONTINUE; END IF;
    IF length(novo)>60000 THEN RAISE EXCEPTION 'Prompt ultrapassa limite de publicação.'; END IF;
    SELECT coalesce(max(v.versao),0)+1 INTO proxima FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo=anterior.escopo;
    UPDATE public.nina_instrucoes_versoes SET status='arquivada' WHERE id=anterior.id;
    INSERT INTO public.nina_instrucoes_versoes(clinica_id,escopo,versao,conteudo,status,comentario,versao_anterior_id,publicado_em)
      VALUES(anterior.clinica_id,anterior.escopo,proxima,novo,'publicada',comentario_novo,anterior.id,now());
  END LOOP;
END;
$instrucoes$;

DO $catalogo$
DECLARE
  registro public.nina_cat_servicos;
  chave text;
  complemento jsonb;
  complementos jsonb;
  adicional text := 'Anestesia adicional: R$ 500,00. Total = valor do procedimento + R$ 500,00 de anestesia.';
BEGIN
  FOR registro IN SELECT * FROM public.nina_cat_servicos
    WHERE status='PUBLICADO' AND nome IN ('CAPTURA HIBRIDA DE HPV','ELETROCAUTERIZAÇÃO PORTE 2','ELETROCAUTERIZAÇÃO PORTE 3')
    AND descricao_publica LIKE '%Profissional: Marcelo Barreto%'
    AND position('Observação: R$ 500,00 (anestesia)' in descricao_publica)>0
    FOR UPDATE
  LOOP
    chave := replace(lower(registro.nome),'eletrocauterização','eletrocauterizacao') || '::marcelo barreto';
    SELECT value INTO complemento FROM jsonb_array_elements(coalesce(registro.estrutura->'complementos','[]'::jsonb)) WHERE value->>'chave'=chave;
    IF coalesce(complemento->>'acrescimos','') NOT IN ('',adicional) THEN
      RAISE EXCEPTION 'Acréscimo de % já foi editado; reconciliar antes de alterar.',registro.nome;
    END IF;
    SELECT coalesce(jsonb_agg(value ORDER BY ordem),'[]'::jsonb) INTO complementos
      FROM jsonb_array_elements(coalesce(registro.estrutura->'complementos','[]'::jsonb)) WITH ORDINALITY AS c(value,ordem)
      WHERE value->>'chave' IS DISTINCT FROM chave;
    complementos := complementos || jsonb_build_array(coalesce(complemento,'{}'::jsonb) || jsonb_build_object('chave',chave,'acrescimos',adicional));
    UPDATE public.nina_cat_servicos SET
      descricao_publica=replace(descricao_publica,'Observação: R$ 500,00 (anestesia)','Observação: ' || adicional),
      estrutura=jsonb_set(coalesce(estrutura,'{"versao":1}'::jsonb),'{complementos}',complementos)
      WHERE id=registro.id;
  END LOOP;
END;
$catalogo$;

UPDATE public.nina_cat_profissionais p SET
  observacao_publica=replace(p.observacao_publica,E'Observação: 20 vagas\\n',E'Observação: 20 vagas por tipo de consulta: 20 para cardiologia e 20 para clínico geral, separadas.\\n'),
  horarios=(SELECT jsonb_agg(CASE WHEN h->>'observacao' LIKE '%20 vagas.%'
    THEN jsonb_set(h,'{observacao}',to_jsonb(replace(h->>'observacao','20 vagas.','20 vagas por tipo de consulta: 20 para cardiologia e 20 para clínico geral, separadas.')))
    ELSE h END ORDER BY ordem) FROM jsonb_array_elements(p.horarios) WITH ORDINALITY AS j(h,ordem))
WHERE p.status='PUBLICADO' AND p.nome='Sandro Prinscewal'
  AND p.observacao_publica LIKE '%CONSULTA CARDIOLOGIA%'
  AND p.observacao_publica LIKE '%CONSULTA CLÍNICO GERAL%'
  AND position(E'Observação: 20 vagas\\n' in p.observacao_publica)>0;
COMMIT;
`;
}

if (import.meta.main) writeFileSync(MIGRATION_REGRAS_CONFIRMADAS, gerarRegrasConfirmadas(), "utf8");
