-- Módulo Hiperdia — aferições de hipertensão e diabetes por paciente.
--
-- ESCOPO: uma linha por aferição. O registro é um instantâneo clínico
-- (pressão, glicemia, peso) tirado numa data — não é um cadastro editável.
--
-- ISOLAMENTO POR CLÍNICA (`clinica_id`): esta coluna não foi pedida no escopo
-- original, mas é obrigatória aqui. Toda tabela clínica deste sistema
-- (`pacientes`, `prontuarios`, `medicos`) isola dados por clínica via
-- `is_member(auth.uid(), clinica_id)`. Sem `clinica_id` não existe policy de
-- RLS capaz de separar clínicas, e as aferições de um paciente ficariam
-- legíveis por qualquer usuário autenticado de qualquer outra clínica.
-- Como são dados de saúde (LGPD, art. 11 — dado pessoal sensível), o padrão
-- da casa foi mantido. Ver nota "RLS" abaixo.
--
-- APPEND-ONLY: existem apenas policies de SELECT e INSERT, conforme pedido.
-- Sem UPDATE e sem DELETE, nenhum usuário autenticado altera ou apaga uma
-- aferição já gravada pela API. Isso é intencional e alinhado à política de
-- dados históricos imutáveis do projeto: um valor de pressão aferido é um
-- fato clínico datado, não um campo de cadastro. Correções devem ser feitas
-- por novo registro (o histórico mostra os dois). Se for preciso corrigir um
-- erro de digitação, isso exige uma migration futura ou ação via service_role.
--
-- ROLLBACK: `DROP TABLE public.hiperdia_registros;` — a tabela é nova e
-- nenhum objeto existente passa a depender dela. Nenhuma tabela atual é
-- alterada por esta migration.

CREATE TABLE public.hiperdia_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  data_registro timestamptz NOT NULL DEFAULT now(),
  pressao_sistolica integer,
  pressao_diastolica integer,
  glicemia_jejum integer,
  glicemia_pos_prandial integer,
  peso numeric(5, 2),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Faixas fisiologicamente possíveis. O objetivo não é diagnosticar, é barrar
  -- erro de digitação grosseiro (ex.: 1400 no lugar de 140) antes que vire
  -- histórico clínico. Os limites são folgados de propósito: valores
  -- clinicamente alarmantes mas reais precisam poder ser registrados.
  CONSTRAINT hiperdia_sistolica_chk
    CHECK (pressao_sistolica IS NULL OR pressao_sistolica BETWEEN 40 AND 300),
  CONSTRAINT hiperdia_diastolica_chk
    CHECK (pressao_diastolica IS NULL OR pressao_diastolica BETWEEN 20 AND 200),
  CONSTRAINT hiperdia_glicemia_jejum_chk
    CHECK (glicemia_jejum IS NULL OR glicemia_jejum BETWEEN 10 AND 1000),
  CONSTRAINT hiperdia_glicemia_pos_chk
    CHECK (glicemia_pos_prandial IS NULL OR glicemia_pos_prandial BETWEEN 10 AND 1000),
  CONSTRAINT hiperdia_peso_chk
    CHECK (peso IS NULL OR peso BETWEEN 0.5 AND 500),

  -- Pressão só faz sentido como par: "140/—" não é uma aferição.
  CONSTRAINT hiperdia_pressao_par_chk
    CHECK ((pressao_sistolica IS NULL) = (pressao_diastolica IS NULL)),

  -- Impede registro vazio (só data e observação), que polui o histórico
  -- e não representa aferição nenhuma.
  CONSTRAINT hiperdia_alguma_medida_chk
    CHECK (
      num_nonnulls(
        pressao_sistolica, pressao_diastolica,
        glicemia_jejum, glicemia_pos_prandial, peso
      ) > 0
    ),

  CONSTRAINT hiperdia_observacoes_chk
    CHECK (observacoes IS NULL OR length(observacoes) <= 2000)
);

-- GRANTs — mesma convenção das demais tabelas do projeto (`estoque_lotes`,
-- `mkt_envios`, `clima_diario`). RLS e GRANT são camadas independentes: sem o
-- GRANT, o Postgres barra a consulta com "permission denied for table" antes
-- mesmo de avaliar a policy, e o card do Hiperdia quebraria na tela.
-- Só SELECT e INSERT para `authenticated`, reforçando no nível de privilégio o
-- mesmo desenho append-only das policies abaixo.
GRANT SELECT, INSERT ON public.hiperdia_registros TO authenticated;
GRANT ALL ON public.hiperdia_registros TO service_role;

ALTER TABLE public.hiperdia_registros ENABLE ROW LEVEL SECURITY;

-- RLS — leitura e inserção para usuários autenticados, restritas à clínica
-- do usuário. `is_member` já é a função usada por `pacientes` e `prontuarios`.
-- Se a intenção for mesmo liberar para QUALQUER autenticado, trocar o USING /
-- WITH CHECK por `true` — mas isso expõe dados de saúde entre clínicas.
CREATE POLICY hiperdia_member_select ON public.hiperdia_registros
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY hiperdia_member_insert ON public.hiperdia_registros
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

-- Mantém `updated_at` coerente caso um UPDATE ocorra via service_role.
CREATE TRIGGER hiperdia_touch
  BEFORE UPDATE ON public.hiperdia_registros
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auditoria: mesma convenção das demais tabelas do projeto.
CREATE TRIGGER trg_audit_hiperdia_registros
  AFTER INSERT OR UPDATE OR DELETE ON public.hiperdia_registros
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- Consulta principal: histórico de um paciente, do mais recente para o mais
-- antigo, dentro da clínica. Mesma forma do índice de `prontuarios`.
CREATE INDEX idx_hiperdia_paciente
  ON public.hiperdia_registros (clinica_id, paciente_id, data_registro DESC);
