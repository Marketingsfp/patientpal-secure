## Objetivo
No formulário "Novo contrato" (Cartão Benefícios → Vendas), quando a **Data de início** for antiga, permitir informar quantas mensalidades **já foram pagas**, gerando somente as parcelas restantes já quitadas como "pago" (mantendo a numeração original) e as demais como pendentes com vencimento correto.

## Comportamento

1. Após preencher **Data de início**, calcular meses decorridos entre a data e hoje (considerando o `dia_vencimento`).
2. Se a data de início for **anterior ao mês atual** (ou seja, existiria pelo menos 1 parcela já vencida), mostrar um novo campo opcional:
   - **"Mensalidades já pagas anteriormente"** (número, 0 até `num_parcelas − 1`, default 0).
   - Texto de ajuda: "Use isto para lançar contratos antigos já em andamento. As parcelas informadas serão marcadas como pagas."
3. Ao salvar:
   - Continuam sendo geradas **todas as `num_parcelas`** do convênio (numeração 1..N e datas de vencimento a partir da data de início — nada muda no cronograma).
   - As primeiras **X** parcelas (X = valor informado) são inseridas com `status = "pago"` e `pago_em` = data do vencimento (para não aparecerem como atrasadas nem no fluxo de caixa como recebimento novo).
   - As demais permanecem `status = "pendente"` — as ainda futuras aparecem normalmente; as já vencidas continuarão como atrasadas (correto, pois o usuário só marcou X como pagas).
4. A **geração automática de carnê/boletos pós-criação** (linhas 637+) deve considerar apenas parcelas pendentes — verificar se o fluxo atual já filtra por status; se não, filtrar para não emitir boletos das parcelas marcadas como pagas.

## Regras
- Campo só aparece quando `dataInicio` estiver no passado o suficiente para gerar atraso.
- Validação: `0 ≤ pagas < num_parcelas`.
- Não altera schema do banco — usa colunas existentes (`status`, `pago_em`) de `contrato_mensalidades`.
- Nenhuma mudança em contratos existentes; apenas na criação.

## Detalhes técnicos
Arquivo: `src/components/pages/contratos-page.tsx`
- Novo state `mensalidadesJaPagas: number` (default 0).
- Novo `<Input type="number">` renderizado condicionalmente próximo ao bloco de Data início.
- No submit (linha ~618), ao montar `parcelas`, definir `status: i < mensalidadesJaPagas ? "pago" : "pendente"` e incluir `pago_em: venc.toISOString().slice(0,10)` para as pagas.
- Verificar a lógica de geração de carnê/boletos (linhas 637+) para pular parcelas já pagas.

Sem migrações. Sem mudanças em permissões, listagem ou outras telas.