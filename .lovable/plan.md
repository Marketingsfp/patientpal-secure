## 1. Taxa de boleto: +R$ 3,50 por parcela

Quando a forma de pagamento da venda for **Boleto**, somar R$ 3,50 em cada parcela mensal gerada.

- `src/routes/_authenticated/app.contratos.tsx` (função `salvar`):
  - Ao montar `parcelas`, usar `valor = valor_mensal + (forma === "boleto" ? 3.5 : 0)`.
- No formulário de venda, mostrar logo abaixo do "Valor mensal" um aviso quando boleto estiver selecionado: *"+ R$ 3,50 de taxa de boleto por parcela — total da parcela: R$ X,XX"*.
- O campo `valor_mensal` salvo em `contratos_assinatura` permanece sem a taxa (valor "limpo" do convênio); a taxa entra apenas em cada `contrato_mensalidades.valor`.
- A taxa de adesão (cobrança única) não é afetada.

## 2. Variável `{{DATA_HOJE}}` por extenso

Hoje a variável é renderizada como `26/05/2026`. Passar a renderizar como **"26 de maio de 2026"** (formato padrão de contratos brasileiros).

- Criar helper `fmtDataExtenso(dateISO)` em `src/lib/print-contrato.ts` que retorna `"<dia> de <mês> de <ano>"` (meses em minúsculo: janeiro, fevereiro…).
- Usar esse helper:
  - `src/lib/print-contrato.ts` → substituição de `DATA_HOJE`.
  - `src/routes/_authenticated/app.contratos.tsx` → memo `contratoTexto` (aba "Contrato").
- `{{PACIENTE_NASCIMENTO}}` e `{{DATA_INICIO}}` (se existir) continuam no formato `dd/mm/aaaa`.

> Obs: estou usando "por extenso" no sentido usual de contrato (dia + mês escrito + ano em algarismos). Se quiser **totalmente** por extenso ("vinte e seis de maio de dois mil e vinte e seis"), me avise que troco o helper.

## 3. Variáveis por dependente no modelo do contrato

O template do convênio "CARTÃO CONSULTA + SEGUROS" usa **5 ocorrências** literais de `{{DEPENDENTES}}` (uma por slot de dependente). Como hoje `{{DEPENDENTES}}` é substituído sempre pela lista completa, o único dependente cadastrado acaba sendo impresso 5×.

Solução: criar variáveis numeradas por slot.

- Novos tokens reconhecidos na substituição:
  - `{{DEPENDENTE_1}}` … `{{DEPENDENTE_N}}` → apenas o **nome**, ou string vazia se o slot não foi preenchido.
  - `{{DEPENDENTE_1_PARENTESCO}}` … `{{DEPENDENTE_N_PARENTESCO}}` → parentesco do slot ou vazio.
  - `{{DEPENDENTE_1_CPF}}` … `{{DEPENDENTE_N_CPF}}` → CPF do slot ou vazio.
- Mantém `{{DEPENDENTES}}` (lista completa) para retro-compatibilidade.
- Aplicado em **dois lugares** (mesma lógica):
  - `src/lib/print-contrato.ts` (impressão A4).
  - `src/routes/_authenticated/app.contratos.tsx` (memo `contratoTexto` da aba "Contrato").
- Em `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`, adicionar à lista de variáveis disponíveis (no editor de modelo de contrato): "Dependente 1 (nome)", "Dependente 1 — parentesco", … até o `max_dependentes` do convênio sendo editado.

Depois desse ajuste, o template precisa ser editado uma vez (trocar as 5 ocorrências de `{{DEPENDENTES}}` por `{{DEPENDENTE_1}}`…`{{DEPENDENTE_5}}`); avisarei isso no toast/UI do editor.

## 4. Respeitar limite máximo de dependentes

O `addDep` em `app.contratos.tsx` só bloqueia quando `max > 0`. Se um convênio estiver com `max_dependentes = 0` (ou nulo), hoje vira "ilimitado" — foi o que permitiu adicionar 7 numa simulação.

- Tratar `max_dependentes` como **limite real sempre**:
  - `0` ou `null` → 0 dependentes permitidos (somente titular).
  - `>0` → até esse número (já funciona, mantemos).
- Desabilitar o botão "Adicionar cliente como dependente…" e mostrar "Limite atingido (X/X)" quando `deps.length >= max`.
- Validar novamente no `salvar` antes de inserir em `contrato_dependentes`, recusando com toast se o array exceder `max`.

## Arquivos afetados

- `src/routes/_authenticated/app.contratos.tsx` — formulário de venda + memo do contrato.
- `src/lib/print-contrato.ts` — impressão A4.
- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` — lista de variáveis no editor de modelo.

Nada no banco precisa mudar.
