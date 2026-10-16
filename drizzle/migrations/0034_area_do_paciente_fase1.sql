-- Área do Paciente (fase 1). Paciente NÃO é usuário do Auth nem membro da clínica:
-- todo acesso dele passa por funções do servidor (service_role) com sessão própria.
-- A equipe só lê/decide pelas políticas abaixo.

CREATE TABLE public.portal_paciente_config (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  cancelar_horas_min integer NOT NULL DEFAULT 2 CHECK (cancelar_horas_min BETWEEN 0 AND 168),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.portal_paciente_config TO authenticated;
GRANT ALL ON public.portal_paciente_config TO service_role;
ALTER TABLE public.portal_paciente_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membro le config portal" ON public.portal_paciente_config FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "admin cria config portal" ON public.portal_paciente_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), clinica_id, 'admin'));
CREATE POLICY "admin altera config portal" ON public.portal_paciente_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), clinica_id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), clinica_id, 'admin'));

CREATE TABLE public.portal_termos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  titulo text NOT NULL,
  texto text NOT NULL,
  rascunho_juridico boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  UNIQUE (clinica_id, versao)
);
GRANT SELECT, INSERT ON public.portal_termos TO authenticated;
GRANT ALL ON public.portal_termos TO service_role;
ALTER TABLE public.portal_termos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membro le termos portal" ON public.portal_termos FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY "admin cria versao termo" ON public.portal_termos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), clinica_id, 'admin'));

CREATE TABLE public.portal_termo_aceites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  termo_id uuid NOT NULL REFERENCES public.portal_termos(id),
  aceito_em timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  UNIQUE (paciente_id, termo_id)
);
GRANT SELECT ON public.portal_termo_aceites TO authenticated;
GRANT ALL ON public.portal_termo_aceites TO service_role;
ALTER TABLE public.portal_termo_aceites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestor le aceites" ON public.portal_termo_aceites FOR SELECT TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- Códigos e sessões: só o servidor. Sem política = ninguém do navegador lê.
CREATE TABLE public.portal_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  cpf_hash text NOT NULL,
  paciente_id uuid,
  codigo_hash text,
  enviado boolean NOT NULL DEFAULT false,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0,
  invalidado boolean NOT NULL DEFAULT false,
  ip_hash text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_otps_cpf ON public.portal_otps (clinica_id, cpf_hash, criado_em DESC);
CREATE INDEX idx_portal_otps_ip ON public.portal_otps (ip_hash, criado_em DESC);
GRANT ALL ON public.portal_otps TO service_role;
ALTER TABLE public.portal_otps ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.portal_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
  expira_max_em timestamptz NOT NULL,
  encerrada_em timestamptz,
  ip_hash text
);
CREATE INDEX idx_portal_sessoes_paciente ON public.portal_sessoes (paciente_id, criado_em DESC);
GRANT ALL ON public.portal_sessoes TO service_role;
ALTER TABLE public.portal_sessoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.portal_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid,
  cpf_hash text,
  evento text NOT NULL,
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_acessos_clinica ON public.portal_acessos (clinica_id, criado_em DESC);
CREATE INDEX idx_portal_acessos_paciente ON public.portal_acessos (paciente_id, criado_em DESC);
GRANT SELECT ON public.portal_acessos TO authenticated;
GRANT ALL ON public.portal_acessos TO service_role;
ALTER TABLE public.portal_acessos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestor le acessos portal" ON public.portal_acessos FOR SELECT TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TABLE public.portal_solicitacoes_cadastro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  dados_novos jsonb NOT NULL,
  dados_anteriores jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','recusada','cancelada')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  decidido_por uuid,
  decidido_em timestamptz,
  observacao text
);
CREATE INDEX idx_portal_solic_clinica ON public.portal_solicitacoes_cadastro (clinica_id, status, criado_em DESC);
CREATE INDEX idx_portal_solic_paciente ON public.portal_solicitacoes_cadastro (paciente_id, status);
GRANT SELECT ON public.portal_solicitacoes_cadastro TO authenticated;
GRANT ALL ON public.portal_solicitacoes_cadastro TO service_role;
ALTER TABLE public.portal_solicitacoes_cadastro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membro le solicitacoes portal" ON public.portal_solicitacoes_cadastro FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

-- Aprovar/recusar: só gestão, recepção ou supervisão; aplica apenas os campos permitidos.
CREATE OR REPLACE FUNCTION public.portal_decidir_solicitacao(_id uuid, _aprovar boolean, _observacao text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; d jsonb;
BEGIN
  SELECT * INTO s FROM public.portal_solicitacoes_cadastro WHERE id = _id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF NOT (public.can_manage_clinica(auth.uid(), s.clinica_id)
          OR public.has_role(auth.uid(), s.clinica_id, 'recepcao')
          OR public.has_role(auth.uid(), s.clinica_id, 'supervisor')) THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  IF s.status <> 'pendente' THEN RAISE EXCEPTION 'Esta solicitação já foi decidida.'; END IF;
  d := s.dados_novos;
  IF _aprovar THEN
    UPDATE public.pacientes SET
      telefone    = CASE WHEN d ? 'telefone'    THEN NULLIF(d->>'telefone','')    ELSE telefone END,
      email       = CASE WHEN d ? 'email'       THEN NULLIF(d->>'email','')       ELSE email END,
      cep         = CASE WHEN d ? 'cep'         THEN NULLIF(d->>'cep','')         ELSE cep END,
      logradouro  = CASE WHEN d ? 'logradouro'  THEN NULLIF(d->>'logradouro','')  ELSE logradouro END,
      numero      = CASE WHEN d ? 'numero'      THEN NULLIF(d->>'numero','')      ELSE numero END,
      complemento = CASE WHEN d ? 'complemento' THEN NULLIF(d->>'complemento','') ELSE complemento END,
      bairro      = CASE WHEN d ? 'bairro'      THEN NULLIF(d->>'bairro','')      ELSE bairro END,
      cidade      = CASE WHEN d ? 'cidade'      THEN NULLIF(d->>'cidade','')      ELSE cidade END,
      estado      = CASE WHEN d ? 'estado'      THEN NULLIF(d->>'estado','')      ELSE estado END
    WHERE id = s.paciente_id AND clinica_id = s.clinica_id;
  END IF;
  UPDATE public.portal_solicitacoes_cadastro
    SET status = CASE WHEN _aprovar THEN 'aprovada' ELSE 'recusada' END,
        decidido_por = auth.uid(), decidido_em = now(), observacao = _observacao
    WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.portal_decidir_solicitacao(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_decidir_solicitacao(uuid, boolean, text) TO authenticated;

-- Liga o portal só na CLINICA CONSULTA HOJE e cria o termo rascunho v1.
INSERT INTO public.portal_paciente_config (clinica_id, ativo, cancelar_horas_min)
VALUES ('e9e41341-0e53-4216-8284-caeeaf6fb887', true, 2)
ON CONFLICT (clinica_id) DO NOTHING;

INSERT INTO public.portal_termos (clinica_id, versao, titulo, texto, rascunho_juridico)
SELECT 'e9e41341-0e53-4216-8284-caeeaf6fb887', 1, 'Termo de uso e privacidade da Área do Paciente',
$t$RASCUNHO — PENDENTE DE REVISÃO JURÍDICA

1. O que é a Área do Paciente
A Área do Paciente permite que você veja seus agendamentos, confirme ou cancele consultas dentro do prazo e peça a atualização dos seus dados de contato.

2. Quais dados usamos
Usamos o seu CPF e o e-mail já cadastrado na clínica para confirmar que é você, enviando um código de uso único. Mostramos apenas os seus próprios dados cadastrados nesta clínica.

3. Para que usamos
Para identificar você com segurança, mostrar suas informações de atendimento e registrar as ações feitas aqui (por exemplo, confirmação ou cancelamento de consulta).

4. Registro de acessos
Por segurança e para cumprir a Lei Geral de Proteção de Dados (Lei 13.709/2018), registramos data, hora e as ações realizadas em cada acesso.

5. Seus direitos
Você pode pedir informações sobre seus dados, correção ou outras solicitações previstas na LGPD diretamente na recepção da clínica.

6. Cuidados
Não compartilhe o código recebido por e-mail. Ao terminar, use o botão "Sair". A sessão é encerrada automaticamente após 30 minutos sem uso.

Ao continuar, você declara que leu e concorda com este termo.$t$, true
WHERE NOT EXISTS (SELECT 1 FROM public.portal_termos WHERE clinica_id = 'e9e41341-0e53-4216-8284-caeeaf6fb887');