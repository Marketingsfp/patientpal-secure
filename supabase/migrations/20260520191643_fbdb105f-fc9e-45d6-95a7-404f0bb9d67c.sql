-- Função genérica: força CAIXA ALTA em campos de texto de cadastro,
-- preservando acentuação (upper() do Postgres respeita Unicode).
CREATE OR REPLACE FUNCTION public.uppercase_text_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  cols text[] := ARRAY[
    'nome','descricao','observacoes','observacao','endereco','bairro','cidade',
    'complemento','parentesco','funcao','razao_social','nome_fantasia',
    'responsavel','referencia','titulo','marca','modelo',
    'funcionario_nome','paciente_nome','medico_nome'
  ];
  c text;
  rec jsonb := to_jsonb(NEW);
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF (rec ? c) AND (rec->>c) IS NOT NULL AND length(rec->>c) > 0 THEN
      rec := jsonb_set(rec, ARRAY[c], to_jsonb(upper(rec->>c)));
    END IF;
  END LOOP;
  NEW := jsonb_populate_record(NEW, rec);
  RETURN NEW;
END;
$$;

-- Remove trigger antigo redundante de procedimentos (será substituído pelo genérico)
DROP TRIGGER IF EXISTS procedimentos_uppercase_nome_trg ON public.procedimentos;
DROP TRIGGER IF EXISTS tg_procedimentos_uppercase_nome ON public.procedimentos;

-- Cria triggers BEFORE INSERT OR UPDATE em todas as tabelas de cadastro
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'agendamentos','alertas_enfermagem','anamnese_modelos','boletos','caixa_movimentos',
    'caixa_sessoes','campanhas_marketing','cargos','cartoes_convenio','chat_canais',
    'clinicas','contrato_dependentes','contrato_mensalidades','contratos_assinatura',
    'crm_etapas','crm_oportunidades','documentos_emitidos','especialidades',
    'estoque_movimentos','estoque_produtos','exame_resultados','fin_atendimentos',
    'fin_categorias','fin_contas','fin_empresas','fin_lancamentos','fin_lembretes',
    'fin_notas_pacientes','fin_regras_ia','hr_banco_horas','hr_contratos','hr_ferias',
    'hr_holerites','hr_pontos','integration_secrets','lgpd_solicitacoes','lms_cursos',
    'lms_licoes','lms_modulos','medico_convenios','medico_disponibilidades','medicos',
    'mkt_landing_pages','mkt_leads','mkt_segmentos','modelos_documentos','nfse',
    'odonto_dentes','odonto_prontuarios','orcamento_itens','orcamentos','pacientes',
    'pagamentos','permissions','planos_assinatura','prestadores',
    'procedimento_split_regras','procedimentos','profiles','prontuario_modelos',
    'prontuarios','regras_rateio','setores','unidades','whatsapp_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_uppercase_text_fields ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_uppercase_text_fields BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uppercase_text_fields()',
      t
    );
  END LOOP;
END $$;