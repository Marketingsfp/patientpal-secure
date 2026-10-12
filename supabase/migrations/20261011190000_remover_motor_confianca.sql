-- Remoção do motor de confiança da Nina (pedido do responsável em 11/10/2026).
--
-- O motor foi desativado em 16/09/2026 e o código que lia e gravava estas
-- tabelas foi removido. Em produção não há gravações desde 16/09 (decisões) e
-- 24/09 (vínculos); nenhuma função, view ou chave estrangeira externa depende
-- delas (conferido no catálogo em 11/10/2026).
--
-- APAGA DEFINITIVAMENTE o histórico do motor: decisões, vínculos de entrega e
-- propostas de calibração, além das colunas de confiança dos cenários da
-- homologação (sem valores gravados). Não toca nenhuma outra tabela.
--
-- Sem CASCADE de propósito: uma dependência não mapeada faz a migration falhar
-- em vez de apagar outro objeto junto.
BEGIN;

-- Vínculos referenciam decisões (FK): saem primeiro. Gatilhos, índices e
-- políticas de RLS das tabelas saem junto com elas.
DROP TABLE IF EXISTS public.nina_confianca_vinculos;
DROP TABLE IF EXISTS public.nina_confianca_decisoes;
DROP TABLE IF EXISTS public.nina_confianca_propostas;

-- Funções de gatilho exclusivas do motor (a função genérica de updated_at fica).
DROP FUNCTION IF EXISTS public.nina_confianca_vinculos_imutavel();
DROP FUNCTION IF EXISTS public.nina_confianca_decisoes_imutavel();
DROP FUNCTION IF EXISTS public.nina_confianca_propostas_guard();

-- Resumo de confiança por cenário da homologação: não é mais calculado.
ALTER TABLE public.nina_teste_execucao_itens
  DROP COLUMN IF EXISTS confianca_amostras,
  DROP COLUMN IF EXISTS confianca_media,
  DROP COLUMN IF EXISTS confianca_min,
  DROP COLUMN IF EXISTS confianca_max,
  DROP COLUMN IF EXISTS confianca_niveis,
  DROP COLUMN IF EXISTS confianca_nivel_minimo,
  DROP COLUMN IF EXISTS confianca_trace_ids;

COMMIT;
