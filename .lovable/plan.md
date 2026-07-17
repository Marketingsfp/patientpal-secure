## Objetivo

Em `/app/odontologia`, criar duas abas — **Prontuário** (a tela atual) e **Orçamento** — para gerar orçamentos exclusivamente de procedimentos da especialidade **Odontologia** e vincular cada item do orçamento a um ou mais dentes do odontograma daquele paciente. O odontograma passa a exibir visualmente os dentes com item orçado (aberto) e os que já viraram atendimento.

Sem alterar: menu Orçamentos, tabela `orcamentos`, regras de conversão/impressão/histórico/RLS, permissões, agenda, financeiro.

## Escopo

**Dentro:**
1. Duas abas na página `/app/odontologia`: `Prontuário` (conteúdo atual) e `Orçamento`.
2. Na aba Orçamento: lista apenas os orçamentos **odontológicos do paciente selecionado** + botão “Novo orçamento odontológico”.
3. Novo diálogo de criação com busca de procedimento restrita à especialidade **ODONTOLOGIA** (via `procedimento_especialidades`), sem o passo “Laboratório vs Demais Serviços” (categoria fixa = `demais`, com marca `odontologia` — ver Técnico).
4. Cada item do orçamento passa a ter uma lista de dentes vinculados (0..N). O selecionador de dentes reutiliza o componente `Odontograma`.
5. Odontograma na aba Prontuário: além do estado clínico atual, mostra badge/cor discreta nos dentes com item de orçamento **aberto**. Ao clicar no dente, aparece no card lateral a lista dos itens orçados naquele dente (com nº do orçamento, procedimento, valor, status) além do formulário já existente.
6. Ações do item já herdadas: imprimir, converter em atendimento, histórico, cancelar — via o mesmo `OrcamentoDrawer` / `ConversaoOrcamentoDialog`.

**Fora (não mexe):**
- Menu global `/app/orcamentos` e seu diálogo de criação.
- Regras de conversão, splits, impressão, auditoria e RLS existentes.
- Módulo Triagem — Enfermagem, alertas, permissões.

## Passos

1. **Migration** (uma só, revisada pelo usuário):
   - `ALTER TABLE public.orcamento_itens ADD COLUMN dentes smallint[] NULL;` — array com números FDI (11–48, 51–85). Nullable e default null: itens não-odonto ficam inalterados.
   - Constraint leve: `CHECK (dentes IS NULL OR array_length(dentes,1) BETWEEN 1 AND 32)`.
   - `ALTER TABLE public.orcamentos ADD COLUMN especialidade_id uuid NULL REFERENCES public.especialidades(id);` — marca o orçamento como “de Odontologia” (permite filtrar sem depender de heurística textual). Índice parcial: `CREATE INDEX ON orcamentos (clinica_id, paciente_id) WHERE especialidade_id IS NOT NULL;`.
   - Sem novas policies (as existentes de `orcamentos` / `orcamento_itens` já cobrem por clínica).

2. **Componentes novos** em `src/components/odontologia/`:
   - `odonto-tabs.tsx` — envoltório com `Tabs` (Prontuário | Orçamento). Recebe `pacienteId`.
   - `orcamento-tab.tsx` — busca `orcamentos` do paciente com `especialidade_id = <ODONTO>`, lista compacta reutilizando `OrcamentoCard` (v2) + botão Novo.
   - `novo-orcamento-odonto-dialog.tsx` — versão enxuta de `NovoOrcamentoDialog` extraída de `app.orcamentos.tsx`:
     - paciente já vem fixo (o da aba); campos paciente/telefone somente leitura.
     - sem escolha de categoria (laboratorio/demais); grava `categoria='demais'` e `especialidade_id = <ODONTO>`.
     - a busca de `procedimentos` faz `INNER JOIN procedimento_especialidades pe ON pe.procedimento_id = procedimentos.id AND pe.especialidade_id = <ODONTO>` (via `select` com filtro correspondente do PostgREST) — hoje há 180 procedimentos vinculados.
     - novo campo por item: **Dentes** (input que abre um mini-odontograma; clicar em dentes adiciona/remove). Persiste em `orcamento_itens.dentes`.
   - `odontograma-badges.tsx` — mesmo `Odontograma` atual acrescido de um mapa `Record<number, "orcado" | undefined>` para desenhar um pontinho/anel diferente nos dentes com item orçado aberto.

3. **Refactor mínimo** em `src/routes/_authenticated/app.odontologia.tsx`:
   - Envolve o conteúdo atual em `<Tabs>` com abas Prontuário/Orçamento.
   - Continua carregando dentes/prontuário na aba Prontuário; a aba Orçamento monta o componente novo.
   - No card do dente selecionado (aba Prontuário): abaixo do form de status, lista dos itens de orçamento aberto vinculados àquele dente.

4. **Sem tocar** em `app.orcamentos.tsx` ou nos componentes v2 — apenas reutilizamos `OrcamentoCard`, `OrcamentoDrawer`, `ConversaoOrcamentoDialog` importando-os.

5. **Permissões**: aba Orçamento usa a mesma checagem `podeEscrever("odontologia")` já em uso; leitura livre para quem enxerga a página. Como o dado grava em `orcamentos`/`orcamento_itens`, as políticas por clínica dessas tabelas continuam valendo.

## Detalhes técnicos (para revisão do dev)

- ID da especialidade: `f0cfaa0a-2a67-4176-97de-a7072c37077c` (nome `ODONTOLOGIA`). Sem hardcode: buscar por `nome ilike 'odontologia'` no carregamento inicial e guardar em estado; cai para “sem procedimentos” se não existir na clínica.
- Filtro de procedimentos: reproduzir a estrutura do `NovoOrcamentoDialog` atual, trocando a cláusula de categoria por um `.in("id", ids)` onde `ids` vem de `procedimento_especialidades.select('procedimento_id').eq('especialidade_id', ODONTO_ID)` da mesma clínica. Cache local no dialog.
- Vínculo dente↔item: gravado em `orcamento_itens.dentes` (smallint[]) — evita nova tabela de junção e simplifica leitura. Ao consultar “o que está orçado no dente X”, um único `select` com `.contains('dentes', [X])` resolve.
- Marcação visual “orçado” no odontograma: consulta `orcamento_itens` do paciente cujo `orcamento.status = 'aberto'` (via join implícito ou 2 queries com `.in`). Item convertido/executado/cancelado sai da marcação automaticamente (deriva de `status_operacional`/`status`).
- Odontograma clicável no dialog: mesmo componente da página, mas com `multi` para permitir selecionar N dentes por item (reutilizando a UX visual atual).
- SSR: página fica sob `_authenticated`, sem loader adicional; leituras ficam client-side como já são hoje.
- Não altera `NovoOrcamentoDialog` original — extraímos apenas o subformulário reutilizável para o novo componente (copy-controlado).

## Antes / Depois (para o time)

- **Antes:** Odontologia é uma tela única com odontograma + prontuário; para orçar precisa ir no menu Orçamentos e escolher `Demais Serviços`, sem filtro por especialidade e sem ligação com dentes.
- **Depois:** dentro do prontuário odontológico o usuário abre a aba Orçamento, cria um orçamento com procedimentos só de Odontologia, marca em quais dentes cada item se aplica, e os dentes orçados ficam sinalizados no odontograma até o item ser executado ou cancelado.

## Pendências / riscos

- Precisa de aprovação da migration (nova coluna `orcamento_itens.dentes` e `orcamentos.especialidade_id`).
- Não vamos preencher retroativamente orçamentos antigos. Só orçamentos criados pela nova aba receberão `especialidade_id`. Se quiser marcar históricos como “de odontologia”, é decisão à parte.
- Impressão / conversão em atendimento continuam ignorando o campo `dentes` (é meta-info clínica, não afeta valor). Se quiser incluir os dentes no cupom impresso, sinalizar depois.
- Testes em produção: criação do orçamento chama `orcamentos.numero=0` (auto pela trigger existente). Se o time preferir, faço um teste com paciente rastreável e removo depois — pergunto antes.
