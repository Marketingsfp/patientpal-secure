// Gera a publicação a partir das mesmas constantes usadas pelo fallback.
// Não acessa banco nem publica. A migration preserva histórico e exige a base auditada.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PROMPT_NINA_WHATSAPP_V4 } from "../../src/lib/nina/prompt/behavior-v4";
import { PROMPT_NINA_PAINEL_INTERNO } from "../../src/lib/nina/prompt/painel-interno";
import { validarTemplateInstrucoes } from "../../src/lib/nina/instrucoes-template";
import anteriores from "../../src/lib/nina/__tests__/fixtures/instrucoes-antes-consolidacao.json";

export const MIGRATION_CONSOLIDACAO =
  "supabase/migrations/20260920220000_nina_consolidacao_instrucoes.sql";
const md5 = (texto: string) => createHash("md5").update(texto).digest("hex");
const identidade = anteriores.whatsapp.conteudo.match(
  /^\[IDENTIDADE DO ATENDIMENTO\][\s\S]*?\[\/IDENTIDADE DO ATENDIMENTO\]/,
)?.[0];
if (!identidade) throw new Error("A identidade da publicação auditada precisa ser preservada.");

export const PUBLICACOES_CONSOLIDADAS = [
  {
    escopo: "whatsapp" as const,
    anterior_id: anteriores.whatsapp.id,
    anterior_md5: md5(anteriores.whatsapp.conteudo),
    conteudo: `${identidade}\n\n${PROMPT_NINA_WHATSAPP_V4}`,
  },
  {
    escopo: "painel_interno" as const,
    anterior_id: anteriores.painel_interno.id,
    anterior_md5: md5(anteriores.painel_interno.conteudo),
    conteudo: PROMPT_NINA_PAINEL_INTERNO,
  },
];

export function gerarMigrationConsolidacao() {
  for (const p of PUBLICACOES_CONSOLIDADAS) {
    const v = validarTemplateInstrucoes(p.escopo, p.conteudo);
    if (!v.ok) throw new Error(v.mensagem);
    if (p.conteudo.length > 60000) throw new Error("Prompt ultrapassa o limite de publicação.");
  }
  const payload = JSON.stringify(PUBLICACOES_CONSOLIDADAS);
  if (payload.includes("$nina_dados$")) throw new Error("Delimitador SQL presente no conteúdo.");
  return `-- Gerada por scripts/nina/gerar-consolidacao-instrucoes.ts.
-- Consolidação autorizada em 20/09/2026. Apenas novas versões; sem alterar
-- conteúdo, autoria ou datas históricas, pacientes, preços, permissões ou schema.
-- A mesma migration pode ser reaplicada sem sobrescrever publicações posteriores.
DO $nina_consolidacao$
DECLARE
  item jsonb;
  anterior public.nina_instrucoes_versoes;
  proxima integer;
  comentario_publicacao text := 'Consolidação auditada 20/09/2026: busca, esclarecimento, catálogo, pagamento e transferência; restauração do painel interno.';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR item IN SELECT value FROM jsonb_array_elements($nina_dados$${payload}$nina_dados$::jsonb)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NULL AND v.escopo = item->>'escopo'
        AND v.conteudo = item->>'conteudo' AND v.comentario = comentario_publicacao
    ) THEN CONTINUE; END IF;

    SELECT * INTO anterior FROM public.nina_instrucoes_versoes v
    WHERE v.clinica_id IS NULL AND v.escopo = item->>'escopo' AND v.status = 'publicada';
    -- Instalações sem publicação usam o fallback; não inventar identidade nem autoria.
    IF anterior.id IS NULL THEN CONTINUE; END IF;
    IF anterior.id::text <> item->>'anterior_id' OR md5(anterior.conteudo) <> item->>'anterior_md5' THEN
      RAISE EXCEPTION 'A publicação de % mudou desde a auditoria. Reconciliar antes de publicar.', item->>'escopo';
    END IF;

    SELECT coalesce(max(v.versao), 0) + 1 INTO proxima
    FROM public.nina_instrucoes_versoes v WHERE v.clinica_id IS NULL AND v.escopo = item->>'escopo';
    UPDATE public.nina_instrucoes_versoes SET status = 'arquivada' WHERE id = anterior.id;
    INSERT INTO public.nina_instrucoes_versoes
      (clinica_id, escopo, versao, conteudo, status, comentario, versao_anterior_id, publicado_em)
    VALUES (NULL, item->>'escopo', proxima, item->>'conteudo', 'publicada', comentario_publicacao, anterior.id, now());
  END LOOP;
END;
$nina_consolidacao$;
`;
}

if (import.meta.main) {
  await writeFile(MIGRATION_CONSOLIDACAO, gerarMigrationConsolidacao(), "utf8");
  console.log(
    PUBLICACOES_CONSOLIDADAS.map((p) => ({
      escopo: p.escopo,
      caracteres: p.conteudo.length,
      md5: md5(p.conteudo),
    })),
  );
}
