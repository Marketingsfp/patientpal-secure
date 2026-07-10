
## Objetivo

Permitir, na tela de nova venda do Cartão Benefício, cadastrar rapidamente um paciente sem sair do formulário quando o titular ou dependente ainda não existe. Um botão aparece dentro do campo de busca sempre que o usuário digita algo e a lista fica vazia ("Nenhum paciente encontrado").

## Escopo

Somente frontend. Reaproveita o padrão de "cadastro rápido" já existente no fluxo `agenda.express` (insert direto em `pacientes` com os campos mínimos). Sem mudanças de banco.

## Fluxo do usuário

1. Na venda do Cartão Benefício, ao buscar o Paciente titular ou um Dependente, se nenhum registro aparecer:
   - O dropdown mostra, além da mensagem "Nenhum paciente encontrado", um botão **"Cadastrar novo paciente"** (já pré-preenchendo o texto digitado).
2. O botão abre um **modal de cadastro rápido** com os campos: Nome (obrigatório), CPF (opcional, validado), Data de nascimento (opcional), Telefone (opcional), E-mail (opcional).
3. Ao confirmar, o paciente é criado em `pacientes` na clínica atual e o modal fecha.
4. O paciente recém-criado é automaticamente selecionado no campo de origem (titular ou dependente) — sem precisar buscar de novo.

## Onde entra no código

- **`src/components/patient-search-input.tsx`**
  - Nova prop opcional `onRequestCreate?: (query: string) => void`.
  - No estado "Nenhum paciente encontrado", quando a prop existir, renderizar um botão `Cadastrar "<query>"` que chama `onRequestCreate(query)` e fecha o dropdown.
  - Comportamento atual (busca, seleção, voz) não muda para chamadas que não passem a prop.

- **Novo componente `src/components/pacientes/quick-patient-dialog.tsx`**
  - `<QuickPatientDialog open clinicaId nomeInicial onOpenChange onCreated />`.
  - Formulário com Nome, CPF (com validação `isCPFValido`), Data de nascimento, Telefone, E-mail.
  - Ao salvar: `supabase.from("pacientes").insert({...}).select(...).single()` (mesmo shape usado em `app.agenda.express.tsx`), toast de sucesso e `onCreated(paciente)` retornando um `PatientOption` completo (via `carregarPacienteCompleto` já existente na página, ou consulta direta com os campos que o `PatientSearchInput` espera).
  - Validações simples (nome ≥ 3 chars, CPF válido se informado, e‑mail com formato válido se informado).

- **`src/components/pages/contratos-page.tsx`**
  - Estado `quickCreate: { alvo: "titular" | "dependente"; nome: string } | null`.
  - Nos dois `PatientSearchInput` (titular ~linha 800 e dependente ~linha 945): passar `onRequestCreate={(q) => setQuickCreate({ alvo, nome: q })}`.
  - Renderizar `<QuickPatientDialog>` no final do formulário; no `onCreated(p)`:
    - Se `alvo === "titular"`: `setTitular(await carregarPacienteCompleto(p))`.
    - Se `alvo === "dependente"`: validar duplicidade (mesmas regras já existentes) e `addDep(await carregarPacienteCompleto(p))`.
    - Fechar o modal.

## Regras e restrições

- O paciente é criado sempre na `clinica_id` atual da venda.
- Se a busca original estiver com <2 caracteres, o botão não aparece (mesmo threshold atual do dropdown). O usuário pode digitar o nome que quer cadastrar e depois clicar em "Cadastrar…".
- Nenhum campo obrigatório novo além do Nome — mantém a decisão anterior de deixar e-mail e foto opcionais.
- Sem impacto no `PatientSearchInput` usado nas outras telas (Agenda, NFS-e, etc.): a prop é opcional.

## Detalhes técnicos

- Reusar helpers existentes: `somenteDigitos`, `isCPFValido`, `mostrarErro`, `toast`, `PatientOption` de `@/components/patient-search-input`, `carregarPacienteCompleto` de `contratos-page.tsx`.
- O insert deve incluir apenas campos preenchidos (evitar strings vazias em CPF/telefone/e-mail para não colidir com constraints).
- Após criar, se o botão foi acionado a partir de "dependente", executar as mesmas checagens de duplicidade que hoje já rodam no `onSelect` do `PatientSearchInput` de dependentes.

## Fora de escopo

- Cadastro completo do paciente (endereço, responsável, foto, plano etc.) — segue no cadastro completo em `Clientes`.
- Alterações no `PatientSearchInput` de outras telas.
- Mudanças em RLS/policies de `pacientes`.
