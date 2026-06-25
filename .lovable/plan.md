## Problema

No diálogo **Dividir orçamento** (`src/components/agenda/dividir-orcamento-dialog.tsx`) o campo "Profissional / Recurso" lista **todos** os médicos/recursos da clínica, sem checar se aquele profissional realmente executa o serviço do bloco. Resultado: dá para mandar Ecocardiograma para o Dr. Milton (Dermato) ou Consulta Diferenciada para a Conceição.

A relação correta já existe no banco:
- `medico_procedimentos (medico_id, procedimento_id)` — médicos
- `enfermagem_recurso_procedimentos (recurso_id, procedimento_id)` — recursos

## Correção

1. **Carregar vínculos** ao abrir o diálogo:
   - `SELECT medico_id, procedimento_id FROM medico_procedimentos WHERE procedimento_id IN (ids do orçamento)`
   - `SELECT recurso_id, procedimento_id FROM enfermagem_recurso_procedimentos WHERE procedimento_id IN (...)`
   - Montar dois `Map<procedimento_id, Set<profissional_id>>`.

2. **Filtrar opções por bloco** em `dividir-orcamento-dialog.tsx`:
   - Para cada grupo, juntar os `procedimento_id` dos itens (ignorar itens sem `procedimento_id` — descrição livre).
   - Opção habilitada = profissional/recurso que executa **todos** os `procedimento_id` do grupo (interseção).
   - Se nenhum item do grupo tiver `procedimento_id`, mantém a lista completa (fallback para texto livre).
   - A `SearchableSelect` passa a receber `medicoOpts` calculado por grupo, não global.

3. **Feedback visual**:
   - Se a lista filtrada ficar vazia, mostrar aviso no bloco: "Nenhum profissional cadastrado para este serviço. Vincule em Equipe → Médico → Serviços."
   - Se o usuário já tinha selecionado um profissional e ele não está mais na lista (mudou serviço), limpar `medico_id` do grupo.

4. **Trava no salvar** (`handleSalvar`): revalidar que cada `medico_id` escolhido pertence ao set permitido do grupo; caso contrário, `toast.error` e bloqueia o insert.

5. **Mesma regra na agenda comum** (`app.agenda.tsx`, formulário de novo agendamento): já existe `opcoesProcedimentoMedico` filtrando serviço por médico; verificar e, se necessário, aplicar o filtro inverso (médico por serviço) quando o usuário escolher o serviço primeiro — para evitar o mesmo bug em agendamento avulso.

## Arquivos a editar

- `src/components/agenda/dividir-orcamento-dialog.tsx` — receber maps de vínculos, filtrar `medicoOpts` por grupo, validar no salvar, exibir aviso quando vazio.
- `src/routes/_authenticated/app.agenda.tsx` (linhas ~4380-4392) — buscar os vínculos antes de abrir o diálogo (ou na própria abertura) e passar como prop nova `vinculos={{ medicos: Map, recursos: Map }}`.

## Sem alterações de schema

Tabelas e dados já existem; só uso das relações.
