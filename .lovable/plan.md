
## Objetivo

Hoje, na aba **Financeiro › Atendimentos**, o botão verde ✓ ("Dar baixa") só existe **linha por linha**. Quando o CARLOS EDUARDO (ou qualquer médico) tem 20+ atendimentos "A receber" no dia, é preciso clicar 20 vezes. A meta é permitir **selecionar vários atendimentos e dar baixa em todos de uma vez**, aproveitando as checkboxes que já existem.

## Comportamento

1. Na barra de ações do topo (onde ficam "Pagar repasse", "Imprimir 2ª via", "Novo atendimento"), adicionar um novo botão **"Dar baixa"**.
2. O botão fica **desabilitado** enquanto nenhum item elegível estiver marcado.
3. É "elegível para baixa" o atendimento selecionado que **ainda não foi baixado**:
   - origem `agenda` → `agendamento_status !== 'realizado'`
   - origem `manual` → `status !== 'realizado'`
4. O rótulo mostra a quantidade: **"Dar baixa (7)"**.
5. Ao clicar, abre um `confirm` do tipo:
   *"Confirmar baixa de 7 atendimento(s)? Os médicos serão marcados como tendo atendido esses pacientes e os repasses ficarão liberados para pagamento."*
6. Ao confirmar, roda em lote:
   - Um `UPDATE ... IN (...)` em `agendamentos` para todos os IDs vindos de `origem = 'agenda'`.
   - Um `UPDATE ... IN (...)` em `fin_atendimentos` para todos de `origem = 'manual'`.
7. Toast: **"Baixa realizada em N atendimento(s). Repasses liberados."** + `load()` para atualizar a lista.
8. Se algum item selecionado já estava realizado, ele é ignorado silenciosamente (não conta na quantidade e não bloqueia a ação).
9. Erros de banco caem no `mostrarErro` que já existe.

## Detalhe técnico (referência)

- Arquivo único: `src/routes/_authenticated/app.financeiro.atendimentos.tsx`.
- Reutilizar `selectedItems` (já existe), derivando um novo memo `selectedNaoBaixados`.
- Criar função `darBaixaLote()` seguindo o mesmo padrão do `darBaixa(a)` atual (linhas 966–1002), mas com dois `.update().in("id", ids)` em vez de um `.eq`.
- Colocar o botão ao lado de "Pagar repasse" (por volta da linha 1287), com `variant="outline"` e ícone `CheckCircle2` verde para manter coerência visual com a ação individual da linha.
- Não altera esquema, não altera RLS, não mexe em outras telas.

## Fora de escopo

- Não altera a ação verde individual em cada linha (continua funcionando igual).
- Não altera o fluxo de "Pagar repasse" nem de "Imprimir 2ª via".
- Não altera comportamento do Caixa nem cria migração.
