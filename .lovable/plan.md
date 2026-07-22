## NFS-e agrupada por paciente (mesmo dia) — Agenda

Aplicar nas **3 clínicas** (SFP, Menino Jesus, São Francisco). Escopo restrito ao **mesmo dia** já visualizado na Agenda.

### O que muda para o usuário

Na Agenda (visões Card, Tabela e Grade por Médico) aparece uma **checkbox** ao lado de cada agendamento **pago e sem NFS-e emitida**.

Ao marcar 2+ linhas do **mesmo paciente**, surge uma **barra flutuante**:

> "3 serviços de FRANCINETE · Total R$ 240,00 — [Emitir NFS-e agrupada]"

Ao clicar:
1. Valida: mesmo paciente ✓, mesmo dia (a agenda já é do dia) ✓, todos pagos ✓, todos sem NFS-e ✓, todos mapeiam para o **mesmo emitente** (todos consulta OU todos exame; se misturar, bloqueia com toast explicativo — regra atual do backend força CNPJ diferente por tipo).
2. Abre o **tomador** (mesmo diálogo `usePickTomador`) uma única vez, com o valor **total somado**.
3. Abre a **descrição** já pré-preenchida: uma linha por serviço no formato
   ```
   Consulta Dermatologia — Paciente: X — Data: 22/07/2026
   Retorno Cardiologia — Paciente: X — Data: 22/07/2026
   ```
4. Chama `emitirNfse` **uma única vez** com `valorServicos = soma` e `descricaoServicos = concatenação`.
5. Após retorno OK: vincula o `nfse_id` a **todos** os `agendamentos` selecionados via `fin_notas_pacientes` / `nfse.agendamento_id` (registro múltiplo) e atualiza o `nfseMap` local — todas as linhas mostram o ícone de nota emitida.

### Arquivos afetados

- `src/routes/_authenticated/app.agenda.tsx` (único arquivo de UI):
  - Novo estado `selecionadosNfse: Set<string>`.
  - Checkbox nas 3 visões (Card / Tabela / Grade), condicionada a `pago && !nfseEmitida`.
  - Barra flutuante fixa no rodapé quando `selecionadosNfse.size >= 1`.
  - Nova função `emitirNfseAgrupada()` que reaproveita `pickTomadorNfse` + `pedirDescricaoNfse` + `emitirNfseFn`.
  - Detecção "mesmo emitente" reusando o regex de exame/consulta que já existe no backend.
- `src/lib/nfse.functions.ts`: adicionar campo opcional `agendamentoIds?: string[]` no `inputValidator` de `emitirNfse` e, após sucesso, gravar 1 linha extra em `nfse_agendamentos` (ou preencher `agendamento_id` na primeira e criar vínculos secundários — vou reaproveitar a coluna já existente e, para os demais, atualizar `fin_atendimentos.nfse_id`).
- **Sem migração de schema nova**: os vínculos usam colunas que já existem (`nfse.agendamento_id` + `fin_atendimentos` já ligado ao agendamento).

### Não muda

- Fluxo "Pagar + NFS-e" individual continua igual.
- Botão de NFS-e por linha continua igual.
- Financeiro › NFS-e / Notas: sem alteração.
- Nada muda no comportamento das clínicas — a feature nasce ativa nas 3.

### Validação após implementar

- Testar em 1 paciente com 2 consultas do mesmo dia (SFP, ambiente atual).
- Confirmar que o `nfseMap` marca ambos como emitidos após 1 clique.
- Confirmar bloqueio ao misturar consulta + exame (toast claro).
- Confirmar que agendamento sem pagamento não aparece selecionável.

Posso prosseguir?