## Objetivo

Permitir cadastrar serviços cujo valor não é fixo (ex.: procedimentos que cobram por sessão, por tempo, ou negociáveis). Nesses casos:
- O usuário marca uma opção **"Valor variável"** no cadastro.
- Os campos de preço ficam **opcionais** (podem ficar em R$ 0,00 sem bloquear o cadastro).
- Ao usar o serviço (agenda, caixa, orçamento), o sistema pede o valor manualmente em vez de puxar o preço da tabela.

Para os demais serviços, nada muda — continuam com valores fixos e validação normal.

## O que aparece na tela

### Tela **Serviços → Novo serviço / Editar serviço**

No topo da seção **"Valores por forma de pagamento"**, adicionar um switch:

```text
[  ] Valor variável — informado no momento da cobrança
     Quando ativo, os campos de preço ficam desativados e o valor
     é digitado na hora de agendar, cobrar ou orçar.
```

Quando o switch está ligado:
- Bloco "Valores por forma de pagamento" fica esmaecido e desabilitado.
- Bloco "Valores por convênio (Cartão Benefícios)" fica esmaecido e desabilitado.
- Ao salvar, todos os valores são gravados como 0 (evita conflito com regras existentes) e o registro é marcado como valor variável.

### Tela **Serviços → lista**

- Na coluna de valores da lista, quando o serviço é de valor variável, exibir um badge **"Valor variável"** no lugar do preço em R$.

### Onde o serviço é usado (agenda, caixa, orçamento)

Nos diálogos que hoje puxam o valor do procedimento (lançamento financeiro e conversão de orçamento):
- Se o procedimento escolhido for de valor variável, o campo de valor **não** é preenchido automaticamente com 0.
- Um aviso curto aparece: **"Este serviço tem valor variável — informe o valor cobrado."**
- O foco vai para o campo de valor, que precisa ser digitado antes de salvar.

## Detalhes técnicos

### Banco de dados (migração)

Adicionar à tabela `procedimentos`:
- `valor_variavel boolean NOT NULL DEFAULT false`

Sem novas policies — a coluna herda o RLS existente da tabela.

### Frontend

**`src/routes/_authenticated/app.procedimentos.tsx`**
- Adicionar `valor_variavel: false` ao `EMPTY` e ao formulário.
- Renderizar o switch acima do bloco de valores; quando ligado, desabilitar `CurrencyInput` de dinheiro, pix/cartão, e todos os valores por convênio.
- No `onSubmit`, se `valor_variavel = true`, forçar todos os valores numéricos do payload para 0 antes de gravar e enviar `valor_variavel: true`.
- Ao editar, carregar o flag do registro e refletir na UI.
- Na lista, substituir o valor em R$ por um badge quando `valor_variavel`.

**`src/components/financeiro/lancamento-dialog.tsx`** e **`src/components/orcamentos/conversao-orcamento-dialog.tsx`**
- Ao carregar o procedimento selecionado, ler `valor_variavel`.
- Se verdadeiro: não pré-preencher o valor e mostrar o aviso "Este serviço tem valor variável — informe o valor cobrado.". Bloquear submit enquanto o valor estiver zerado.

### Fora de escopo

- Não alterar a política de valores por convênio para serviços de valor fixo.
- Não alterar as regras de repasse médico / split (o valor variável só entra como base quando o usuário digita).
- Não mexer nos serviços já cadastrados (todos ficam com `valor_variavel = false` por padrão).

## Verificação

1. Cadastrar um serviço novo com "Valor variável" ligado, com todos os campos de preço em 0 → salva sem erro.
2. Cadastrar um serviço normal com valor → salva como antes.
3. Editar um serviço existente e ligar "Valor variável" → campos desabilitam.
4. Na lista, o serviço variável aparece com badge "Valor variável".
5. Ao usar o serviço variável em um lançamento financeiro / orçamento, o campo de valor não vem preenchido e exige digitação.
