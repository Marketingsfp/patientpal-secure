
## Objetivo

1. Adicionar filtro **Situação** (Todos / Ativos / Inativos) na página de Procedimentos.
2. Recadastrar a especialidade **Urologia** nas **3 clínicas** existentes, usando a lista de 32 serviços da planilha `MJ_UROLOGIA.xlsx` como fonte da verdade. Tudo que não estiver na lista vira **Inativo**.
3. Atualizar valores principais (Dinheiro / Pix-Crédito-Débito) e **recalcular** os valores por convênio (Cartão Benefícios) usando as regras já cadastradas.
4. Garantir que cada serviço fique vinculado à especialidade "Urologia" também na tabela de vínculo (`procedimento_especialidades`).

## Lista final de serviços (32) — com correções ortográficas

Tipo: **Procedimento** • Grupo/Especialidade: **Urologia** • Ativo: sim

| # | Serviço | Dinheiro | Pix/Cartão |
|---|---|---:|---:|
| 1 | DRENAGEM DE ABSCESSO | 1.800 | 2.160 |
| 2 | BIOPSIA PENIS / BIOPSIA ESCROTAL | 900 | 1.080 |
| 3 | CISTOSCOPIA COM BIOPSIA (anestesia inclusa) | 2.300 | 2.760 |
| 4 | CISTOSCOPIA (anestesia inclusa) | 2.000 | 2.400 |
| 5 | CAPTURA HIBRIDA DE HPV | 750 | 900 |
| 6 | CATETERISMO VESICAL TROCA DE SONDA | 500 | 600 |
| 7 | CAUTERIZAÇÃO (ATÉ 4 LESÕES) | 800 | 960 |
| 8 | CAUTERIZAÇÃO (MAIS DE 4 LESÕES) | 960 | 1.150 |
| 9 | COLOCAÇÃO DE SONDA | 750 | 900 |
| 10 | ELETROCOAGULAÇÃO DE LESÕES | 900 | 1.080 |
| 11 | ELETROCAUTERIZAÇÃO DE LESÕES = GENITOSCOPIA | 1.000 | 1.200 |
| 12 | EXÉRESE DE CISTO DE BOLSA ESCROTAL | 1.000 | 1.200 |
| 13 | EXÉRESE DE LESÃO E PLÁSTICA DE PÊNIS | 1.450 | 1.740 |
| 14 | EXÉRESE GLÂNDULA DE TYSON | 1.450 | 1.740 |
| 15 | FRENULOPLASTIA | 1.450 | 1.740 |
| 16 | GENITOSCOPIA / PENISCOPIA | 360 | 430 |
| 17 | HIDROCELE BILATERAL | 3.040 | 3.800 |
| 18 | HIDROCELE UNILATERAL | 2.400 | 3.000 |
| 19 | MEATOPLASTIA | 1.000 | 1.200 |
| 20 | MEATOTOMIA URETRAL | 1.700 | 2.040 |
| 21 | PENISCOPIA | 600 | 720 |
| 22 | POSTECTOMIA / FIMOSE (anestesia inclusa) | 3.400 | 4.080 |
| 23 | PLÁSTICA DE FREIO | 1.400 | 1.680 |
| 24 | PUNÇÃO ESCROTAL DE ALÍVIO | 1.200 | 1.440 |
| 25 | RETIRADA DE CATETER DUPLO J (anestesia inclusa) | 2.000 | 2.400 |
| 26 | TROCA DE SONDA (sonda inclusa) | 400 | 480 |
| 27 | TEFI | 450 | 600 |
| 28 | URODINÂMICA | 1.032 | 1.240 |
| 29 | UROFLUXOMETRIA | 480 | 576 |
| 30 | VARICOCELE BILATERAL MICROSCOPIA | 3.040 | 3.800 |
| 31 | OUTROS PROCEDIMENTOS QUE PRECISAREM DE ANESTESIA — ACRESCENTAR | 500 | 500 |
| 32 | VASECTOMIA (anestesia inclusa) | 2.800 | 3.360 |

Obs.: o trigger `procedimentos_uppercase_nome` deixará todos os nomes em CAIXA ALTA e sem acentos automaticamente no banco — então a grafia visual no sistema seguirá esse padrão.

## Passo 1 — UI: filtro de Situação

Arquivo: `src/routes/_authenticated/app.procedimentos.tsx`

- Novo estado `filtroSituacao: "todos" | "ativos" | "inativos"` + `situacaoAplicada` (segue o mesmo padrão dos filtros já existentes — só muda ao clicar em "Pesquisar").
- Novo `<Select>` na barra de filtros, posicionado **antes** do "Limpar" (no espaço em amarelo da imagem):
  - Todos
  - Ativos
  - Inativos
- Atualizar `filtrados` para aplicar `situacaoAplicada`.
- `limparFiltros` reseta `situacaoAplicada` para "ativos" (padrão atual já era ocultar inativos? — não: hoje mostra tudo. Padrão inicial = "Ativos" para preservar comportamento útil, mas com opção de ver inativos).
- `useEffect([..., situacaoAplicada])` reseta `setPagina(1)`.

## Passo 2 — Migração de dados (script único)

Como envolve lógica de cálculo por regra de convênio (`findRegra` / `computeValor` em `src/lib/cb-regras.ts`), faço via script Node executado uma vez com `SUPABASE_SERVICE_ROLE_KEY`:

`scripts/seed-urologia.ts` (one-off, não fica no bundle do app):

Para cada uma das 3 clínicas com Urologia:

1. **Garantir especialidade "Urologia"** em `especialidades` (clínica). Pegar o `especialidade_id`.
2. **Desativar antigos**: `UPDATE procedimentos SET ativo = false WHERE clinica_id = ? AND (grupo ILIKE 'urologia' OR id IN (vínculos com a especialidade Urologia))`.
3. **Upsert dos 32 serviços** (match por `upper(btrim(nome))` dentro da clínica):
   - Campos: `tipo='procedimento'`, `grupo='Urologia'`, `valor_dinheiro = D`, `valor_padrao = D`, `valor_dinheiro_pix = D`, `valor_pix = C`, `valor_cartao = C`, `valor_cartao_credito = C`, `valor_cartao_debito = C`, `valor_cartao_consulta = 0`, `valor_cartao_desconto = 0`, `ativo = true`.
4. **Vínculo em `procedimento_especialidades`**: garantir `(procedimento_id, especialidade_urologia_id, clinica_id)` para cada um dos 32.
5. **Recalcular convênios** para cada um dos 32 × cada `cb_convenios` ativo da clínica:
   - Lê `cb_convenio_regras` ativas dessa clínica.
   - Usa `findRegra(regrasDoConvenio, especialidade_urologia_id, "procedimento")` + `computeValor(regra, D, C)`.
   - `UPSERT` em `procedimento_cb_convenio_valores (procedimento_id, convenio_id, clinica_id, valor_dinheiro, valor_outros)`. Como o usuário pediu **recalcular tudo**, sobrescreve qualquer valor manual existente.
   - Se não há regra (`findRegra` retorna nada), grava `(0, 0)`.

Execução: rodo o script via `code--exec` (após o build mode estar ativo) usando as variáveis de ambiente do projeto.

## Validação após execução

- Conferir contagens por clínica: 32 ativos em Urologia, demais inativos.
- Conferir que os valores principais batem com a planilha.
- Conferir 1–2 amostras de convênios calculados via SQL.
- Conferir que o filtro "Situação" funciona na UI (Ativos / Inativos / Todos).

## Detalhes técnicos

- O trigger de uppercase no banco vai padronizar os nomes — não precisa normalizar antes de gravar.
- Como `procedimentos` tem índice único em `(clinica_id, upper(btrim(nome)))`, o upsert usa esse conflito.
- Para o `procedimento_especialidades`, há índice único equivalente para evitar duplicidade.
- O `CuboBI` já vincula procedimento → especialidade via tabela `procedimentos.grupo`, então não preciso mexer no relatório.

## Fora de escopo

- Não mexer em médicos, agendamentos ou em outras especialidades.
- Não alterar tipo "consulta" ou tabelas de cartões.
