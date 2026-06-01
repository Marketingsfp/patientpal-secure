CREATE TABLE public.import_agenda_legado (
  id BIGSERIAL PRIMARY KEY,
  clinica_id UUID NOT NULL,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  codigo_agenda TEXT,
  codigo_agenda_pai TEXT,
  codigo_filial TEXT,
  codigo_profissional TEXT,
  codigo_cliente TEXT,
  data_hora_inicio TEXT,
  data_hora_inicio_real TEXT,
  data_hora_fim TEXT,
  data_hora_fim_real TEXT,
  baixa TEXT,
  situacao TEXT,
  codigo_usuario_geracao TEXT,
  data_geracao TEXT,
  codigo_usuario_marcacao TEXT,
  data_marcacao TEXT,
  observacao TEXT,
  codigo_profissional_original TEXT,
  reservado_avaliacao TEXT,
  chegou_clinica TEXT,
  encaixe TEXT,
  confirmacao TEXT,
  cancelamento TEXT,
  codigo_agenda_situacao TEXT,
  sem_faturamento TEXT,
  codigo_convenio TEXT,
  codigo_plano TEXT,
  sem_faturamento_data TEXT,
  sem_faturamento_usuario TEXT,
  sem_faturamento_motivo TEXT,
  reagendamento TEXT,
  ficha TEXT,
  qnt_impressao_guia_atendimento TEXT,
  cancelamento_usuario TEXT,
  turno TEXT,
  codigo_sala TEXT,
  agendamento_online TEXT,
  reagendamento_agenda_anterior TEXT,
  reagendamento_usuario_anterior TEXT,
  reagendamento_marcacao_anterior TEXT,
  atendido TEXT,
  agendamento_online_codigo_origem TEXT,
  telemedicina TEXT,
  observacao_temp TEXT,
  callcenter TEXT,
  confirmacao_envio TEXT,
  codigo_usuario_marcacao_original TEXT,
  repique TEXT,
  reservado_avaliacao_motivo TEXT,
  data_hora_senha_acesso TEXT,
  codigo_usuario_baixa TEXT,
  codigo_midia TEXT
);

CREATE INDEX idx_import_agenda_legado_clinica ON public.import_agenda_legado(clinica_id);
CREATE INDEX idx_import_agenda_legado_cod_agenda ON public.import_agenda_legado(clinica_id, codigo_agenda);
CREATE INDEX idx_import_agenda_legado_cliente ON public.import_agenda_legado(clinica_id, codigo_cliente);

GRANT SELECT ON public.import_agenda_legado TO authenticated;
GRANT ALL ON public.import_agenda_legado TO service_role;

ALTER TABLE public.import_agenda_legado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores podem ver staging da sua clinica"
  ON public.import_agenda_legado FOR SELECT
  TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));