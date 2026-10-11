-- Orçamentos: foto do pedido médico tirada com o celular.
--
-- O computador abre uma sessão e mostra um QR code; o celular abre o link,
-- tira a foto e o servidor lê o pedido. A sessão guarda só o RESULTADO da
-- leitura (nomes e exames), nunca a imagem. Vale 10 minutos, é de uso único e
-- o computador apaga a linha assim que recebe o resultado.
--
-- O celular não faz login: quem fala com esta tabela por ele é o servidor
-- (service role), conferindo o código e a validade. Pelo navegador, só quem
-- abriu a sessão enxerga a própria linha.

CREATE TABLE IF NOT EXISTS public.orcamento_foto_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE CHECK (length(token) >= 40),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  criado_por uuid NOT NULL DEFAULT auth.uid(),
  estado text NOT NULL DEFAULT 'aguardando'
    CHECK (estado IN ('aguardando', 'lendo', 'pronto')),
  tentativas integer NOT NULL DEFAULT 0,
  resultado jsonb,
  expira_em timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orcamento_foto_sessoes_expira_idx
  ON public.orcamento_foto_sessoes (expira_em);

ALTER TABLE public.orcamento_foto_sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orcamento_foto_sessoes_select ON public.orcamento_foto_sessoes;
CREATE POLICY orcamento_foto_sessoes_select ON public.orcamento_foto_sessoes
  FOR SELECT TO authenticated
  USING (criado_por = auth.uid() AND public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS orcamento_foto_sessoes_insert ON public.orcamento_foto_sessoes;
CREATE POLICY orcamento_foto_sessoes_insert ON public.orcamento_foto_sessoes
  FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND public.is_member(auth.uid(), clinica_id)
    AND estado = 'aguardando'
    AND resultado IS NULL
    AND tentativas = 0
    AND expira_em <= now() + interval '10 minutes'
  );

DROP POLICY IF EXISTS orcamento_foto_sessoes_delete ON public.orcamento_foto_sessoes;
CREATE POLICY orcamento_foto_sessoes_delete ON public.orcamento_foto_sessoes
  FOR DELETE TO authenticated
  USING (criado_por = auth.uid() AND public.is_member(auth.uid(), clinica_id));

-- Sem UPDATE pelo navegador: só o servidor grava a leitura.
REVOKE ALL ON public.orcamento_foto_sessoes FROM anon;
