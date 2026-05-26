## Objetivo

Na tela de venda do contrato (cartão benefícios), adicionar um campo **"Nº de pessoas no contrato"** que lista as opções vindas das **Faixas de Preço** do convênio selecionado. O valor mensal da parcela passa a vir dessa escolha (não mais do cálculo automático por `titular + dependentes`).

## Comportamento

- Ao selecionar um convênio, carregar suas faixas (`cb_convenio_faixas`) ordenadas por `vidas_de`.
- Renderizar um `Select` com uma opção por faixa, no formato:
  - faixa com `vidas_ate` igual a `vidas_de` → `"1 pessoa — R$ 120,00"`
  - faixa com intervalo → `"3 a 4 pessoas — R$ 180,00"`
  - faixa aberta (`vidas_ate = null`) → `"5+ pessoas — R$ 250,00"`
- Pré-selecionar a faixa que cobre `1 + deps.length` (estado atual) ao abrir/trocar de convênio; se o usuário trocar manualmente, respeita a escolha dele.
- O **Valor mensal** vira somente leitura, ditado pela faixa escolhida. Some a taxa de boleto (R$ 3,50/parcela) na hora de gravar `contrato_mensalidades` — regra já existente, sem mudança.
- Se o convênio não tiver faixas cadastradas, ocultar o campo e manter o comportamento atual (`convenio.valor_mensal`).
- Continuar respeitando o limite de dependentes (`max_dependentes`) — sem alteração nessa regra.

## Arquivos afetados

- `src/routes/_authenticated/app.contratos.tsx`
  - Novo estado `faixaId` (id da faixa escolhida).
  - Remover o `useEffect` que recalcula valor via `vidas` (titular+deps) e trocar pela seleção explícita: ao mudar `faixaId`, setar `valor` com `faixa.valor_mensal`.
  - Ao carregar faixas / trocar convênio, definir `faixaId` inicial pela faixa que cobre `1 + deps.length` (fallback: primeira faixa).
  - Renderizar `<Select>` "Nº de pessoas no contrato" logo abaixo do campo Convênio, antes de "Paciente titular".
  - Tornar o input "Valor mensal" `readOnly` quando houver faixas; manter editável caso não haja.
  - Helper local `labelFaixa(f)` para gerar o texto da opção.

Nada muda no banco nem em outros arquivos.
