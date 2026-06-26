## Problema

No contrato impresso aparecem slots vazios "2, 3, 4, 5" mesmo quando o titular tem só 1 dependente, e os campos Nascimento/Telefone dos dependentes vêm em branco mesmo quando existem no cadastro do paciente.

Isso acontece em `src/lib/print-contrato.ts`:
- O loop usa `Math.max(plano.max_dependentes, deps.length)` — por isso renderiza 5 slots no template mesmo com 1 dependente.
- A query de dependentes só puxa `cpf` do paciente vinculado. `data_nascimento`, `telefone` e `parentesco` do paciente nunca são buscados, então `DEPENDENTE_N_NASCIMENTO` e `DEPENDENTE_N_TELEFONE` ficam vazios.

## Correções

**Arquivo único:** `src/lib/print-contrato.ts`

1. **Iterar somente sobre dependentes existentes**
   - Trocar `maxSlots = Math.max(max_dependentes, deps.length)` por `maxSlots = deps.length`.
   - Resultado: blocos `{{#DEPENDENTE_2}}...{{/DEPENDENTE_2}}` ficam vazios e o motor de template já remove (lógica condicional `{{#KEY}}` já existe). Sem alteração no template do plano.

2. **Buscar dados completos do paciente dependente**
   - Ampliar o `select` do join para `pacientes:paciente_id(cpf, data_nascimento, telefone)`.
   - Para cada dependente preencher novas variáveis:
     - `DEPENDENTE_{n}_NASCIMENTO` — formatado `dd/mm/aaaa` (usa `fmtData` já existente).
     - `DEPENDENTE_{n}_TELEFONE` — vindo do paciente (fallback para `contrato_dependentes.telefone` se existir).
     - `DEPENDENTE_{n}_PARENTESCO` — já existe, mantido.
     - `DEPENDENTE_{n}_CPF` — já existe, mantido.
   - `DEPENDENTE_{n}` (nome) já existe.

3. **Fallback de parentesco**
   - Se `contrato_dependentes.parentesco` for nulo, deixar string vazia (o bloco condicional `{{#DEPENDENTE_N_PARENTESCO}}` esconde a linha "Parentesco:" no template do plano, quando ele usar bloco condicional).

## Observação sobre o template do plano

O template (`planos_assinatura.template_contrato`) precisa usar blocos condicionais para que slots sem dependente sumam:

```
{{#DEPENDENTE_1}}
1. Nome: {{DEPENDENTE_1}}
   Nascimento: {{DEPENDENTE_1_NASCIMENTO}}   Parentesco: {{DEPENDENTE_1_PARENTESCO}}
   Telefone: {{DEPENDENTE_1_TELEFONE}}
{{/DEPENDENTE_1}}
{{#DEPENDENTE_2}}
2. ...
{{/DEPENDENTE_2}}
```

Como o motor `applyTemplate` já apaga blocos `{{#KEY}}...{{/KEY}}` quando a variável está vazia, basta a correção no `print-contrato.ts` (passo 1) para que os números 2–5 sumam — desde que o template do plano use os blocos condicionais. Vou deixar **registrado na resposta** que, se o template ainda renderiza linhas fixas "2. Nome:" sem usar `{{#DEPENDENTE_2}}`, é preciso reeditar o template do plano em `/app/planos` para envolver cada dependente no bloco condicional.

Sem mudança de schema, sem migration, sem mexer no resto do fluxo de venda.
