-- Pacientes duplicados: detectar o nome cortado pela importação
-- ============================================================================
--
-- PROBLEMA
-- A importação do sistema antigo cortava o nome do paciente em 25 caracteres.
-- Quem já tinha cadastro na clínica ganhou um segundo cadastro, com o nome
-- truncado, SEM CPF, sem nascimento e sem telefone. São 122 pessoas só entre as
-- que têm Cartão Benefícios, e 85 delas ficaram com DOIS contratos ativos ao
-- mesmo tempo.
--
-- A tela de Pacientes Duplicados não conseguia mostrar esses casos. As quatro
-- regras dela exigem, cada uma, ou o mesmo CPF ou o mesmo nome:
--
--   cpf       -> mesmo CPF          (o cadastro cortado não tem CPF)
--   nome_dn   -> mesmo nome + nascimento  (não tem nascimento, e o nome difere)
--   telefone  -> mesmo telefone + nome    (não tem telefone, e o nome difere)
--   nome      -> nome exatamente igual    (o nome está cortado, então difere)
--
-- Resultado: 115 dos 122 cadastros cortados não têm CPF, nascimento NEM
-- telefone. Nenhuma regra casava, e eles ficavam invisíveis.
--
-- REGRA NOVA: "nome_truncado"
-- Forma um PAR quando o nome de um cadastro sem CPF e sem telefone é o começo
-- EXATO do nome de outro, com pelo menos 20 caracteres:
--
--   "ZULEIDE AMARO DE SANTANA"  +  "ZULEIDE AMARO DE SANTANA FERNANDES"
--
-- Os 20 caracteres e a exigência de espaço no nome evitam juntar gente
-- diferente por coincidência de primeiro nome. A comparação usa
-- `left(nome, tamanho_do_curto) = nome_curto` em vez de LIKE, para não
-- tropeçar em `%` ou `_` dentro do nome.
--
-- Pares, e não grupos: agrupar pelos 20 primeiros caracteres juntava pessoas
-- diferentes que só compartilham o começo do nome — numa tentativa anterior,
-- oito "ALINE OLIVEIRA DA SILVA" distintas caíram no mesmo grupo.
--
-- Isto é uma LISTA DE CANDIDATOS, não uma conclusão. A tela nunca mescla
-- sozinha: o operador marca quais cadastros são a mesma pessoa (mínimo dois),
-- confirma as diferenças e só então chama `merge_pacientes`. Por isso um par
-- errado custa uma conferência, não perda de dado. Casos legítimos de pai e
-- filho ("NOME" e "NOME FILHO") vão aparecer aqui e devem ser recusados.
--
-- Como nas outras regras, o par não aparece duas vezes: se os mesmos
-- cadastros já saem por CPF, telefone, nome+nascimento ou nome igual, a regra
-- nova se cala.
--
-- Só troca a view de leitura. Nenhum dado de paciente é alterado, e a
-- mesclagem continua sendo a rotina segura de sempre (`merge_pacientes`, que
-- move `paciente_id` em todas as tabelas, contratos e dependentes inclusive).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_pacientes_duplicados_suspeitos AS
 WITH base AS (
         SELECT p.id,
            p.clinica_id,
            p.nome,
            p.data_nascimento,
            p.created_at,
            regexp_replace(COALESCE(p.cpf, ''::text), '\D'::text, ''::text, 'g'::text) AS cpf_num,
            regexp_replace(COALESCE(p.telefone, ''::text), '\D'::text, ''::text, 'g'::text) AS tel_num,
            upper(strip_accents(btrim(regexp_replace(COALESCE(p.nome, ''::text), '\s+'::text, ' '::text, 'g'::text)))) AS nome_key
           FROM pacientes p
          WHERE p.ativo
        ), base_tel AS (
         SELECT b.id,
            b.clinica_id,
            b.nome,
            b.data_nascimento,
            b.created_at,
            b.cpf_num,
            b.tel_num,
            b.nome_key
           FROM base b
          WHERE length(b.tel_num) >= 10 AND length(b.tel_num) <= 11 AND b.tel_num !~ '^(\d)\1+$'::text AND b.tel_num !~ '^0'::text AND substr(b.tel_num, 3) !~ '^(\d)\1+$'::text AND (b.tel_num <> ALL (ARRAY['00000000000'::text, '000000000'::text, '11111111111'::text, '99999999999'::text, '12345678901'::text, '21000000000'::text]))
        ), por_cpf AS (
         SELECT b.clinica_id,
            'cpf'::text AS tipo,
            b.cpf_num AS chave,
            array_agg(b.id ORDER BY b.created_at) AS ids,
            count(*) AS qtd
           FROM base b
          WHERE length(b.cpf_num) = 11 AND b.cpf_num !~ '^(\d)\1{10}$'::text
          GROUP BY b.clinica_id, b.cpf_num
         HAVING count(*) > 1
        ), por_nome_dn AS (
         SELECT b.clinica_id,
            'nome_dn'::text AS tipo,
            (b.nome_key || '|'::text) || b.data_nascimento::text AS chave,
            array_agg(b.id ORDER BY b.created_at) AS ids,
            count(*) AS qtd
           FROM base b
          WHERE b.data_nascimento IS NOT NULL
          GROUP BY b.clinica_id, b.nome_key, b.data_nascimento
         HAVING count(*) > 1
        ), tel_nome AS (
         SELECT b.clinica_id,
            b.tel_num AS chave,
            array_agg(b.id ORDER BY b.created_at) AS ids,
            count(*) AS qtd
           FROM base_tel b
          GROUP BY b.clinica_id, b.tel_num, b.nome_key
         HAVING count(*) > 1
        ), tel_dn AS (
         SELECT b.clinica_id,
            b.tel_num AS chave,
            array_agg(b.id ORDER BY b.created_at) AS ids,
            count(*) AS qtd
           FROM base_tel b
          WHERE b.data_nascimento IS NOT NULL
          GROUP BY b.clinica_id, b.tel_num, b.data_nascimento
         HAVING count(*) > 1
        ), por_tel AS (
         SELECT DISTINCT u.clinica_id,
            'telefone'::text AS tipo,
            u.chave,
            u.ids,
            u.qtd
           FROM ( SELECT tel_nome.clinica_id, tel_nome.chave, tel_nome.ids, tel_nome.qtd
                   FROM tel_nome
                UNION ALL
                 SELECT tel_dn.clinica_id, tel_dn.chave, tel_dn.ids, tel_dn.qtd
                   FROM tel_dn) u
        ), por_nome AS (
         SELECT b.clinica_id,
            'nome'::text AS tipo,
            b.nome_key AS chave,
            array_agg(b.id ORDER BY b.created_at) AS ids,
            count(*) AS qtd
           FROM base b
          WHERE length(b.nome_key) >= 6 AND b.nome_key ~~ '% %'::text
          GROUP BY b.clinica_id, b.nome_key
         HAVING count(*) > 1 AND bool_or(b.cpf_num = ''::text OR b.tel_num = ''::text)
        ),
        -- ------------------------------------------------------------------
        -- NOVO: nome cortado pela importação.
        --
        -- Emite PARES, não grupos por prefixo. A primeira versão agrupava pelos
        -- 20 primeiros caracteres e juntava gente diferente que só compartilha
        -- o começo do nome (um grupo chegou a ter 8 "ALINE OLIVEIRA DA SILVA"
        -- distintas). Aqui cada linha é um par: o cadastro fantasma da
        -- importação e o cadastro completo de quem ele é o começo exato.
        --
        -- `g` é o fantasma: sem CPF E sem telefone. `f` é o cadastro cujo nome
        -- começa exatamente com o nome de `g` e é mais longo. O
        -- `left(...,20) = left(...,20)` não é a regra, é só o que permite ao
        -- Postgres casar as duas pontas por igualdade em vez de comparar todos
        -- contra todos.
        --
        -- `DISTINCT ON (g.id)` com `ORDER BY length(f.nome_key)`: quando o
        -- fantasma é começo de mais de um cadastro, fica com o mais curto — o
        -- parente mais próximo do nome cortado.
        -- ------------------------------------------------------------------
        por_nome_truncado AS (
         SELECT DISTINCT ON (g.id)
            g.clinica_id,
            'nome_truncado'::text AS tipo,
            g.nome_key AS chave,
            ARRAY[g.id, f.id] AS ids,
            2::bigint AS qtd
           FROM base g
           JOIN base f
             ON f.clinica_id = g.clinica_id
            AND left(f.nome_key, 20) = left(g.nome_key, 20)
            AND length(f.nome_key) > length(g.nome_key)
            AND left(f.nome_key, length(g.nome_key)) = g.nome_key
          WHERE g.cpf_num = ''::text AND g.tel_num = ''::text
            AND length(g.nome_key) >= 20 AND g.nome_key ~~ '% %'::text
          ORDER BY g.id, length(f.nome_key), f.created_at
        ), ja_listados AS (
         SELECT por_cpf.clinica_id, por_cpf.ids FROM por_cpf
        UNION ALL
         SELECT por_tel.clinica_id, por_tel.ids FROM por_tel
        UNION ALL
         SELECT por_nome_dn.clinica_id, por_nome_dn.ids FROM por_nome_dn
        ), ja_listados_com_nome AS (
         SELECT ja_listados.clinica_id, ja_listados.ids FROM ja_listados
        UNION ALL
         SELECT por_nome.clinica_id, por_nome.ids FROM por_nome
        )
 SELECT por_cpf.clinica_id, por_cpf.tipo, por_cpf.chave, por_cpf.ids, por_cpf.qtd
   FROM por_cpf
UNION ALL
 SELECT por_tel.clinica_id, por_tel.tipo, por_tel.chave, por_tel.ids, por_tel.qtd
   FROM por_tel
UNION ALL
 SELECT por_nome_dn.clinica_id, por_nome_dn.tipo, por_nome_dn.chave, por_nome_dn.ids, por_nome_dn.qtd
   FROM por_nome_dn
UNION ALL
 SELECT n.clinica_id, n.tipo, n.chave, n.ids, n.qtd
   FROM por_nome n
  WHERE NOT (EXISTS ( SELECT 1
           FROM ja_listados j
          WHERE j.clinica_id = n.clinica_id AND j.ids @> n.ids AND j.ids <@ n.ids))
UNION ALL
 SELECT t.clinica_id, t.tipo, t.chave, t.ids, t.qtd
   FROM por_nome_truncado t
  WHERE NOT (EXISTS ( SELECT 1
           FROM ja_listados_com_nome j
          WHERE j.clinica_id = t.clinica_id AND j.ids @> t.ids AND j.ids <@ t.ids));

COMMENT ON VIEW public.v_pacientes_duplicados_suspeitos IS
  'Grupos de cadastros de paciente possivelmente repetidos. Tipos: cpf, '
  'telefone, nome_dn, nome e nome_truncado (nome cortado em ~25 letras pela '
  'importação do sistema antigo, com o cadastro curto sem CPF ou sem telefone).';
