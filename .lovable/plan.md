## Problema

Na aba **Contrato** (que já é renderizada só depois da venda salva, dentro do `DetalheContrato`), o preview usa o `modelo_contrato` do convênio (`cb_convenios.modelo_contrato`) — diferente do template de planos usado em `print-contrato.ts`. O renderizador atual em `src/components/pages/contratos-page.tsx` (linhas 1172-1211) tem dois bugs:

1. **`maxSlots = Math.max(max_dependentes, deps.length)`** — sempre cria N variáveis vazias (`DEPENDENTE_2..5`) mesmo quando há 0 ou 1 dependente, então qualquer linha/linha de tabela no template para "Dependente 2..5" continua aparecendo em branco.
2. **`tpl.replace(/\{\{(\w+)\}\}/g, ...)`** — substituição simples, sem suporte aos blocos condicionais `{{#KEY}}...{{/KEY}}` que o `print-contrato.ts` já entende. Sem esses blocos, é impossível esconder uma linha de tabela inteira quando o dependente não existe.
3. Não busca `data_nascimento` nem `telefone` dos dependentes — então mesmo quando o dependente existe, esses campos vêm vazios na tabela do contrato.

## Correções

**Arquivo único:** `src/components/pages/contratos-page.tsx` (preview da aba Contrato em `DetalheContrato`).

1. **Reutilizar o mesmo motor de template do PDF**
   - Importar (ou duplicar como helper local) o `applyTemplate` de `src/lib/print-contrato.ts`, que já trata:
     - `{{#KEY}}...{{/KEY}}` — renderiza só se `vars[KEY]` tiver valor.
     - `{{^KEY}}...{{/KEY}}` — renderiza só se estiver vazio.
     - `{{KEY}}` — substituição simples com escape.
   - Trocar o `tpl.replace(...)` do `useMemo` por `applyTemplate(tpl, vars)`.

2. **Iterar somente sobre dependentes existentes**
   - Trocar `maxSlots = Math.max(max_dependentes, deps.length)` por `maxSlots = deps.length`.
   - Resultado: `DEPENDENTE_2..5` deixam de existir quando não há dependente, então blocos `{{#DEPENDENTE_2}}...{{/DEPENDENTE_2}}` somem do preview e do PDF.

3. **Trazer Nascimento e Telefone dos dependentes**
   - Na consulta de dependentes do `DetalheContrato` (já existente, ~linha 801–803), ampliar o select para `*, pacientes:paciente_id(cpf, data_nascimento, telefone)`.
   - Mapear para o `deps` local incluindo `data_nascimento` e `telefone` (fallback no `contrato_dependentes.telefone` se existir).
   - Preencher novas variáveis no `depSlotVars`:
     - `DEPENDENTE_{n}_NASCIMENTO` — `dd/mm/aaaa` (usar `fmtD` já existente).
     - `DEPENDENTE_{n}_TELEFONE`.
   - Mantidos: `DEPENDENTE_{n}` (nome), `DEPENDENTE_{n}_PARENTESCO`, `DEPENDENTE_{n}_CPF`.

Sem mudança de schema, sem migração. O PDF (`print-contrato.ts`) já está correto desde a última iteração — esta correção alinha o **preview da aba Contrato** ao mesmo comportamento.

## Observação importante sobre o `modelo_contrato` do convênio

O `modelo_contrato` salvo em `cb_convenios` (editado em **Cartão Benefícios → Convênios → Modelo do contrato**) precisa envolver **cada linha da tabela de dependentes** em bloco condicional, senão o HTML/markup da linha continua sendo renderizado vazio. Ex.:

```
{{#DEPENDENTE_1}}
1) {{DEPENDENTE_1}} — Nasc.: {{DEPENDENTE_1_NASCIMENTO}} — Parentesco: {{DEPENDENTE_1_PARENTESCO}} — Tel.: {{DEPENDENTE_1_TELEFONE}} — CPF: {{DEPENDENTE_1_CPF}}
{{/DEPENDENTE_1}}
{{#DEPENDENTE_2}}
2) ...
{{/DEPENDENTE_2}}
```

Se o template do convênio hoje tem texto fixo `2. Nome: _____` sem envolver em `{{#DEPENDENTE_2}}`, esse texto continuará aparecendo. Posso, num próximo passo (após você aprovar este), abrir o modelo dos convênios e ajustar o markup para usar os blocos condicionais — só me confirme se quer que eu já faça isso e em quais convênios.
