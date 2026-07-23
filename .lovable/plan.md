## Escopo

Ajuste UX na aba **Orçamento** de `src/routes/_authenticated/app.odontologia.tsx` — plugar o cadastro rápido já existente no campo de busca de paciente.

## Confirmação

Aplicar nas 3 clínicas (componente é único e compartilhado). Confirmar se deve ser somente uma.

## Mudança

O `PatientSearchInput` já expõe a prop `onRequestCreate`, que ativa automaticamente o botão "Cadastrar novo paciente" quando a busca não retorna resultados. Também já existe `QuickPatientDialog` (`src/components/pacientes/quick-patient-dialog.tsx`) com os campos pedidos: nome completo, CPF, data de nascimento, telefone (e-mail é opcional, mantém).

Na aba Orçamento da Odontologia (linhas ~537-541 de `app.odontologia.tsx`):

1. Adicionar estados `quickOpen` (bool) e `quickInitial` (string do termo digitado).
2. Passar `onRequestCreate={(q) => { setQuickInitial(q); setQuickOpen(true); }}` ao `PatientSearchInput`.
3. Renderizar `<QuickPatientDialog>` no final da aba, apontando para `clinicaAtual.clinica_id`, `nomeInicial={quickInitial}` e `onCreated={(p) => { setPacienteSelOrc(p); setPacienteIdOrc(p.id); setQuickOpen(false); }}`.

Assim, ao buscar um paciente inexistente, aparece o botão "Cadastrar novo paciente: '…'"; ao clicar, abre o diálogo já preenchido com o texto digitado, e após salvar o paciente é selecionado automaticamente para o orçamento.

## Fora de escopo

- Aba Prontuário (mantém como está — dá para replicar depois se pedirem).
- Alterações no `PatientSearchInput` ou no `QuickPatientDialog` — ambos já estão prontos.
- Nenhuma mudança de banco, RLS ou validação (o `QuickPatientDialog` já valida CPF, telefone e e-mail).

## Detalhes técnicos

- Arquivo único: `src/routes/_authenticated/app.odontologia.tsx`.
- Import: `import { QuickPatientDialog } from "@/components/pacientes/quick-patient-dialog";`.
- `clinicaId` já disponível na página via `useClinica()`; reaproveitar a variável existente no arquivo.
