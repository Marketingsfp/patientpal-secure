CREATE OR REPLACE FUNCTION public.nina_kb_buscar_semantico(
  p_base_id uuid,
  p_embedding vector(768),
  p_limite integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  categoria text,
  tipo text,
  procedimento text,
  medico text,
  dia text,
  horario text,
  preco_dinheiro numeric,
  preco_cartao numeric,
  observacoes text,
  preparo text,
  linha_origem integer,
  aba_origem text,
  similaridade double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT r.id, r.categoria, r.tipo, r.procedimento, r.medico, r.dia, r.horario,
         r.preco_dinheiro, r.preco_cartao, r.observacoes, r.preparo,
         r.linha_origem, r.aba_origem,
         1 - (r.embedding <=> p_embedding) AS similaridade
    FROM public.nina_kb_registros r
   WHERE r.base_id = p_base_id
     AND r.embedding IS NOT NULL
   ORDER BY r.embedding <=> p_embedding
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 8), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.nina_kb_buscar_semantico(uuid, vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nina_kb_buscar_semantico(uuid, vector, integer) TO authenticated, service_role;