ALTER TABLE public.atend_handoff_resumos
  ADD COLUMN IF NOT EXISTS situacao text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS desfecho text,
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS resolvido_por uuid;

ALTER TABLE public.atend_handoff_resumos
  DROP CONSTRAINT IF EXISTS atend_handoff_resumos_situacao_check;
ALTER TABLE public.atend_handoff_resumos
  ADD CONSTRAINT atend_handoff_resumos_situacao_check
  CHECK (situacao IN ('active', 'superseded', 'archived'));

-- Histórico: mantém tudo, mas só o mais recente de cada conversa fica vigente.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY conversa_id ORDER BY versao DESC, handoff_em DESC
  ) AS rn
  FROM public.atend_handoff_resumos
)
UPDATE public.atend_handoff_resumos r
SET situacao = CASE WHEN ranked.rn = 1 THEN 'active' ELSE 'superseded' END
FROM ranked
WHERE ranked.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS atend_handoff_resumos_vigente_uniq
  ON public.atend_handoff_resumos (conversa_id)
  WHERE situacao = 'active';

CREATE INDEX IF NOT EXISTS atend_handoff_resumos_conversa_versao_idx
  ON public.atend_handoff_resumos (conversa_id, versao DESC);