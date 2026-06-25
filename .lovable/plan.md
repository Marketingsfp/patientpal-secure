## Problema

Na clínica, o "médico" **ENFERMAGEM** (id `2da8714a…`) tem **22 procedimentos** cadastrados em `medico_procedimentos` (e 16 vinculados à agenda ENFERMAGEM em `medico_agenda_procedimentos`). Mesmo assim, ao abrir o diálogo de agendamento, o campo **Serviço** só lista uma opção (a especialidade "ENFERMAGEM"), em vez dos serviços configurados.

## Causa

Em `src/routes/_authenticated/app.agenda.tsx`, a função `opcoesProcedimentoMedico(medicoId, agendaId)` aplica um filtro extra (`filtrarPorAgenda`) usando o `agenda_id` do slot/filtro ativo. Quando o `agenda_id` do slot clicado **não** é o da agenda ENFERMAGEM (ex.: clique em um slot que herdou `agenda_id` de outra agenda do mesmo médico — ITB, EEG, HOLTER…) ou quando há divergência entre os IDs de procedimento entre `medico_procedimentos` e `medico_agenda_procedimentos`, o filtro **zera** a lista de serviços e o select fica só com o "padrão" da especialidade.

A lista de 22 serviços do médico nunca deveria ficar oculta por causa do filtro por agenda — esse filtro é apenas uma sugestão de priorização, não uma restrição rígida.

## Correção (frontend, escopo mínimo)

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`, função `opcoesProcedimentoMedico`.

1. Aplicar `filtrarPorAgenda` de forma **não destrutiva**: se o resultado filtrado for vazio (ou menor que 1), retornar a lista completa do médico em vez de uma lista vazia.
2. Garantir que o ramo `opcoesCadastradas` (que vem de `medico_procedimentos`, fonte oficial do cadastro do médico) também caia nesse fallback.

Pseudocódigo do ajuste:

```text
const filtrarPorAgenda = (lista) => {
  if (!agendaId) return lista;
  const idsAgenda = procIdsPorAgenda.get(agendaId);
  if (!idsAgenda || idsAgenda.size === 0) return lista;
  const filtrada = lista.filter(p => idsAgenda.has(p.id) || nomesAgenda.has(normalizar(p.nome)));
  return filtrada.length > 0 ? filtrada : lista;   // ← fallback novo
};
```

## Verificação

- Abrir a agenda ENFERMAGEM, clicar em um slot e confirmar que o select **Serviço** lista os 22 procedimentos cadastrados (SORO + 3 MEDICAMENTOS, CURATIVO (G/M/P), MEDICACAO, NEBULIZACAO, ECG, MAPA 24H, HOLTER, etc.) além do padrão "ENFERMAGEM".
- Em uma agenda de médico com vínculos válidos em `medico_agenda_procedimentos` (ex.: cardiologista com 3 serviços), confirmar que o filtro por agenda continua priorizando esses 3.
- Reproduzir via Playwright contra `localhost:8080`, abrir o diálogo de novo agendamento no slot ENFERMAGEM e capturar print do dropdown aberto antes/depois.

Sem mudanças de schema, RLS ou backend.