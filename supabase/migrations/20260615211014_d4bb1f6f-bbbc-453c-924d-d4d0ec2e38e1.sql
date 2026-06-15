DROP TABLE IF EXISTS public._mj_dedup;
CREATE UNLOGGED TABLE public._mj_dedup AS
SELECT DISTINCT ON (chave)
  chave,
  codigo_pessoa,
  UPPER(BTRIM(nome)) AS nome_u,
  REGEXP_REPLACE(COALESCE(cpf_cnpj,''),'[^0-9]','','g') AS cpf_digits,
  nome, cpf_cnpj, sexo, email, ddd_1, fone_1, ddd_2, fone_2,
  nascimento_abertura, endereco, numero, complemento, bairro, cidade, uf, cep
FROM public._mj_import_csv
WHERE chave IS NOT NULL AND chave <> '' AND chave <> '0' AND pessoa_cliente='S'
ORDER BY chave, (pessoa_usuario='S') DESC, (ativo='S') DESC, codigo_pessoa::bigint DESC;
CREATE INDEX ON public._mj_dedup (cpf_digits);
CREATE INDEX ON public._mj_dedup (nome_u);
CREATE INDEX ON public._mj_dedup (chave);
GRANT ALL ON public._mj_dedup TO service_role;
ALTER TABLE public._mj_dedup ENABLE ROW LEVEL SECURITY;