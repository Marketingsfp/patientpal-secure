
## Objetivo

Fazer o sistema bloquear automaticamente a inclusão de dependentes quando o total de vidas (titular + dependentes) atingir o limite definido pela **faixa de pessoas** escolhida no contrato, respeitando a marcação **"Apenas titular financeiro"**.

## Regra de negócio

Seja `V` o número máximo de vidas da faixa selecionada (`faixa.vidas_ate`, ou `faixa.vidas_de` quando a faixa é aberta "N+"):

- **Titular conta como vida** (checkbox desmarcado): `maxDependentes = V - 1`.
- **Titular apenas financeiro** (checkbox marcado): `maxDependentes = V` (titular não ocupa vaga).

Exemplo do contrato da tela:
- Faixa "3 pessoas" + titular normal → máximo 2 dependentes.
- Faixa "3 pessoas" + titular apenas financeiro → máximo 3 dependentes.

Quando a faixa for aberta ("3+ pessoas", `vidas_ate = null`), o limite superior continua sendo o `max_dependentes` do convênio (comportamento atual), apenas descontando 1 quando o titular usufrui. Faixas fechadas passam a ser respeitadas.

## Alterações (somente `src/components/pages/contratos-page.tsx`)

1. **Aba Dados do contrato existente (por volta da linha 2346):**
   - Substituir `const maxDep = Number(convenio?.max_dependentes ?? 0) || 0;` por um cálculo derivado da `faixaAtual` (ou `admFaixaId` selecionada) e da flag `titular_apenas_financeiro`:
     - `cap = faixaAtual.vidas_ate` (fechada) ou `convenio.max_dependentes + (titularFin ? 0 : 1)` (aberta).
     - `maxDep = cap - (titularFin ? 0 : 1)`, com `Math.max(0, …)`.
   - `maxDep` é usado no contador "Dependentes (x/maxDep)" (linha 3037) e no `disabled` do botão "Incluir dependente" (linha 3059) — ambos passam a refletir a nova regra automaticamente.
   - Recalcular quando o admin trocar a faixa (`admFaixaId`) ou alternar o checkbox de titular financeiro (já reativos).

2. **Wizard de novo contrato (por volta da linha 975):**
   - Na validação do submit, trocar `convenio.max_dependentes` pelo mesmo cálculo baseado na faixa selecionada (`faixaId`) + `titularApenasFinanceiro`.
   - Mensagem de erro atualizada: "Faixa selecionada permite no máximo X dependente(s)."

3. **Mensagem de UI:**
   - Abaixo do contador "Dependentes (x/max)" exibir dica curta quando o limite for atingido: "Limite da faixa atingido. Aumente a faixa ou marque o titular como apenas financeiro."

## Fora do escopo

- Não altera cálculo de valor/faixa sugerida (já existe e considera a flag).
- Não altera RLS, banco, portal do paciente, impressão do cartão.
- Não mexe em contratos já salvos que estejam acima do novo limite — apenas bloqueia novas inclusões; os dependentes existentes continuam listados e podem ser removidos manualmente.

## Validação

- Contrato da tela (faixa "3+", 1 titular + 3 deps): como faixa é aberta, comportamento atual permanece; a regra já aparece em faixas fechadas.
- Criar contrato faixa "3 pessoas" sem titular financeiro → botão "Incluir dependente" desabilita após 2 dependentes.
- Marcar "Apenas titular financeiro" → botão volta a habilitar até 3 dependentes.
- Trocar faixa para "2 pessoas" com 3 deps já cadastrados → botão fica desabilitado; contador exibe 3/1 (ou 3/2 com titular financeiro) sinalizando excesso.
