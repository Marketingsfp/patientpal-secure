# FASE 2 — Auditoria do catálogo e do ambiente consultado pela Nina

Execução investigada (mesma da Fase 1): execution_id `4a371384-f9ad-46c2-b5eb-49d96120e487`,
conversa `d2adc481-8d98-4c89-a161-b9dee204818d`, mensagem `33e46c67-5328-472f-b024-9ad38f803499`,
Lead Teste 02 / sessão 19, trace `2089e6b9-ee80-4e2a-a9b5-4479aaf21cff`.
Somente leitura — nada foi alterado.

## 1. Estado real do catálogo estruturado (backend)

Exames e procedimentos (`nina_cat_servicos`): PUBLICADO 0 · RASCUNHO 207 · ARQUIVADO 1
Consultas e profissionais (`nina_cat_profissionais`): PUBLICADO 0 · RASCUNHO 37 · ARQUIVADO 1

## 2. Busca por ultrassonografia

No catálogo estruturado: ~20+ registros ("ULTRASSONOGRAFIA", "USG ABDOMINAL TOTAL"
`a27d2b57-d9fe-461a-8832-cfd661b209bc`, "USG ABDOME SUPERIOR" `07659dbd-…`, "USG MAMA COM DOPPLER"
`d7fec7f7-…` etc.), **todos com status RASCUNHO, `publicado_em` nulo e `valor` NULL**.
Ou seja: zero registros publicados e zero valores no catálogo.

Na tabela operacional legada `procedimentos` (4.522 ativos, 84 com USG/ultrassom) os valores
existem e coincidem exatamente com a resposta da Nina:
- USG ABDOMINAL TOTAL / ABDOME SUPERIOR — pix 110,00 · cartão 130,00
- USG MORFOLOGICA — pix 203,00 · cartão 240,00
- USG DOPPLER CAROTIDAS E VERTEBRAIS — pix 190,00 · cartão 230,00

## 3. A execução investigada

Catálogo estruturado consultado: SIM (tool `consultar_base_conhecimento`) → **catalog_result = empty**
(filtro `status = 'PUBLICADO'` + `clinica_id`; 0 registros possíveis, pois não há publicados).
Tabela legada consultada: SIM — `buscar_procedimentos` (2 chamadas), em
`src/lib/nina/paciente-tools.server.ts`: `procedimentos` filtrado por `clinica_id`, `ativo = true`,
`nome ilike %termo%`, limite 12, colunas `nome, grupo, valor_dinheiro_pix, valor_cartao,
valor_padrao, preparo`. `route_reason = conflicting_results` — coerente com um caminho vazio e
outro cheio.

Os IDs exatos retornados pelas tools não estão gravados (a auditoria não persiste o payload das
tools), então a lista de IDs não pode ser afirmada — só o filtro e a fonte.

## 4. Ambiente

Único projeto Cloud (ref `odllhxwadsrnhphzoevl`), schema `public`, mesmo banco de produção.
A Homologação **não** possui projeto, schema ou banco separado: o isolamento é lógico
(`is_test`, `environment = homologation`, telefones virtuais 5500xxxxxxxxx, leads/ciclos próprios).
Não há Edge Functions no fluxo — as tools rodam em server functions com `supabaseAdmin`
(service role, RLS não aplicada). Provider do modelo: Lovable AI Gateway, `google/gemini-3.7-flash`.
Portanto as tools consultam **os mesmos dados de produção**, não um catálogo de homologação.

## 5. Publicação indevida

Nenhum registro RASCUNHO ou ARQUIVADO do catálogo estruturado vazou: o filtro `PUBLICADO`
está correto em `catalogo-retrieval.server.ts` e em `catalogo-prompt.server.ts`.
O vazamento é de outra origem: a ferramenta `buscar_procedimentos` lê diretamente a tabela
operacional `procedimentos`, que não passa por publicação nenhuma.

## 6. Gate de saída

- Catálogo realmente vazio? **SIM** (0 publicados; 207 + 37 em rascunho).
- Registros de ultrassonografia encontrados: no catálogo, sim, mas todos em RASCUNHO e sem valor; na tabela legada `procedimentos`, 84 ativos com valores.
- Catálogo consultado naquela execução? **SIM, com resultado vazio (catalog_result = empty)**.
- Ambiente realmente consultado: projeto/banco único de produção, schema `public`, via service role — a resposta veio de `procedimentos` (dado operacional real), não do catálogo publicado.
