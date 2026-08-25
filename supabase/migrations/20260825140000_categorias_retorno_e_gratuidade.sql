-- ---------------------------------------------------------------------------
-- Categorias financeiras "RETORNO DE CONSULTA" e "GRATUIDADE"
--
-- Problema: só existia CORTESIA para registrar um atendimento por R$ 0,00. Como
-- a cortesia é a clínica abrindo mão de um valor devido, ela exige justificativa
-- escrita e autorização de supervisor — e isso caía também sobre dois casos que
-- não são exceção nenhuma: o retorno médico e a cobertura do plano do paciente.
-- Na prática, toda rotina virava exceção de diretoria e parava a fila.
--
-- Esta migração cria as duas categorias que faltavam. As três terminam iguais no
-- caixa (total R$ 0,00, forma "Convênio / Gratuidade", nada a conferir na
-- gaveta), mas se comportam de forma diferente no aplicativo:
--
--   RETORNO DE CONSULTA  paciente R$ 0,00 | clínica e prestador R$ 0,00
--                        sem justificativa e sem supervisor
--                        (o médico já recebeu o repasse na consulta de origem)
--
--   CORTESIA             paciente R$ 0,00 | clínica e prestador R$ 0,00
--                        EXIGE justificativa e autorização de supervisor
--
--   GRATUIDADE           paciente R$ 0,00 | prestador recebe o REPASSE NORMAL,
--                        calculado sobre o valor de tabela do procedimento
--                        sem justificativa e sem supervisor
--                        (quem remunera é a mensalidade do cartão do paciente)
--
-- Quem separa os três é o nome da categoria, lido em
-- src/lib/financeiro/formas-pagamento.ts (`classificarLiberacao`).
--
-- É segura de rodar mais de uma vez: só insere onde ainda não existe, e não
-- altera nenhum lançamento já gravado.
-- ---------------------------------------------------------------------------

-- 1) Cria as categorias de RECEITA em toda clínica que ainda não as tem. O
--    teste é por palavra ("retorno", "gratuidade") para não duplicar uma
--    categoria equivalente que a clínica já tenha cadastrado com outro nome.
INSERT INTO public.fin_categorias (clinica_id, nome, cor, tipo)
SELECT c.id, s.nome, s.cor, 'receita'::public.fin_tipo_lancamento
FROM public.clinicas c
CROSS JOIN (VALUES
  ('RETORNO DE CONSULTA', '#10B981', '%retorno%'),
  ('GRATUIDADE',          '#0EA5E9', '%gratuidade%')
) AS s(nome, cor, padrao)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.fin_categorias x
  WHERE x.clinica_id = c.id
    AND x.tipo = 'receita'::public.fin_tipo_lancamento
    AND x.nome ILIKE s.padrao
);

-- 2) Se alguma delas já existia mas estava desativada, reativa — senão ela não
--    aparece na lista do diálogo de cobrança e o passo 1 não a recria.
UPDATE public.fin_categorias
SET ativo = true
WHERE tipo = 'receita'::public.fin_tipo_lancamento
  AND (nome ILIKE '%retorno%' OR nome ILIKE '%gratuidade%')
  AND ativo = false;

-- 3) Conferência: as categorias de liberação de cada clínica.
SELECT c.nome AS clinica, f.nome AS categoria, f.ativo
FROM public.clinicas c
JOIN public.fin_categorias f
  ON f.clinica_id = c.id
 AND f.tipo = 'receita'::public.fin_tipo_lancamento
 AND (f.nome ILIKE '%retorno%' OR f.nome ILIKE '%gratuidade%' OR f.nome ILIKE '%cortesia%')
ORDER BY c.nome, f.nome;
