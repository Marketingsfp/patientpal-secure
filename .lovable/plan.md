## Problema

Na tela **Editar funcionário → aba "Login e perfil"**, hoje só aparece o e-mail e o botão "Trocar senha". Não existe campo para alterar o **perfil de acesso** (admin, gestor, médico, enfermeiro, recepção, financeiro) de um funcionário já cadastrado.

A função de servidor `editarMembro` em `src/lib/equipe.functions.ts` já aceita mudança de `role` — só falta expor na UI.

## Alteração (apenas 1 arquivo)

`src/components/funcionarios/FuncionarioFormDialog.tsx`

1. Ao abrir em modo edição, buscar também o membership atual do usuário na clínica:
   ```
   supabase.from("clinica_memberships")
     .select("id, role, ativo")
     .eq("clinica_id", clinicaId)
     .eq("user_id", editingUserId)
     .maybeSingle()
   ```
   Guardar `membershipId`, `perfilAtual`, `ativoAtual` no estado. Preencher `form.perfil` com o role atual.

2. Na aba **"Login e perfil"**, no ramo `isEditingExisting`, adicionar antes do bloco de senha:
   - Select "Perfil de acesso" usando a mesma lista `PERFIS` (adicionar `caixa` para bater com os roles aceitos pelo servidor).
   - Bind: `form.perfil` ↔ `setForm({...form, perfil: v})`.

3. No `salvar()`, quando `editingUserId && membershipId` e o perfil mudou em relação ao carregado, chamar `editarMembro`:
   ```
   await editarMembroFn({ data: {
     clinicaId, membershipId,
     role: form.perfil, ativo: ativoAtual,
   }})
   ```
   Encaixar entre o update de `hr_contratos` e o update de `profiles`, tratando erro com `mostrarErro`.

4. Importar `editarMembro` e criar `const editarMembroFn = useServerFn(editarMembro)`.

Nada mais muda: aba "Dados", trocar senha, criação de novo funcionário e telas fora dessa continuam iguais.

## Fora de escopo

- Não altero `equipe.functions.ts` (já tem tudo).
- Não altero a lista de funcionários nem a rota.
- Não mexo em RLS/migrations.
