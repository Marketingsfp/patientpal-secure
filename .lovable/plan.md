## Objetivo

- **Aba "Dados do contrato":** deixar de digitar o nome do funcionário livremente. O nome passa a ser escolhido da lista de clientes (pacientes) da clínica. Um botão ao lado abre o cadastro rápido de paciente para casos em que a pessoa ainda não existe.
- **Aba "Convênio":** remover a nova seleção de titular. O titular já é o paciente vinculado na primeira aba — a aba só decide se o convênio está ligado/desligado e gere os dependentes.

## Clínica-alvo

Confirme, por favor: aplicar em **todas as três clínicas** (Menino Jesus, SFP, e a terceira) ou apenas em uma? A mudança é estrutural (cadastro de RH), então o padrão sugerido é global. Se for para valer só em uma, uso feature flag por `clinica_id`.

## Escopo

Dentro:
- `src/routes/_authenticated/app.hr-contratos.$id.tsx` (aba Dados do contrato).
- `src/components/funcionarios/ConvenioFuncionarioTab.tsx` (aba Convênio).
- Nova coluna `hr_contratos.paciente_id` para guardar o vínculo.

Fora:
- Nenhuma mudança em regras de agenda, preço, benefícios ou motor de convênio — o comportamento continua igual.
- Nenhuma alteração em outros módulos de RH (ponto, férias, holerites).
- Não vou mexer no listado de funcionários.

## Como vai funcionar (usuário)

### Aba "Dados do contrato"
- O campo "Nome do funcionário" vira uma **busca de cliente** (mesmo componente já usado no restante do sistema).
- Ao selecionar um paciente, o **Nome** e o **CPF** são preenchidos automaticamente a partir do cadastro do cliente e ficam somente leitura (para editar, edita-se o cadastro do paciente).
- Ao lado do campo, um botão **"+ Cadastrar cliente"**. Ele abre o mesmo diálogo de cadastro rápido de paciente. Depois de cadastrar, o novo cliente vem já selecionado no campo.
- Se o funcionário for editado (contrato já existente sem `paciente_id`), mostro o nome atual como texto e um botão "Vincular a um cliente" para não travar contratos antigos.

### Aba "Convênio"
- Sumiu a busca "Paciente titular (funcionário)" e a caixa que pedia CPF.
- A aba mostra direto:
  - Estado atual (Ativo/Desativado).
  - Se ainda não estiver ligado, um botão único **"Habilitar Convênio Funcionário"** (usa o paciente vinculado na aba 1).
  - Se estiver ligado, o nome do titular e o botão "Desligar convênio".
  - Seção de **Dependentes** (adicionar/remover pelo mesmo componente de busca de cliente já existente).
- Se a aba 1 ainda não tiver paciente vinculado, mostro um aviso: "Vincule o funcionário a um cliente na aba Dados do contrato para habilitar o convênio".

## Pendências / riscos

- **Contratos antigos** hoje têm só nome livre, sem `paciente_id`. Não vou apagar o nome existente; ele continua exibido até que alguém vincule a um paciente. O convênio só pode ser habilitado após o vínculo.
- Não vou renomear o campo `funcionario_nome` no banco; ele passa a ser preenchido a partir do paciente selecionado (snapshot), mas mantido para não quebrar telas que já leem esse campo.

## Detalhes técnicos

1. **Migração SQL** — adicionar `paciente_id uuid` em `hr_contratos` referenciando `public.pacientes(id)` (sem `ON DELETE CASCADE`; usar `ON DELETE SET NULL`) e índice.
2. **Aba 1 (`app.hr-contratos.$id.tsx`)**:
   - Substituir `<Input value={form.funcionario_nome} …>` por `<PatientSearchInput clinicaIdsOverride={[form.clinica_id]} onRequestCreate=… />`.
   - Ao selecionar, setar `paciente_id`, `funcionario_nome` (snapshot) e `cpf` (só-leitura preenchido).
   - Botão "+ Cadastrar cliente" abre `QuickPatientDialog` já existente e, ao criar, seleciona o paciente retornado.
   - No `salvar()`, incluir `paciente_id` no upsert e validar (obrigatório para novos).
3. **Aba 2 (`ConvenioFuncionarioTab.tsx`)**:
   - Nova prop `pacienteId: string | null` (passada pela tela pai).
   - Remover `PatientSearchInput` do titular e o fallback por CPF.
   - Chamar `hr_toggle_convenio_funcionario` usando `pacienteId`.
   - Se `pacienteId` for `null`, mostrar aviso e desabilitar o botão de habilitar.
4. Reutilizar `QuickPatientDialog` de `src/components/pacientes/quick-patient-dialog.tsx` (já usado em contratos).
5. Sem mudanças em RPCs — as três (`hr_toggle_convenio_funcionario`, `hr_convenio_add_dependente`, `hr_convenio_remove_dependente`) já recebem paciente por ID.

## Antes / Depois (resumo)

- **Antes:** nome do funcionário digitado à mão; na aba Convênio era preciso buscar o funcionário novamente na lista de pacientes.
- **Depois:** nome vem da lista de clientes (com atalho para cadastrar); a aba Convênio já usa esse vínculo e cuida só de habilitar e gerir dependentes.
