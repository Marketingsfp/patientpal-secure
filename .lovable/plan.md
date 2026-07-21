## Diagnóstico

Confirmei no código a causa (não é problema de banco):

- A RPC `fn_registrar_lancamento_e_caixa` **já trata lançamentos retroativos** — cria/anexa em sessão de caixa da data escolhida e insere o movimento com `created_at = data escolhida 12:00`.
- O `LancamentoDialog` (usado pelo botão **Pagar** da mensalidade) tem sim um campo de data, e envia esse valor como `data` para a RPC.
- **Mas** a função `marcarPago` em `src/components/pages/contratos-page.tsx` (linha 2944) grava sempre:

  ```ts
  pago_em: new Date().toISOString().slice(0, 10)
  ```

  ou seja, ignora a data escolhida no diálogo e força a data de hoje na coluna `pago_em` da mensalidade.

- Além disso, no fluxo especial da **taxa de adesão embutida** (linha 4941), o lançamento independente da taxa usa `const hojeStr = new Date()...` em vez da data escolhida — ou seja, no mesmo pagamento retroativo, a taxa iria para hoje mesmo que a mensalidade fosse para 20/07.

- O `LancamentoSavedData` retornado pelo diálogo hoje não inclui o campo `data`, então quem chama `marcarPago` não tem como repassar a data escolhida.

Resultado para o caso da Mayara: o `LancamentoDialog` pode até ter registrado o lançamento e o movimento no caixa retroativo, mas em outros pontos (a coluna “Pago em” da mensalidade e, se houver taxa de adesão embutida, o lançamento da taxa) continuou usando a data de hoje. E se a operadora não notou o campo de data no diálogo, tudo vai para hoje.

## Escopo da correção

Ajuste **frontend apenas**, sem mexer em RPC/RLS/dados existentes. Aplica-se ao fluxo de pagamento de mensalidade de contrato (aba **Mensalidades**), botão **Pagar**.

Antes de aplicar, confirmo com você:
- Em qual(is) clínica(s) aplicar? (Menino Jesus / SFP / Ergoclínica / todas)

## Alterações previstas

1. `src/components/financeiro/lancamento-dialog.tsx`
   - Adicionar `data: string` em `LancamentoSavedData`.
   - Incluir `data` no objeto passado para `onSavedWithData(...)`.

2. `src/components/pages/contratos-page.tsx`
   - `marcarPago(...)` passa a aceitar `pagoEm?: string | null`. Quando informado, grava `pago_em = pagoEm`; caso contrário, mantém o fallback atual (`hoje`).
   - No `onSavedWithData` do `LancamentoDialog` (pagamento de mensalidade), repassar `dados.data` para `marcarPago(...)`.
   - No bloco da **taxa de adesão embutida na 1ª parcela** (a RPC extra), substituir `const hojeStr = new Date()...` por `dados.data`, e usar a mesma `dados.data` como `pago_em` da linha de adesão em `contrato_mensalidades`.

3. Sem alterações em backend/RPC.
   - A RPC já grava o movimento na sessão retroativa correta quando `data < CURRENT_DATE`. Nada muda para lançamentos não retroativos.

## Efeito prático depois do ajuste

- Ao pagar uma mensalidade escolhendo `20/07/2026` no campo de data do diálogo:
  - O lançamento financeiro fica com `data = 20/07/2026`.
  - O movimento do caixa é gravado na sessão do usuário do dia `20/07/2026` (mantendo o comportamento retroativo já configurado).
  - A coluna **Pago em** da mensalidade passa a mostrar `20/07/2026` (hoje mostra a data de hoje).
  - Se a parcela carregar taxa de adesão embutida, a taxa também é lançada na mesma data retroativa.

## Correção do caso pontual (contrato 20260111)

Após aplicar o ajuste, preciso saber se você quer que eu corrija manualmente as duas mensalidades que a Mayara pagou hoje para refletirem `20/07/2026`:
- ajustar `pago_em` das parcelas 11 e 12 para `20/07/2026`;
- ajustar `data` dos lançamentos vinculados para `20/07/2026`;
- reposicionar os movimentos de caixa correspondentes para a sessão da Mayara em `20/07/2026` (criando sessão retroativa se necessário, exatamente como a RPC faz).

Isso mexe em dados financeiros já confirmados, então só executo com sua autorização e depois de confirmar a clínica.

## Fora de escopo

- Não vou alterar a lógica da RPC, RLS, nem categorias.
- Não vou mexer no fluxo de “Paga (histórica)” (esse já usa `m.vencimento` como `pago_em` e é intencionalmente sem caixa).
- Não vou tocar em pagamentos já feitos em outros contratos sem sua autorização explícita.