CREATE TABLE public.prontuario_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  especialidade_id uuid,
  nome text NOT NULL,
  secoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_ia text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prontuario_modelos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_select ON public.prontuario_modelos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pm_insert ON public.prontuario_modelos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY pm_update ON public.prontuario_modelos FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pm_delete ON public.prontuario_modelos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER pm_touch BEFORE UPDATE ON public.prontuario_modelos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_pm_clinica ON public.prontuario_modelos(clinica_id, ativo);

-- Seed function: cria modelos padrão para todas as clínicas que ainda não têm
CREATE OR REPLACE FUNCTION public.seed_prontuario_modelos_padrao(_clinica_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _modelos jsonb := '[
    {
      "nome": "Clínica Geral",
      "prompt_ia": "Você é um clínico geral. Use linguagem médica formal em português do Brasil.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa principal","placeholder":"Motivo da consulta"},
        {"chave":"historia_doenca","titulo":"História da doença atual","placeholder":"Início, evolução, fatores associados"},
        {"chave":"exame_fisico","titulo":"Exame físico","placeholder":"PA, FC, FR, T, ausculta, palpação"},
        {"chave":"hipotese_diagnostica","titulo":"Hipótese diagnóstica","placeholder":"CID + descrição"},
        {"chave":"conduta","titulo":"Conduta","placeholder":"Exames solicitados, orientações, retorno"},
        {"chave":"prescricao","titulo":"Prescrição","placeholder":"Medicação, posologia, duração"}
      ]
    },
    {
      "nome": "Pediatria",
      "prompt_ia": "Você é pediatra. Documente peso, altura, percentis, marcos de desenvolvimento e calendário vacinal.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa principal","placeholder":"Relato do responsável"},
        {"chave":"historia_doenca","titulo":"HDA + antecedentes","placeholder":"Gestação, parto, aleitamento, vacinação"},
        {"chave":"exame_fisico","titulo":"Exame físico (Peso/Altura/PC/Percentil)","placeholder":"P: __kg A: __cm PC: __cm Percentil P/I, A/I, IMC"},
        {"chave":"hipotese_diagnostica","titulo":"Hipótese diagnóstica","placeholder":"CID"},
        {"chave":"conduta","titulo":"Conduta e orientações","placeholder":"Vacinas, alimentação, retorno"},
        {"chave":"prescricao","titulo":"Prescrição","placeholder":"Dose em mg/kg quando aplicável"}
      ]
    },
    {
      "nome": "Ginecologia e Obstetrícia",
      "prompt_ia": "Você é ginecologista/obstetra. Documente DUM, ciclo, paridade (GPA), método contraceptivo, idade gestacional quando aplicável.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa principal","placeholder":""},
        {"chave":"historia_doenca","titulo":"História ginecológica/obstétrica","placeholder":"DUM, ciclo, GPA, método anticoncepcional, última citologia"},
        {"chave":"exame_fisico","titulo":"Exame físico (incluir exame ginecológico)","placeholder":"Mamas, abdome, especular, toque"},
        {"chave":"hipotese_diagnostica","titulo":"Hipótese diagnóstica","placeholder":""},
        {"chave":"conduta","titulo":"Conduta","placeholder":"Solicitação de USG, papanicolau, mamografia, sorologias"},
        {"chave":"prescricao","titulo":"Prescrição","placeholder":""}
      ]
    },
    {
      "nome": "Cardiologia",
      "prompt_ia": "Você é cardiologista. Foque em sintomas cardiovasculares, fatores de risco (HAS, DM, DLP, tabagismo), e dados de PA, FC, ausculta, ECG.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa principal","placeholder":"Dor torácica, dispneia, palpitação, edema"},
        {"chave":"historia_doenca","titulo":"HDA + fatores de risco CV","placeholder":"HAS, DM, DLP, tabagismo, IAM prévio, AVC prévio, histórico familiar"},
        {"chave":"exame_fisico","titulo":"Exame cardiovascular","placeholder":"PA: __/__ mmHg FC: __ bpm Ausculta: BNF/B3/B4/sopros Pulsos: Edema:"},
        {"chave":"hipotese_diagnostica","titulo":"Hipótese diagnóstica","placeholder":""},
        {"chave":"conduta","titulo":"Conduta","placeholder":"ECG, Eco, teste ergométrico, Holter, exames laboratoriais"},
        {"chave":"prescricao","titulo":"Prescrição","placeholder":""}
      ]
    },
    {
      "nome": "Ortopedia",
      "prompt_ia": "Você é ortopedista. Documente mecanismo do trauma, localização, amplitude de movimento, testes ortopédicos específicos.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa principal","placeholder":"Local e tipo da dor"},
        {"chave":"historia_doenca","titulo":"HDA + mecanismo do trauma","placeholder":""},
        {"chave":"exame_fisico","titulo":"Exame ortopédico","placeholder":"Inspeção, palpação, ADM, testes especiais, neurológico"},
        {"chave":"hipotese_diagnostica","titulo":"Hipótese diagnóstica","placeholder":""},
        {"chave":"conduta","titulo":"Conduta","placeholder":"RX, RM, TC, imobilização, fisioterapia, cirurgia"},
        {"chave":"prescricao","titulo":"Prescrição","placeholder":""}
      ]
    },
    {
      "nome": "Dermatologia",
      "prompt_ia": "Você é dermatologista. Descreva lesões com termos dermatológicos precisos (mácula, pápula, vesícula, etc.), tamanho, distribuição e tempo de evolução.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa principal","placeholder":"Lesão, prurido, alopecia"},
        {"chave":"historia_doenca","titulo":"HDA","placeholder":"Tempo de evolução, exposição solar, contatantes"},
        {"chave":"exame_fisico","titulo":"Exame dermatológico","placeholder":"Tipo de lesão, número, distribuição, dermatoscopia"},
        {"chave":"hipotese_diagnostica","titulo":"Hipótese diagnóstica","placeholder":""},
        {"chave":"conduta","titulo":"Conduta","placeholder":"Biópsia, fototerapia, retorno"},
        {"chave":"prescricao","titulo":"Prescrição","placeholder":""}
      ]
    },
    {
      "nome": "Psicologia",
      "prompt_ia": "Você é psicólogo. Use linguagem clínica respeitando sigilo. Documente queixa, estado mental, hipóteses e plano terapêutico — sem prescrição medicamentosa.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa / demanda","placeholder":""},
        {"chave":"historia_doenca","titulo":"História atual e pregressa","placeholder":"Histórico familiar, escolar, profissional, social"},
        {"chave":"exame_fisico","titulo":"Exame do estado mental","placeholder":"Apresentação, humor, afeto, pensamento, sensopercepção, cognição, juízo"},
        {"chave":"hipotese_diagnostica","titulo":"Impressão diagnóstica (CID/DSM)","placeholder":""},
        {"chave":"conduta","titulo":"Plano terapêutico","placeholder":"Abordagem, frequência, objetivos, encaminhamentos"},
        {"chave":"prescricao","titulo":"Recomendações","placeholder":"Tarefas, leituras, recursos"}
      ]
    },
    {
      "nome": "Nutrição",
      "prompt_ia": "Você é nutricionista. Documente antropometria, recordatório 24h, hábitos alimentares e plano alimentar — não prescreva medicamentos.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Objetivo / queixa","placeholder":""},
        {"chave":"historia_doenca","titulo":"Hábitos e antecedentes","placeholder":"Recordatório 24h, restrições, intolerâncias, exercício"},
        {"chave":"exame_fisico","titulo":"Antropometria","placeholder":"Peso: __kg Altura: __m IMC: __ CA: __cm % gordura: __ MM:"},
        {"chave":"hipotese_diagnostica","titulo":"Diagnóstico nutricional","placeholder":""},
        {"chave":"conduta","titulo":"Plano alimentar","placeholder":"Calorias, macros, distribuição das refeições"},
        {"chave":"prescricao","titulo":"Suplementação / orientações","placeholder":""}
      ]
    },
    {
      "nome": "Odontologia",
      "prompt_ia": "Você é cirurgião-dentista. Documente queixa, odontograma, exame intra/extra-oral, plano de tratamento por dente.",
      "secoes": [
        {"chave":"queixa_principal","titulo":"Queixa principal","placeholder":"Dente, dor, estética"},
        {"chave":"historia_doenca","titulo":"História clínica","placeholder":"Higiene, escovação, fio dental, alergias, medicações"},
        {"chave":"exame_fisico","titulo":"Exame clínico (odontograma)","placeholder":"Dentes envolvidos, oclusão, gengiva, mucosa"},
        {"chave":"hipotese_diagnostica","titulo":"Diagnóstico","placeholder":""},
        {"chave":"conduta","titulo":"Plano de tratamento","placeholder":"Restaurações, endodontia, exodontia, prótese, ortodontia"},
        {"chave":"prescricao","titulo":"Prescrição","placeholder":"Analgésico, antibiótico, anti-inflamatório"}
      ]
    }
  ]'::jsonb;
  _m jsonb;
BEGIN
  IF NOT is_member(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso à clínica';
  END IF;
  FOR _m IN SELECT * FROM jsonb_array_elements(_modelos) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.prontuario_modelos WHERE clinica_id = _clinica_id AND nome = _m->>'nome') THEN
      INSERT INTO public.prontuario_modelos (clinica_id, nome, secoes, prompt_ia)
      VALUES (_clinica_id, _m->>'nome', _m->'secoes', _m->>'prompt_ia');
    END IF;
  END LOOP;
END;$$;