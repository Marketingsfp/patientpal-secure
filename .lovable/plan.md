## Objetivo

Na aba **Atendimentos** (`/app/financeiro/atendimentos`), adicionar um ícone de **histórico** (relógio) em cada linha, na coluna **AÇÕES**, que abre um diálogo mostrando:

- **Pagamento**: quem pagou, quando (data/hora), forma de pagamento, valor.
- **Baixa do repasse**: quem deu baixa (nome + papel: médico/funcionário), data/hora, e quem desfez, se houver.
- **Edições posteriores**: qualquer alteração no lançamento pago (valor, forma, descrição etc.) — com "antes → depois", autor e horário.

## Como funciona (linguagem simples)

Todas essas informações **já existem no banco** — a tabela `audit_log` grava INSERT/UPDATE/DELETE em `fin_lancamentos` e `agendamentos` desde o início do projeto (hoje há 31.782 registros). O que falta é uma tela que mostre isso ao usuário no lugar certo.

O novo diálogo vai:
1. Buscar o(s) `fin_lancamentos` do agendamento (receita, tipo = "receita").
2. Ler `audit_log` filtrando por `record_id` desse lançamento **e** pelo `agendamento_id` (para pegar baixa/desfazer baixa que ficam gravadas em `agendamentos.repasse_pago_por` / `repasse_pago_em`).
3. Renderizar uma linha do tempo em ordem cronológica com: rótulo amigável (Pagou / Deu baixa / Desfez baixa / Editou lançamento), nome do autor (buscado em `profiles` a partir do `user_email` do log) e diff dos campos alterados.

## Escopo

- **Frontend apenas** — nada muda em RLS, banco, regras de repasse ou fluxo de pagamento/baixa.
- Reusa o padrão de `src/components/orcamentos-v2/historico-orcamento-dialog.tsx` (mesmo estilo visual, mesma leitura de `audit_log`).

## Arquivos a alterar/criar

1. **Novo:** `src/components/financeiro/historico-atendimento-dialog.tsx`
   - Componente `<HistoricoAtendimentoDialog open onClose atendimento />`.
   - Query 1: `fin_lancamentos` do agendamento (para achar `record_id` do lançamento).
   - Query 2: `audit_log` onde `record_id IN (lancamento.id, agendamento.id)` da mesma clínica, ordenado desc, limite 200.
   - Query 3: `profiles` para mapear `user_email → nome + cargo` (médico / funcionário) usando as colunas já existentes.
   - Rótulos por ação: "Pagamento registrado" (INSERT em fin_lancamentos), "Lançamento editado" (UPDATE), "Baixa realizada" (UPDATE em agendamentos com `repasse_pago_por` passando de null → uuid), "Baixa desfeita" (uuid → null), "Estorno" (status → "cancelado").
   - Diff só de campos relevantes (valor_pago, forma_pagamento, descricao, status, repasse_pago_por, repasse_pago_em) — ignora `updated_at`.

2. **Editar:** `src/routes/_authenticated/app.financeiro.atendimentos.tsx`
   - Importar `History` (lucide) e o novo diálogo.
   - Adicionar estado `historicoAtend: Atend | null`.
   - Na coluna AÇÕES da tabela desktop (por volta da linha ~2600) e nos cards mobile, adicionar botão-ícone `<History className="h-4 w-4" />` entre "Baixado/Baixar" e o ícone de excluir, com `title="Ver histórico"`, disparando `setHistoricoAtend(a)`.
   - Renderizar `<HistoricoAtendimentoDialog>` no final do componente, controlado pelo estado.

## Validação (antes de fechar)

- Abrir `/app/financeiro/atendimentos`, clicar no novo ícone de relógio em uma linha paga:
  - deve mostrar quem pagou + data/hora do INSERT no caixa;
  - se já foi dada baixa, deve mostrar quem deu baixa (com papel) + horário;
  - se houve edição do lançamento (ex.: mudança de forma de pagamento), deve listar "antes → depois".
- Testar em atendimento **sem** pagamento: o diálogo abre e mostra "Nenhum evento registrado" (não quebra).
- Testar sem permissão de financeiro: o ícone segue visível (é somente leitura) — auditoria é rastreabilidade, não escrita.

## Fora do escopo

- Não altero fluxos de baixa/pagamento nem adiciono novas colunas em tabelas.
- Não mexo na aba Comprovantes.
- Não altero permissões/RLS — `audit_log` já é lida hoje pelo diálogo de orçamentos com a mesma política.

## Riscos

- Baixo. Puramente leitura. Se `audit_log` estiver sem registros antigos para algum atendimento (registros anteriores ao trigger), o diálogo mostra "Nenhum evento" — sinalizarei isso com uma nota discreta no rodapé.
