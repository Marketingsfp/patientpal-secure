## Objetivo

Fazer o diálogo **Renovar contrato** se comportar igual ao **Novo contrato**:

1. No campo **Convênio da renovação**, mostrar apenas o nome do convênio (sem valor ao lado).
2. Substituir o input numérico **Nº de pessoas no contrato** por um `Select` que lista as **faixas de preço** cadastradas no convênio escolhido, no mesmo formato da venda: "1 pessoa — R$ 110,00", "2 pessoas — R$ 130,00", "3+ pessoas — R$ 150,00" etc.
3. Ao incluir ou remover dependentes (aumentando/diminuindo o total de pessoas), a faixa deve ser reselecionada automaticamente e o valor mensal atualizado — como na venda.

## Escopo

- `src/components/contratos/renovar-contrato-dialog.tsx` (UI + estado do diálogo).
- Migração SQL para as RPCs `renovar_contrato_extensao` e `renovar_contrato_troca_plano`, adicionando parâmetro opcional `_valor_mensal numeric` que, quando informado, sobrescreve `v_convenio.valor_mensal` no cálculo das parcelas e no `contrato_renovacoes.valor_novo` / `contratos_assinatura.valor_mensal` (quando `NULL`, mantém o comportamento atual). Nada mais das RPCs muda.

## Detalhamento técnico

1. **Carga inicial**: junto com `cb_convenios` e `contrato_dependentes`, carregar `cb_convenio_faixas` (filtrado por `convenio_id IN (...ids...)`) — mesma tabela usada em `contratos-page.tsx` (linhas 971-978).
2. **Estado**: adicionar `faixaId: string`. Derivar `faixasDoConvenio = faixas.filter(f => f.convenio_id === novoConvenioId).sort(vidas_de asc)`.
3. **Auto-seleção da faixa**: sempre que `totalPessoas` (titular + dependentes ativos) ou `novoConvenioId` mudar, escolher a faixa onde `totalPessoas >= vidas_de && (vidas_ate == null || totalPessoas <= vidas_ate)`; fallback para a última faixa quando exceder. Mesma lógica dos linhas 985-993 de `contratos-page.tsx`.
4. **Valor exibido**: `valorRenovacao` passa a vir da faixa selecionada (não mais de `novoConvenio.valor_mensal`). Reaproveitar o helper `labelFaixa` (linha 1008) para renderizar as opções do `Select`.
5. **Convênio dropdown**: exibir só `c.nome` (sem `— R$ ...`), mantendo o sufixo "(atual)" para o convênio atual do contrato.
6. **Remover o input numérico** de nº de pessoas. O `Select` de faixa passa a ser o campo à direita. O total real de pessoas continua sendo derivado de `1 + depsAtivos.length` e usado para pré-selecionar a faixa; se o usuário mudar a faixa manualmente para uma que exija menos/mais pessoas, apenas alerta via `toast` (sem alterar a lista de dependentes automaticamente, para não sobrescrever escolhas do usuário).
7. **Botão "Adicionar dependente"** continua igual. Ao adicionar/remover, o `useEffect` recalcula a faixa e o valor mensal automaticamente. O limite `maxDep` continua vindo de `cb_convenios.max_dependentes`.
8. **Chamada às RPCs**: enviar `_valor_mensal: faixaSelecionada.valor_mensal` nas duas RPCs.
9. **Migração SQL** (dois `CREATE OR REPLACE FUNCTION`): novo parâmetro `_valor_mensal numeric DEFAULT NULL` no fim da assinatura de cada função e uso de `COALESCE(_valor_mensal, v_convenio.valor_mensal)` nas linhas que hoje usam `v_convenio.valor_mensal` / `v_convenio_novo.valor_mensal` para valor de parcela e para `valor_novo`/`valor_mensal` do novo contrato.

## Fora do escopo

- Não alterar as taxas de adesão / inclusão de dependente (continuam vindo do convênio).
- Não mudar o fluxo de venda (`Novo contrato`) nem o de edição do contrato.
- Não alterar a tabela `cb_convenio_faixas` nem os relatórios.

## Validação

- Renovar contrato no mesmo convênio (extensão) com faixa diferente → 12 novas parcelas com o valor da faixa.
- Trocar de convênio → novo contrato com parcelas no valor da faixa escolhida + taxa de adesão.
- Incluir dependente novo → faixa e valor mensal atualizam sozinhos no resumo.
- Remover dependente existente (× ao lado do nome) → faixa recua e valor atualiza.
- Escolher manualmente uma faixa diferente da automática → valor atualiza e aviso é exibido.
