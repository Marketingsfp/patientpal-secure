## Objetivo
Na aba de **Mensalidades** do Cartão Benefícios / Contratos:
1. Tornar o campo **"Pago em"** editável (hoje é somente-leitura).
2. Adicionar um botão **"Salvar"** que consolida as alterações dos campos editáveis (Vencimento, Valor e Pago em). Hoje cada campo salva sozinho no `onBlur`, o que causa a sensação de que o sistema "não acata" edições enquanto o cursor não sai do campo.

## Comportamento novo
- Vencimento, Valor e Pago em passam a atualizar apenas um **estado local (rascunho)** por parcela — não gravam mais no banco a cada `onBlur`.
- Aparece um botão **"Salvar alterações"** ao lado de "Adicionar parcela" (área circulada em vermelho no print). Ele fica:
  - **Oculto/desabilitado** quando não há edições pendentes.
  - **Habilitado (destacado)** quando existe ao menos uma parcela com rascunho diferente do banco, mostrando a contagem (ex.: "Salvar alterações (3)").
- Ao clicar em **Salvar**:
  - Aplica em lote as mudanças de cada parcela em `contrato_mensalidades` (campos alterados: `vencimento`, `valor`, `pago_em`).
  - Se `pago_em` foi preenchido em uma parcela **pendente**, marca `status = 'pago'` (sem gerar lançamento no caixa — segue o padrão da "Paga (histórica)" já existente).
  - Se `pago_em` foi **limpo** em uma parcela paga que **não tem `lancamento_id`** (ou seja, marcação histórica sem caixa vinculado), volta para `status = 'pendente'`. Se a parcela tiver `lancamento_id` (paga via Caixa), bloqueia a limpeza e mostra aviso pedindo estorno pelo Caixa — evita descasar caixa e mensalidade.
  - Mostra toast único: "N parcela(s) atualizada(s)".
- Botão **"Descartar"** ao lado do Salvar, para reverter rascunhos ao estado do banco.
- Se o usuário tentar sair da aba com rascunhos pendentes, exibe `confirm()` "Há alterações não salvas. Descartar?".

## Escopo técnico (arquivo único)
`src/components/pages/contratos-page.tsx` — bloco da tabela "Mensalidades" do contrato (linhas ~3608–3737) e função `atualizarParcela` (~2262).

- Novo estado `rascunhos: Record<string, { vencimento?: string; valor?: number; pago_em?: string | null }>`.
- Trocar `onBlur` que chama `atualizarParcela` por handlers que só gravam no `rascunhos`.
- Nova célula "Pago em" com `DateInputBR` (limpável) quando `isAdmin && podeEscrever`.
- Nova função `salvarRascunhos()` percorrendo o mapa, enviando `update` por id (mesmo padrão já usado, agrupando os campos alterados) e recarregando via `load()`.
- Botão "Salvar alterações" e "Descartar" no header da seção (junto ao "Adicionar parcela").
- A aba resumo do contrato **(Renovações / Ciclos)** continua funcionando porque `load()` recalcula tudo após o save.

## Fora do escopo
- Não altera regras de repasse, NFS-e, caixa, boletos ou lógica de renovação.
- Não muda outras tabelas de parcelas (ex.: renovações antigas na aba "Renovações" continuam como estão).
- Não introduz nova coluna no banco.

## Riscos e validação
- Risco: alguém marcar `pago_em` numa parcela já vinculada a lançamento do Caixa — mitigado pelo bloqueio descrito.
- Validação sugerida após implementação: editar vencimento + valor + pago_em de 1 parcela pendente → Salvar → recarregar e conferir gravação; testar Descartar; testar navegação com rascunho pendente.
