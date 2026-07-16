
## Contexto

Contrato #20261888 tem 13 parcelas (numero_parcela 1..13, uma por mês de 07/2026 a 07/2027) — a 13ª parcela cai em 05/07/2027, mesmo mês da `data_fim` do contrato (15/07/2027). O convênio "CARTÃO CONSULTA + SEGUROS" está corretamente configurado com `num_parcelas = 12`, e `contratos_assinatura.num_parcelas = 12`. Ou seja, **os metadados dizem 12, mas o `contrato_mensalidades` tem 13 linhas** para este contrato.

Investigando os `created_at`: parcela #1 foi criada às 19:35:06 (RPC inicial), parcelas #2..#13 foram criadas juntas às 19:36:42 (regeneração retroativa via `regerarComPagas`). O bug de código está em `regerarComPagas` (linhas 1884–1945 de `contratos-page.tsx`):

- O delete apaga apenas pendentes `.neq("numero_parcela", 0)`, mas o próximo número de parcela é calculado por `max(numero_parcela) + 1`. Se por qualquer motivo a #1 sobreviver ao delete (status já era "pago" ou tinha `pago_em`), a regeneração passa a numerar 2..13 e o contrato fica com 13 mensalidades.
- O loop sempre gera **12 novas** parcelas sem verificar se já há parcelas válidas anteriores, o que causa duplicidade quando a #1 permanece.

Além disso, no wizard de criação (linhas ~1001–1029), a taxa de adesão é inserida em `contrato_mensalidades` como uma linha com `numero_parcela = 0`. O usuário quer que a adesão **não seja tratada como mensalidade** — deve aparecer apenas como uma taxa/indicador vinculado ao contrato (por exemplo, no card do Resumo ou como linha destacada fora da tabela de mensalidades), não como uma cobrança na lista.

## Regras finalizadas

1. **Todo contrato de convênio tem exatamente 12 mensalidades.** A `data_fim` é `data_inicio + 12 meses`. Após a 12ª parcela paga, o paciente ainda tem 31 dias de cobertura até `data_fim` — a `data_fim` **não gera parcela**.
2. **Taxa de adesão nunca conta como mensalidade.** Deve ser registrada em campo próprio (`contratos_assinatura.taxa_adesao` já existe) e mostrada como "Taxa de adesão" no Resumo/card do contrato, mas **não** aparecer na tabela "Mensalidades" nem ser criada como linha em `contrato_mensalidades`.

## Escopo

### Fora do escopo
- Não altero cálculo de valor mensal, faixa, dependentes, status de pagamento, RLS, ou impressão do cartão.
- Não mexo em contratos já cancelados/quitados.

### Dentro do escopo

**A) Correção do contrato da Bárbara (dados atuais)**
- Migration de correção (via `supabase--insert`) para apagar a 13ª parcela pendente deste contrato específico (`contrato_id = a481ceae-4049-4c40-97e5-43627abc68cc`, `numero_parcela = 13`, `status = 'pendente'`) e ajustar a #1 (vencimento errado 10/07 → 05/07, para ficar consistente com o dia de vencimento 5).
- Confirmar antes de rodar.

**B) Correção do bug de regeneração (`regerarComPagas`, linhas 1884–1945)**
- Ampliar o delete para apagar **todas** as parcelas ≠0 antes de regenerar (inclusive as pagas com `pago_em` que foram inseridas por engano na primeira criação retroativa), OU sempre reiniciar `numero_parcela` em 1 após o delete.
- Manter o loop de 12 parcelas.

**C) Bloquear geração de 13ª parcela nos outros fluxos**
- Wizard inicial (`~linha 1001`): já gera `convenio.num_parcelas` (12) — OK, sem alteração.
- Regeneração ao salvar dados (`~linha 2038`): loop `for (let i = 1; i <= 12; i++)` — mas usa `prox = max + 1`, mesmo problema. Ajustar para respeitar teto de 12 parcelas por contrato: se já existem parcelas, gerar somente `12 - existentes.length` a partir do próximo número.

**D) Taxa de adesão fora da tabela de mensalidades**
- No wizard (`~linha 1018–1029`): remover a criação da linha `numero_parcela = 0` em `_mensalidades`. Manter o valor em `contratos_assinatura.taxa_adesao` (já persistido via `_taxa_adesao`).
- No Resumo do contrato: exibir "Taxa de adesão: R$ X" como card/linha separada acima ou ao lado dos totais (Pagas / Recebido / A receber), com badge indicando se foi paga (usar um campo `taxa_adesao_paga` — verificar se existe; se não, adiciono via migration junto com `taxa_adesao_paga_em`).
- Ocultar da tabela "Mensalidades" qualquer registro legado com `numero_parcela = 0` (filtrar no `select`/render). Não apago dados antigos automaticamente para preservar histórico.

## Validação

1. Ler DB antes/depois: contrato #20261888 deve passar de 13 → 12 parcelas (numeração 1..12, vencimentos 05/07/2026 a 05/06/2027).
2. Criar um contrato novo no wizard com taxa de adesão > 0 → conferir que `contrato_mensalidades` recebe **apenas 12 linhas** e nenhuma com `numero_parcela = 0`.
3. Renderizar a página do contrato criado → conferir que "Mensalidades" mostra 12 linhas e que a taxa de adesão aparece como card separado.
4. `tsgo` limpo.

## Pergunta antes de executar

Duas dúvidas rápidas para não assumir errado:

- **Contratos legados** que já têm linha `numero_parcela = 0` (adesão como mensalidade): mantenho os dados como estão e apenas oculto essa linha da tabela, tratando o valor como taxa? Ou o senhor prefere migrar todos para o novo formato (mover valor para `taxa_adesao_paga` conforme status e apagar as linhas 0)?
- **Campo de status da taxa de adesão**: hoje não há `taxa_adesao_paga`/`taxa_adesao_paga_em` em `contratos_assinatura`. Posso criar via migration para permitir marcar a adesão como paga separadamente da 1ª mensalidade?
