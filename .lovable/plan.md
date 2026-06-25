## Diagnóstico

No banco está tudo certo para o médico **ENFERMAGEM** (clínica POLICLINICA MENINO JESUS):

- `medico_procedimentos`: 16 serviços vinculados (APLICACAO DE INJECAO, CURATIVO G/M/P, MEDICACAO, NEBULIZACAO, etc.).
- `medico_agendas`: 1 agenda ENFERMAGEM ativa.
- `medico_agenda_procedimentos`: os mesmos 16 procedimentos já estão vinculados à agenda.

Mesmo assim, o dropdown "Serviço" no diálogo de agendamento mostra só `ENFERMAGEM (principal)` (esse rótulo é o fallback gerado por `procedimentoPadraoDoMedico` quando `opcoesProcedimentoMedico` devolve lista vazia em `src/routes/_authenticated/app.agenda.tsx`).

Como os dados de origem estão corretos, o problema está na lógica de montagem das opções na agenda — provavelmente em `opcoesProcedimentoMedico` (linha ~1237) ou no filtro `filtrarPorAgenda`, que está zerando a lista para esse caso específico (slot gerado automaticamente, agenda recurso de enfermagem, etc.).

## Plano

1. **Reproduzir o bug** com Playwright usando a sessão da QUEDIMA: abrir `/app/agenda`, clicar em um slot do ENFERMAGEM, abrir o dropdown e capturar `window`/console com o estado real de `procOpcoesPorMedico`, `procIdsPorAgenda` e o `agendaId` que está sendo passado para `opcoesProcedimentoMedico`. Isso identifica em qual ramo a lista esvazia.

2. **Corrigir `opcoesProcedimentoMedico`** em `src/routes/_authenticated/app.agenda.tsx` com fallback robusto:
   - Se o filtro por agenda (`filtrarPorAgenda`) zerar a lista mas o médico tem serviços configurados em `medico_procedimentos`, retornar a lista completa do médico em vez de vazio (com aviso "agenda sem vínculos — mostrando todos os serviços do médico").
   - Garantir que o `agendaId` usado venha de uma das agendas reais do médico atual (`agendasPorMedico.get(medicoId)`); se o `editing.agenda_id` apontar para uma agenda que não pertence ao médico selecionado, ignorar o filtro.
   - Quando o médico tiver apenas uma agenda e ela tiver vínculos, manter o filtro normal.

3. **Backfill defensivo no banco** (migration) para evitar regressões: para todo `medico_procedimentos` cujo médico tenha agenda em `medico_agendas`, criar o vínculo equivalente em `medico_agenda_procedimentos` quando estiver faltando. Isso garante que mesmo o filtro estrito devolva os 16 serviços nesse caso.

4. **Validar** com Playwright: reabrir o slot da ENFERMAGEM, abrir o dropdown e confirmar que aparecem os 16 serviços (APLICACAO DE INJECAO, CURATIVO G/M/P, MEDICACAO, etc.). Tirar screenshot.

## Arquivos afetados

- `src/routes/_authenticated/app.agenda.tsx` (função `opcoesProcedimentoMedico` e mensagem do label "Serviço").
- Nova migration para o backfill de `medico_agenda_procedimentos`.
