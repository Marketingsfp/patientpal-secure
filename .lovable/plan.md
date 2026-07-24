## Objetivo
Adicionar uma aba **"Convênio"** no cadastro do médico (`MedicoFormDialog`) que funcione exatamente igual à do funcionário: habilita o Convênio Funcionário, gera um contrato-sombra sem custo/sem carência, e permite incluir/remover dependentes.

## Clínica-alvo
Aplicar em **todas as 3 clínicas** — é mudança estrutural (schema + UI), não parametrização por clínica. O convênio em si continua sendo resolvido por `clinica_id` (cada clínica usa o próprio "CONVÊNIO FUNCIONARIO"). Confirme se quer restringir a uma clínica específica.

## Alterações

### 1. Banco (migration)
- `medicos.paciente_id uuid REFERENCES pacientes(id) ON DELETE SET NULL` (opcional, como em `hr_contratos`).
- `medicos.convenio_contrato_id uuid REFERENCES contratos_assinatura(id) ON DELETE SET NULL`.
- 3 novas RPCs espelhando as de RH, apontando para `medicos`:
  - `medico_toggle_convenio_funcionario(_medico_id, _titular_paciente_id, _habilitar)`
  - `medico_convenio_add_dependente(_medico_id, _paciente_id, _parentesco)`
  - `medico_convenio_remove_dependente(_dependente_id)`
- Mesma regra de busca do convênio: `cb_convenios.nome ILIKE '%FUNCION%'` na clínica do médico.
- Origem do contrato-sombra: `contratos_assinatura.origem = 'medico'` (novo valor permitido no CHECK).
- Auditoria: registrar via trigger existente (`fn_audit_trigger`).

### 2. Componente reutilizável
- Generalizar `ConvenioFuncionarioTab` extraindo props (`entidadeId`, `tabelaOrigem: 'hr_contratos' | 'medicos'`, RPCs correspondentes) OU criar `ConvenioMedicoTab.tsx` copiando a lógica.
- Preferência: **generalizar** o componente atual para evitar duplicação de código de UI (as RPCs continuam duplicadas no banco, o que é seguro).

### 3. UI em `MedicoFormDialog.tsx`
- Aba "Dados": adicionar `PatientSearchInput` para vincular a `paciente_id` do médico (mesmo padrão do RH). Sem esse vínculo, a aba Convênio pede para cadastrar o médico como paciente primeiro (mesma UX do RH).
- `TabsList`: `grid-cols-6` → `grid-cols-7` + `<TabsTrigger value="convenio" disabled={!editingMedicoId}>Convênio</TabsTrigger>`.
- Novo `<TabsContent value="convenio">` renderizando o componente de convênio com `medicoId`, `clinicaId`, `pacienteId`, `pacienteNome`.
- Salvar `paciente_id` no update/insert de `medicos`.

## Antes / Depois
- **Antes:** só funcionários (RH) têm aba Convênio; médicos não conseguem receber os benefícios do Convênio Funcionário pelo sistema.
- **Depois:** cadastro do médico tem aba Convênio idêntica à do funcionário — vincula o médico a um paciente, habilita o convênio (contrato-sombra sem custo/sem carência) e permite gerenciar dependentes.

## Validação
- Cadastrar/editar médico → vincular paciente → habilitar convênio → adicionar 1 dependente → confirmar que aparece em "Cartão Benefícios → Vendas" com origem "Médico" e valor zero.
- Desabilitar convênio → contrato marcado como cancelado e dependentes desativados.

## Fora do escopo
- Não vou mexer no cadastro de funcionários existente.
- Não vou criar um "Convênio Médico" separado — reutiliza o mesmo "CONVÊNIO FUNCIONARIO" da clínica (é o comportamento pedido). Se depois quiser um convênio dedicado, é ajuste rápido de regra de busca.
- Não vou migrar médicos já cadastrados para o convênio automaticamente — habilitação continua manual por médico.