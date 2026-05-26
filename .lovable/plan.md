## Mudanças em `src/routes/_authenticated/app.contratos.tsx` (apenas frontend)

### 1. Valor mensal e Taxa de adesão vêm do convênio e ficam read-only

Hoje os campos usam `CurrencyInput` editável (linhas 323–324). Vou trocar por uma exibição read-only formatada (caixa com fundo `bg-muted/30`), mostrando o valor calculado em BRL. Os states `valor`/`taxa` continuam existindo (são usados no `insert` do contrato e na geração das parcelas), mas o usuário não pode mais editá-los.

- **Taxa de adesão**: sempre `convenio.taxa_adesao` (cobrada uma única vez — já é assim hoje no insert: o campo `taxa_adesao` vai só no contrato, não nas parcelas mensais). Apenas remover a editabilidade e deixar claro na UI ("cobrança única").
- **Valor mensal**: sempre derivado do convênio + nº de vidas (titular + dependentes), via faixas (`cb_convenio_faixas`). A lógica de recálculo já existe (linhas 199–205); só preciso garantir que ele recalcule também quando faixas estão vazias (fallback para `convenio.valor_mensal`) — já faz. Adicionar texto auxiliar: "Recalculado automaticamente conforme dependentes".

### 2. Bug: câmera não abre ao clicar em "Foto" do 1º dependente

Causa: `setFaceOpen(i)` recebe `0` para o primeiro dependente, e o render usa `!!faceOpen` / `faceOpen ?` (linhas 399, 401) — `0` é falsy, então o `FaceCaptureDialog` nem é montado.

Correção: trocar todas as checagens de truthiness por `faceOpen !== null`:
- linha 399: `{faceOpen !== null ? (`
- linha 401: `open={faceOpen !== null}`

O resto da lógica (`faceOpen === "titular"` vs `typeof faceOpen === "number"`) já está correta.

## Fora do escopo
- Backend, schema, RLS — sem mudanças.
- Outras telas e o fluxo de assinatura/contrato em si.
