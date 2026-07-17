## Objetivo

Na tela **Novo contrato** (Cartão Benefícios → Vendas), deixar o campo **"Apenas titular financeiro"** sempre visível na área do Paciente titular, porém **desabilitado** enquanto o titular não for selecionado. Após escolher o paciente titular, o checkbox fica habilitado para marcar/desmarcar.

## Comportamento

**Antes:** o checkbox "Apenas titular financeiro" só aparece depois que o paciente titular é selecionado (fica escondido no estado inicial da tela).

**Depois:**
- O bloco do checkbox aparece fixo, ao lado da área do titular, desde a abertura da tela.
- Enquanto `titular` for `null`:
  - `input[type=checkbox]` fica com `disabled` e `checked={false}`.
  - Rótulo em cor mais suave (`text-muted-foreground`, `opacity-60`, `cursor-not-allowed`).
  - Texto auxiliar curto: "Selecione o paciente titular para habilitar."
- Assim que o titular é selecionado, o checkbox é habilitado e permite marcar/desmarcar normalmente (mesmo estado `titularApenasFinanceiro` já existente).
- Ao trocar o titular (botão "Trocar"), o checkbox volta a ficar desabilitado e é resetado para desmarcado.

## Onde muda

Apenas em `src/components/pages/contratos-page.tsx`, no wizard **Novo contrato** (bloco atual entre as linhas ~1140–1252, onde hoje há `{titular ? (...) : (PatientSearchInput)}`):

1. Reestruturar o bloco do "Paciente titular" para que o checkbox "Apenas titular financeiro" fique **fora** do ramo `titular ? …`, permanecendo sempre renderizado ao lado (mantendo o layout md:flex já usado — coluna do titular à esquerda, caixa do checkbox à direita, `md:min-w-[260px] md:max-w-[340px]`).
2. Adicionar `disabled={!titular}` no `<input type="checkbox">` e ajustar as classes do label para refletir o estado desabilitado.
3. No handler do botão **Trocar** (`onClick={() => setTitular(null)}`), também chamar `setTitularApenasFinanceiro(false)` para não deixar um valor "fantasma" marcado sem titular.
4. Adicionar uma linha de ajuda curta abaixo do rótulo, exibida apenas quando `!titular`.

## Fora de escopo

- Aba **Dados** de contratos já existentes (comportamento continua idêntico ao atual — o toggle já aparece lá com titular sempre presente).
- Regras de negócio de `titular_apenas_financeiro` (cálculo de vidas, carteirinha, cobrança) — nada muda.
- Migrações, RLS, tipos gerados, layout de "Convênio + Nº de pessoas" e ordem dos campos (já ajustados anteriormente).

## Validação

- `tsgo --noEmit` sem erros.
- Abrir `Cartão Benefícios → Vendas → Novo contrato`: checkbox visível e desabilitado antes de escolher titular; habilita ao selecionar; reseta ao clicar em "Trocar".