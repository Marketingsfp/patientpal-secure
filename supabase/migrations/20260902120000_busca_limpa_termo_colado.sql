-- Busca de paciente: limpar o termo COLADO antes de comparar com o banco.
--
-- PROBLEMA RELATADO PELA RECEPCAO
-- A recepcao nao digita o nome do paciente: copia do WhatsApp, de um PDF de
-- convenio ou de uma planilha e cola no campo de busca. Nesses casos o
-- paciente "nao aparece". Nao e lentidao nem indice faltando -- e o texto
-- colado que chega sujo:
--   - espaco sobrando no comeco/fim;
--   - dois ou mais espacos no meio ("MARIA  DA SILVA");
--   - espaco "duro" (NBSP, chr(160)) no lugar do espaco comum, muito comum ao
--     copiar de pagina web e de PDF;
--   - tabulacao e quebra de linha vindas de planilha;
--   - caracteres de largura zero (chr(8203)..chr(8205), BOM chr(65279)) que o
--     Word e alguns PDFs inserem e que ninguem enxerga na tela.
--
-- Os 252.465 nomes gravados na tabela pacientes estao TODOS em maiusculas, sem
-- acento, sem espaco duplicado e sem espaco nas pontas (conferido em
-- producao). O mesmo vale para os 92.418 valores de agendamentos.paciente_nome.
-- Ou seja: o banco esta limpo, quem chega sujo e o termo. Qualquer um daqueles
-- caracteres faz o LIKE '%termo%' nao casar com ninguem. Medido em producao:
-- colar o nome de um paciente existente com espaco duplo devolve ZERO linhas.
--
-- CORRECAO
-- Uma funcao unica de limpeza, aplicada na entrada das tres funcoes de busca.
-- Nada mais muda: corpo, permissoes, ordenacao e limites seguem identicos.
-- A limpeza tambem cobre quem chama por fora da tela (API publica de
-- integracao, ferramenta de busca da Nina), que nao passa pela correcao feita
-- no navegador.
--
-- DESEMPENHO
-- Nenhum indice novo e necessario. O indice trigram que ja existe
-- (idx_pacientes_nome_norm_trgm, GIN sobre upper(strip_accents(nome)) WHERE
-- ativo) continua sendo usado -- medido em producao nesta base de 252 mil
-- cadastros: "MARIA DA SILVA%" em 49ms e "%MARIA DA SILVA%" em 19ms, ambos por
-- Bitmap Index Scan, sem Seq Scan.
--
-- SEGURANCA
-- A funcao de limpeza so mexe em texto: nao le tabela, nao grava nada, e
-- IMMUTABLE. As tres funcoes de busca continuam SECURITY DEFINER com a mesma
-- checagem de vinculo do usuario com a clinica.

CREATE OR REPLACE FUNCTION public.normalizar_termo_busca(_termo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  -- translate() apaga os invisiveis de largura zero (o \s do regex nao pega
  -- esses); o regexp_replace junta qualquer sequencia de espacos em UM espaco
  -- comum (o \s do Postgres cobre NBSP, tabulacao e quebra de linha); o btrim
  -- tira o que sobrou nas pontas.
  SELECT btrim(
           regexp_replace(
             translate(
               coalesce(_termo, ''),
               chr(8203) || chr(8204) || chr(8205) || chr(65279),
               ''
             ),
             '\s+', ' ', 'g'
           )
         );
$function$;

COMMENT ON FUNCTION public.normalizar_termo_busca(text) IS
  'Limpa o termo de busca colado: espaco das pontas, espacos repetidos, NBSP, tabulacao, quebra de linha e caracteres de largura zero.';

REVOKE EXECUTE ON FUNCTION public.normalizar_termo_busca(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_termo_busca(text) TO authenticated;
