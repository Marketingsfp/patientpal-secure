-- Liga o módulo Hiperdia SOMENTE na clínica Menino Jesus.
--
-- Decisão do responsável pelo projeto (14/08/2026): começar por uma clínica só
-- e observar o uso antes de abrir para as demais. Nenhuma outra clínica é
-- afetada por esta migration.
--
-- A flag nasceu com default OFF (sem linha em `clinica_feature_flags`), então
-- este INSERT é o que torna o card visível na tela do paciente.
--
-- PARA ABRIR ÀS DEMAIS CLÍNICAS DEPOIS (não rodar agora):
--   INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
--   SELECT id, 'hiperdia', true, 'Módulo Hiperdia'
--   FROM public.clinicas
--   ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;
--
-- ROLLBACK (desliga sem perder o histórico da flag):
--   UPDATE public.clinica_feature_flags SET ativo = false WHERE flag_key = 'hiperdia';
--
-- ATENÇÃO: só aplicar DEPOIS de `20260814180000_hiperdia_registros.sql`. Ligar
-- a flag sem a tabela existir faz o card aparecer e falhar ao carregar.

-- Trava de segurança: o nome exato da clínica no banco não pôde ser conferido
-- a partir do repositório (os dumps versionados são só de estrutura). Sem esta
-- checagem, um nome diferente do esperado faria o INSERT abaixo casar com 0
-- linhas — a migration "passaria" sem erro e a flag ficaria desligada, dando a
-- impressão errada de que o módulo foi liberado. Aqui ela falha em voz alta.
DO $$
DECLARE
  qtd integer;
BEGIN
  SELECT count(*) INTO qtd FROM public.clinicas WHERE nome ILIKE '%MENINO JESUS%';
  IF qtd <> 1 THEN
    RAISE EXCEPTION
      'Esperava exatamente 1 clínica com nome contendo "MENINO JESUS", encontrei %. Confira o nome em public.clinicas e ajuste o filtro desta migration.', qtd;
  END IF;
END $$;

INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT id, 'hiperdia', true, 'Módulo Hiperdia: aferições de pressão, glicemia e peso no prontuário do paciente'
FROM public.clinicas
WHERE nome ILIKE '%MENINO JESUS%'
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;
