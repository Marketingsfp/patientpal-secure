-- Alinha o convenio "Cartao Consulta + Seguros" da Policlinica Menino Jesus ao
-- informativo oficial (CARTAO_1.pdf / Policardmed):
-- - mensalidades da tabela: 120, 175, 210, 245, 280, 295 e adesao unica R$ 30
-- - limite de cinco dependentes (seis associados contando o titular)
-- - consultas clinicas sem carencia: R$ 9,99 no ato, sem variacao por forma de
--   pagamento, liberadas apos a 1a mensalidade + taxa de inscricao
-- - limite de uma consulta por dia por contrato nessas especialidades; a
--   consulta excedente custa 50% do valor particular
-- - franquia diferenciada, por utilizacao e SEM limite de uso:
--   Psicologia/Nutricao = R$ 60 dinheiro / R$ 72 Pix-cartao
--   grupo diferenciado = R$ 80 dinheiro / R$ 95 Pix-cartao
-- - descontos de exames apos a 2a mensalidade, incluindo Preventivo/Ecocardiograma
-- - gratuidades laboratoriais e cotas anuais apos a 6a mensalidade

DO $$
DECLARE
  v_clinica uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid;
  v_conv record;
  v_faixa record;
  v_esp record;
  v_valor_dinheiro numeric(12,2);
  v_valor_cartao numeric(12,2);
  v_esps_8 text[] := ARRAY[
    'ANGIOLOGIA',
    'CARDIOLOGIA',
    'CLINICO GERAL',
    'CLINICA MEDICA',
    'DERMATOLOGIA',
    'ENDOCRINOLOGIA',
    'GASTRO',
    'GASTROENTEROLOGIA',
    'GERIATRIA',
    'GINECOLOGIA',
    'ORTOPEDIA',
    'ORTOPEDIA E TRAUMATOLOGIA',
    'OTORRINO',
    'OTORRINOLARINGOLOGIA',
    'OBSTETRICIA',
    'PEDIATRIA',
    'UROLOGIA'
  ];
  v_esps_60 text[] := ARRAY[
    'PSICOLOGIA',
    'NUTRICAO'
  ];
  v_esps_80 text[] := ARRAY[
    'ALERGOLOGIA',
    'CARDIOLOGIA INFANTIL',
    'ENDOCRINOLOGIA INFANTIL',
    'FONOAUDIOLOGIA',
    'MASTOLOGIA',
    'NEFROLOGIA',
    'NEUROLOGIA',
    'OFTALMOLOGIA',
    'PODOLOGIA',
    'PNEUMOLOGIA',
    'PROCTOLOGIA',
    'PSIQUIATRIA',
    'REUMATOLOGIA'
  ];
BEGIN
  FOR v_conv IN
    SELECT id, nome
    FROM public.cb_convenios
    WHERE clinica_id = v_clinica
      AND upper(public.strip_accents(nome)) = 'CARTAO CONSULTA + SEGUROS'
  LOOP
    UPDATE public.cb_convenios
       SET valor_mensal = 120.00,
           taxa_adesao = 30.00,
           num_parcelas = 12,
           vigencia_meses = 12,
           max_dependentes = 5,
           updated_at = now()
     WHERE id = v_conv.id;

    FOR v_faixa IN
      SELECT *
      FROM (VALUES
        (1, 1, 120.00::numeric),
        (2, 2, 175.00::numeric),
        (3, 3, 210.00::numeric),
        (4, 4, 245.00::numeric),
        (5, 5, 280.00::numeric),
        (6, 6, 295.00::numeric)
      ) AS f(vidas_de, vidas_ate, valor_mensal)
    LOOP
      UPDATE public.cb_convenio_faixas
         SET vidas_ate = v_faixa.vidas_ate,
             valor_mensal = v_faixa.valor_mensal,
             updated_at = now()
       WHERE convenio_id = v_conv.id
         AND vidas_de = v_faixa.vidas_de;

      IF NOT FOUND THEN
        INSERT INTO public.cb_convenio_faixas
          (convenio_id, vidas_de, vidas_ate, valor_mensal)
        VALUES
          (v_conv.id, v_faixa.vidas_de, v_faixa.vidas_ate, v_faixa.valor_mensal);
      END IF;
    END LOOP;

    FOR v_esp IN
      SELECT id,
             CASE
               WHEN upper(public.strip_accents(nome)) = ANY (v_esps_60) THEN 60.00::numeric
               WHEN upper(public.strip_accents(nome)) = ANY (v_esps_80) THEN 80.00::numeric
               ELSE 9.99::numeric
             END AS valor_dinheiro,
             CASE
               WHEN upper(public.strip_accents(nome)) = ANY (v_esps_60) THEN 72.00::numeric
               WHEN upper(public.strip_accents(nome)) = ANY (v_esps_80) THEN 95.00::numeric
               ELSE 9.99::numeric
             END AS valor_cartao
      FROM public.especialidades
      WHERE ativo = true
        AND (
          upper(public.strip_accents(nome)) = ANY (v_esps_8)
          OR upper(public.strip_accents(nome)) = ANY (v_esps_60)
          OR upper(public.strip_accents(nome)) = ANY (v_esps_80)
        )
    LOOP
      v_valor_dinheiro := v_esp.valor_dinheiro;
      v_valor_cartao := v_esp.valor_cartao;

      -- Secao I do informativo: consultas liberadas "apos o pagamento da 1a
      -- mensalidade e taxa de inscricao" -> carencia de 1 mensalidade.
      UPDATE public.cb_convenio_regras
         SET modo = 'valor_fixo',
             valor = v_valor_dinheiro,
             valor_cartao = v_valor_cartao,
             percentual = NULL,
             percentual_cartao = NULL,
             carencia_mensalidades = 1,
             prioridade = GREATEST(prioridade, 10),
             ativo = true,
             gratuito = false,
             updated_at = now()
       WHERE convenio_id = v_conv.id
         AND clinica_id = v_clinica
         AND especialidade_id = v_esp.id
         AND procedimento_id IS NULL
         AND tipo = 'consulta';

      IF NOT FOUND THEN
        INSERT INTO public.cb_convenio_regras
          (clinica_id, convenio_id, especialidade_id, tipo, modo, valor, valor_cartao, carencia_mensalidades, prioridade, ativo, gratuito)
        VALUES
          (v_clinica, v_conv.id, v_esp.id, 'consulta', 'valor_fixo', v_valor_dinheiro, v_valor_cartao, 1, 10, true, false);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Completa as regras funcionais descritas no informativo:
-- - uma consulta por dia por contrato;
-- - descontos em exames somente apos a 2a mensalidade;
-- - gratuidades laboratoriais e cotas anuais apos a 6a mensalidade.
DO $$
DECLARE
  v_clinica uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid;
  v_conv record;
  v_esp record;
  v_proc record;
  v_percentual numeric(5,2);
  v_grupo text;
  v_limite integer;
  v_periodo text;
  v_excedente text;
  -- As 13 especialidades sem carencia do informativo (R$ 9,99): dividem UMA
  -- cota diaria por contrato e a consulta excedente custa 50% do particular.
  v_esps_cota_diaria text[] := ARRAY[
    'ANGIOLOGIA',
    'CARDIOLOGIA',
    'CLINICO GERAL',
    'CLINICA MEDICA',
    'DERMATOLOGIA',
    'ENDOCRINOLOGIA',
    'GASTRO',
    'GASTROENTEROLOGIA',
    'GERIATRIA',
    'GINECOLOGIA',
    'ORTOPEDIA',
    'ORTOPEDIA E TRAUMATOLOGIA',
    'OTORRINO',
    'OTORRINOLARINGOLOGIA',
    'OBSTETRICIA',
    'PEDIATRIA',
    'UROLOGIA'
  ];
  -- Franquia diferenciada: taxa cobrada "por utilizacao", SEM limite de uso.
  v_esps_franquia text[] := ARRAY[
    'PSICOLOGIA',
    'NUTRICAO',
    'ALERGOLOGIA',
    'CARDIOLOGIA INFANTIL',
    'ENDOCRINOLOGIA INFANTIL',
    'FONOAUDIOLOGIA',
    'MASTOLOGIA',
    'NEFROLOGIA',
    'NEUROLOGIA',
    'OFTALMOLOGIA',
    'PODOLOGIA',
    'PNEUMOLOGIA',
    'PROCTOLOGIA',
    'PSIQUIATRIA',
    'REUMATOLOGIA'
  ];
  v_esps_exame_10 text[] := ARRAY[
    'LABORATORIO',
    'ELETROCARDIOGRAMA',
    'RAIO-X',
    'RAIO X',
    'PREVENTIVO',
    'MAMOGRAFIA',
    'DENSITOMETRIA OSSEA'
  ];
  v_esps_exame_5 text[] := ARRAY[
    'ODONTOLOGIA',
    'USG',
    'ULTRASSONOGRAFIA',
    'TC',
    'TOMOGRAFIA',
    'TOMOGRAFIA COMPUTADORIZADA',
    'RM',
    'RESSONANCIA',
    'RESSONANCIA MAGNETICA',
    'ECOCARDIOGRAMA',
    'EEG',
    'ELETROENCEFALOGRAMA',
    'ERGOMETRICO',
    'TESTE ERGOMETRICO',
    'ENDOSCOPIA',
    'ENDOSCOPIA DIGESTIVA ALTA',
    'FISIOTERAPIA',
    'RPG',
    'ACUPUNTURA'
  ];
BEGIN
  FOR v_conv IN
    SELECT id
    FROM public.cb_convenios
    WHERE clinica_id = v_clinica
      AND upper(public.strip_accents(nome)) = 'CARTAO CONSULTA + SEGUROS'
  LOOP
    -- O grupo compartilhado faz as 13 especialidades sem carencia consumirem a
    -- mesma cota diaria do contrato, em vez de uma cota por especialidade.
    -- Excedente = 50% do valor particular (informativo: "Caso o associado
    -- queira usar mais de uma, sera cobrado 50% do preco do valor particular").
    UPDATE public.cb_convenio_regras r
       SET limite_qtd = 1,
           limite_periodo = 'dia',
           limite_escopo = 'contrato',
           excedente_modo = 'percentual_particular',
           excedente_percentual = 50.00,
           excedente_valor = NULL,
           grupo_gratuidade = 'consulta-diaria-cartao-consulta',
           updated_at = now()
      FROM public.especialidades e
     WHERE r.convenio_id = v_conv.id
       AND r.clinica_id = v_clinica
       AND r.especialidade_id = e.id
       AND r.procedimento_id IS NULL
       AND r.tipo = 'consulta'
       AND r.gratuito = false
       AND upper(public.strip_accents(e.nome)) = ANY (v_esps_cota_diaria);

    -- A franquia diferenciada e cobrada "por utilizacao": nenhum limite diario
    -- e nenhum compartilhamento de cota com as consultas de R$ 9,99.
    UPDATE public.cb_convenio_regras r
       SET limite_qtd = NULL,
           limite_periodo = NULL,
           limite_escopo = NULL,
           excedente_modo = NULL,
           excedente_percentual = NULL,
           excedente_valor = NULL,
           grupo_gratuidade = NULL,
           updated_at = now()
      FROM public.especialidades e
     WHERE r.convenio_id = v_conv.id
       AND r.clinica_id = v_clinica
       AND r.especialidade_id = e.id
       AND r.procedimento_id IS NULL
       AND r.tipo = 'consulta'
       AND r.gratuito = false
       AND upper(public.strip_accents(e.nome)) = ANY (v_esps_franquia);

    -- Regras percentuais por grupo/especialidade, incluindo Preventivo e
    -- Ecocardiograma, que nao constavam nos grupos anteriores.
    FOR v_esp IN
      SELECT id,
             CASE
               WHEN upper(public.strip_accents(nome)) = ANY (v_esps_exame_10)
                 THEN 10.00::numeric
               ELSE 5.00::numeric
             END AS percentual
      FROM public.especialidades
      WHERE ativo = true
        AND (
          upper(public.strip_accents(nome)) = ANY (v_esps_exame_10)
          OR upper(public.strip_accents(nome)) = ANY (v_esps_exame_5)
        )
    LOOP
      v_percentual := v_esp.percentual;

      UPDATE public.cb_convenio_regras
         SET modo = 'percentual_desconto',
             valor = NULL,
             valor_cartao = NULL,
             percentual = v_percentual,
             percentual_cartao = v_percentual,
             carencia_mensalidades = 2,
             prioridade = GREATEST(prioridade, 10),
             ativo = true,
             gratuito = false,
             updated_at = now()
       WHERE convenio_id = v_conv.id
         AND clinica_id = v_clinica
         AND especialidade_id = v_esp.id
         AND procedimento_id IS NULL
         AND tipo = 'exame';

      IF NOT FOUND THEN
        INSERT INTO public.cb_convenio_regras
          (clinica_id, convenio_id, especialidade_id, tipo, modo,
           percentual, percentual_cartao, carencia_mensalidades,
           prioridade, ativo, gratuito)
        VALUES
          (v_clinica, v_conv.id, v_esp.id, 'exame',
           'percentual_desconto', v_percentual, v_percentual, 2,
           10, true, false);
      END IF;
    END LOOP;

    -- Alguns catalogos cadastram Preventivo/Ecocardiograma como procedimento,
    -- sem especialidade propria. A regra especifica garante a cobertura.
    FOR v_proc IN
      SELECT
        p.id,
        upper(public.strip_accents(p.nome)) AS nome_norm,
        upper(public.strip_accents(COALESCE(p.grupo, ''))) AS grupo_norm
      FROM public.procedimentos p
      WHERE p.clinica_id = v_clinica
        AND p.ativo = true
        AND lower(p.tipo::text) = 'exame'
        AND (
          upper(public.strip_accents(p.nome)) LIKE 'PREVENTIVO%'
          OR upper(public.strip_accents(COALESCE(p.grupo, ''))) = 'PREVENTIVO'
          OR upper(public.strip_accents(p.nome)) LIKE 'ECOCARDIOGRAMA%'
          OR upper(public.strip_accents(COALESCE(p.grupo, ''))) = 'ECOCARDIOGRAMA'
        )
    LOOP
      v_percentual := CASE
        WHEN v_proc.nome_norm LIKE 'PREVENTIVO%'
          OR v_proc.grupo_norm = 'PREVENTIVO' THEN 10.00
        ELSE 5.00
      END;

      UPDATE public.cb_convenio_regras
         SET modo = 'percentual_desconto',
             valor = NULL,
             valor_cartao = NULL,
             percentual = v_percentual,
             percentual_cartao = v_percentual,
             carencia_mensalidades = 2,
             prioridade = GREATEST(prioridade, 20),
             ativo = true,
             gratuito = false,
             updated_at = now()
       WHERE convenio_id = v_conv.id
         AND clinica_id = v_clinica
         AND procedimento_id = v_proc.id
         AND tipo = 'exame'
         AND gratuito = false;

      IF NOT FOUND THEN
        INSERT INTO public.cb_convenio_regras
          (clinica_id, convenio_id, procedimento_id, tipo, modo,
           percentual, percentual_cartao, carencia_mensalidades,
           prioridade, ativo, gratuito)
        VALUES
          (v_clinica, v_conv.id, v_proc.id, 'exame',
           'percentual_desconto', v_percentual, v_percentual, 2,
           20, true, false);
      END IF;
    END LOOP;

    -- Corrige tambem qualquer regra de desconto de exame preexistente deste
    -- convenio: nenhum desconto de exame deve valer antes da 2a mensalidade.
    UPDATE public.cb_convenio_regras
       SET carencia_mensalidades = 2,
           updated_at = now()
     WHERE convenio_id = v_conv.id
       AND clinica_id = v_clinica
       AND tipo = 'exame'
       AND gratuito = false;

    -- Beneficios gratuitos apos a 6a mensalidade. Os exames de mama e
    -- prostata compartilham suas respectivas cotas anuais ("OU").
    FOR v_proc IN
      SELECT
        p.id,
        upper(public.strip_accents(p.nome)) AS nome_norm
      FROM public.procedimentos p
      WHERE p.clinica_id = v_clinica
        AND p.ativo = true
        AND lower(p.tipo::text) = 'exame'
        AND (
          upper(public.strip_accents(p.nome)) LIKE 'ACIDO URICO%'
          OR upper(public.strip_accents(p.nome)) LIKE 'HEMOGRAMA COMPLETO%'
          OR upper(public.strip_accents(p.nome)) = 'HEMOGRAMA'
          OR upper(public.strip_accents(p.nome)) LIKE 'GLICOSE%'
          OR upper(public.strip_accents(p.nome)) = 'EAS'
          OR upper(public.strip_accents(p.nome)) LIKE 'EAS %'
          OR upper(public.strip_accents(p.nome)) LIKE 'LIPIDOGRAMA%'
          OR upper(public.strip_accents(p.nome)) LIKE 'PARASITOLOGICO%FEZES%'
          OR upper(public.strip_accents(p.nome)) LIKE 'EPF%'
          OR upper(public.strip_accents(p.nome)) LIKE 'PREVENTIVO%'
          OR upper(public.strip_accents(p.nome)) LIKE 'MAMOGRAFIA%'
          OR upper(public.strip_accents(p.nome)) LIKE 'USG%MAMA%'
          OR upper(public.strip_accents(p.nome)) LIKE 'ULTRASSONOGRAFIA%MAMA%'
          OR upper(public.strip_accents(p.nome)) = 'PSA'
          OR upper(public.strip_accents(p.nome)) LIKE 'PSA %'
          OR upper(public.strip_accents(p.nome)) LIKE 'USG%PROSTATA%'
          OR upper(public.strip_accents(p.nome)) LIKE 'ULTRASSONOGRAFIA%PROSTATA%'
          OR upper(public.strip_accents(p.nome)) LIKE 'DENSITOMETRIA OSSEA%'
          OR upper(public.strip_accents(p.nome)) IN ('ECG', 'ELETROCARDIOGRAMA')
          OR upper(public.strip_accents(p.nome)) LIKE 'ELETROCARDIOGRAMA %'
          OR (
            upper(public.strip_accents(p.nome)) LIKE 'RAIO%X%TORAX%'
            AND (
              upper(public.strip_accents(p.nome)) LIKE '%PA%PERFIL%'
              OR upper(public.strip_accents(p.nome)) LIKE '%PA/PERFIL%'
            )
          )
        )
    LOOP
      v_grupo := CASE
        WHEN v_proc.nome_norm LIKE 'MAMOGRAFIA%'
          OR v_proc.nome_norm LIKE 'USG%MAMA%'
          OR v_proc.nome_norm LIKE 'ULTRASSONOGRAFIA%MAMA%'
          THEN 'anual-mama'
        WHEN v_proc.nome_norm = 'PSA'
          OR v_proc.nome_norm LIKE 'PSA %'
          OR v_proc.nome_norm LIKE 'USG%PROSTATA%'
          OR v_proc.nome_norm LIKE 'ULTRASSONOGRAFIA%PROSTATA%'
          THEN 'anual-prostata'
        ELSE NULL
      END;

      v_limite := CASE
        WHEN v_proc.nome_norm LIKE 'ACIDO URICO%'
          OR v_proc.nome_norm LIKE 'HEMOGRAMA%'
          OR v_proc.nome_norm LIKE 'GLICOSE%'
          OR v_proc.nome_norm = 'EAS'
          OR v_proc.nome_norm LIKE 'EAS %'
          OR v_proc.nome_norm LIKE 'LIPIDOGRAMA%'
          OR v_proc.nome_norm LIKE 'PARASITOLOGICO%FEZES%'
          OR v_proc.nome_norm LIKE 'EPF%'
          THEN NULL
        ELSE 1
      END;
      v_periodo := CASE WHEN v_limite IS NULL THEN NULL ELSE 'ano' END;
      v_excedente := CASE
        WHEN v_limite IS NULL THEN NULL
        ELSE 'regra_padrao_convenio'
      END;

      UPDATE public.cb_convenio_regras
         SET modo = 'valor_fixo',
             valor = 0,
             valor_cartao = 0,
             percentual = NULL,
             percentual_cartao = NULL,
             carencia_mensalidades = 6,
             prioridade = GREATEST(prioridade, 100),
             ativo = true,
             gratuito = true,
             limite_qtd = v_limite,
             limite_periodo = v_periodo,
             limite_escopo = CASE WHEN v_limite IS NULL THEN NULL ELSE 'contrato' END,
             excedente_modo = v_excedente,
             excedente_percentual = NULL,
             excedente_valor = NULL,
             grupo_gratuidade = v_grupo,
             updated_at = now()
       WHERE convenio_id = v_conv.id
         AND clinica_id = v_clinica
         AND procedimento_id = v_proc.id
         AND tipo = 'exame'
         AND gratuito = true;

      IF NOT FOUND THEN
        INSERT INTO public.cb_convenio_regras
          (clinica_id, convenio_id, procedimento_id, tipo, modo,
           valor, valor_cartao, carencia_mensalidades, prioridade,
           ativo, gratuito, limite_qtd, limite_periodo, limite_escopo,
           excedente_modo, grupo_gratuidade)
        VALUES
          (v_clinica, v_conv.id, v_proc.id, 'exame', 'valor_fixo',
           0, 0, 6, 100, true, true, v_limite, v_periodo,
           CASE WHEN v_limite IS NULL THEN NULL ELSE 'contrato' END,
           v_excedente, v_grupo);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Tabela legada `cb_beneficios`: uma migration antiga (20260614020234) gravou
-- R$ 9,99 em dinheiro e R$ 12,00 nos demais meios. O informativo cobra R$ 9,99
-- no ato da consulta, sem variacao por forma de pagamento.
UPDATE public.cb_beneficios b
   SET valor_desconto = 9.99,
       valor_outros = 9.99
  FROM public.cb_convenios c
 WHERE b.convenio_id = c.id
   AND c.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid
   AND upper(public.strip_accents(c.nome)) = 'CARTAO CONSULTA + SEGUROS'
   AND b.tipo_desconto = 'valor_fixo'
   AND b.valor_desconto = 9.99
   AND b.valor_outros IS DISTINCT FROM 9.99;

WITH convs AS (
  SELECT id AS convenio_id, clinica_id
  FROM public.cb_convenios
  WHERE clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid
    AND upper(public.strip_accents(nome)) = 'CARTAO CONSULTA + SEGUROS'
),
svc AS (
  SELECT
    p.id AS procedimento_id,
    p.clinica_id,
    lower(p.tipo::text) AS tipo,
    COALESCE(p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao, 0)::numeric AS base_dinheiro,
    COALESCE(p.valor_pix, p.valor_cartao_credito, p.valor_cartao_debito, p.valor_cartao, p.valor_padrao, p.valor_dinheiro, 0)::numeric AS base_outros,
    pe.especialidade_id AS esp_vinculo,
    eg.id AS esp_grupo
  FROM public.procedimentos p
  LEFT JOIN public.procedimento_especialidades pe
    ON pe.procedimento_id = p.id
   AND pe.clinica_id = p.clinica_id
  LEFT JOIN public.especialidades eg
    ON upper(public.strip_accents(eg.nome)) = upper(public.strip_accents(p.grupo))
  WHERE p.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid
),
matched AS (
  SELECT
    s.procedimento_id,
    s.clinica_id,
    r.convenio_id,
    CASE
      WHEN r.modo = 'valor_fixo' THEN COALESCE(r.valor, 0)
      ELSE round(s.base_dinheiro * (1 - COALESCE(r.percentual, 0) / 100.0), 2)
    END AS valor_dinheiro,
    CASE
      WHEN r.modo = 'valor_fixo' THEN COALESCE(r.valor_cartao, r.valor, 0)
      ELSE round(s.base_outros * (1 - COALESCE(r.percentual_cartao, r.percentual, 0) / 100.0), 2)
    END AS valor_outros,
    row_number() OVER (
      PARTITION BY s.procedimento_id, r.convenio_id
      ORDER BY
        (CASE WHEN r.procedimento_id IS NOT NULL THEN 100 ELSE 0 END)
        + (CASE WHEN r.especialidade_id IS NOT NULL THEN 10 ELSE 0 END)
        + (CASE WHEN r.tipo IS NOT NULL THEN 5 ELSE 0 END)
        + COALESCE(r.prioridade, 0) * 0.01 DESC
    ) AS rn
  FROM svc s
  JOIN convs c
    ON c.clinica_id = s.clinica_id
  JOIN public.cb_convenio_regras r
    ON r.convenio_id = c.convenio_id
   AND r.clinica_id = s.clinica_id
   AND r.ativo = true
   AND r.gratuito = false
   AND (r.procedimento_id IS NULL OR r.procedimento_id = s.procedimento_id)
   AND (r.especialidade_id IS NULL OR r.especialidade_id IN (s.esp_vinculo, s.esp_grupo))
   AND (r.tipo IS NULL OR lower(r.tipo) = s.tipo)
)
INSERT INTO public.procedimento_cb_convenio_valores
  (clinica_id, procedimento_id, convenio_id, valor_dinheiro, valor_outros, origem)
SELECT
  clinica_id,
  procedimento_id,
  convenio_id,
  valor_dinheiro,
  valor_outros,
  'regra'
FROM matched
WHERE rn = 1
ON CONFLICT (procedimento_id, convenio_id) DO UPDATE
   SET valor_dinheiro = EXCLUDED.valor_dinheiro,
       valor_outros = EXCLUDED.valor_outros,
       origem = 'regra',
       updated_at = now()
 WHERE procedimento_cb_convenio_valores.origem = 'regra'
    OR (
      procedimento_cb_convenio_valores.valor_dinheiro IN (8.00, 9.99, 60.00, 80.00)
      AND procedimento_cb_convenio_valores.valor_outros = procedimento_cb_convenio_valores.valor_dinheiro
    );
