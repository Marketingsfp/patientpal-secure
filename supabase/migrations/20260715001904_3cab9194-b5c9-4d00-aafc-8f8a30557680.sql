
-- Painel público e totem público: permitir acesso anônimo (sem login) via URL com clinica_id.

-- clinicas: leitura anônima (usada pelo totem/painel para pegar nome, branding).
GRANT SELECT ON public.clinicas TO anon;
CREATE POLICY "clinicas_public_select"
  ON public.clinicas FOR SELECT
  TO anon
  USING (true);

-- senhas: leitura anônima (painel exibe as chamadas do dia).
GRANT SELECT ON public.senhas TO anon;
CREATE POLICY "senhas_public_select"
  ON public.senhas FOR SELECT
  TO anon
  USING (true);

-- pacientes: totem público precisa achar por CPF e criar novo.
-- Leitura só de colunas mínimas é imposta pelas queries do front; a policy
-- é ampla porque não dá pra restringir colunas via RLS.
GRANT SELECT, INSERT ON public.pacientes TO anon;
CREATE POLICY "pacientes_public_totem_select"
  ON public.pacientes FOR SELECT
  TO anon
  USING (true);
CREATE POLICY "pacientes_public_totem_insert"
  ON public.pacientes FOR INSERT
  TO anon
  WITH CHECK (clinica_id IS NOT NULL);

-- paciente_biometria: totem público precisa listar biometrias da clínica e inserir novas.
GRANT SELECT, INSERT ON public.paciente_biometria TO anon;
CREATE POLICY "biometria_public_totem_select"
  ON public.paciente_biometria FOR SELECT
  TO anon
  USING (true);
CREATE POLICY "biometria_public_totem_insert"
  ON public.paciente_biometria FOR INSERT
  TO anon
  WITH CHECK (clinica_id IS NOT NULL);

-- Função emitir_senha é SECURITY DEFINER; conceder EXECUTE ao anon para o totem público.
GRANT EXECUTE ON FUNCTION public.emitir_senha(uuid, tipo_senha, uuid, boolean) TO anon;
