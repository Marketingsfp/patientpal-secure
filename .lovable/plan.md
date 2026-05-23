## Objetivo

Em `src/routes/_authenticated/app.agenda.tsx`, adicionar uma nova ação no menu **Opções (N)** chamada **"Excluir horários selecionados"**, habilitada apenas quando houver agendamentos selecionados e visível apenas para perfis autorizados.

## Mudanças

### 1. Gating por perfil

Seguir o padrão já usado em `app.caixa.tsx`:

```ts
const isManager = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";
```

Apenas **admin** e **gestor** verão o item de exclusão. Os demais perfis (recepção, médico, enfermagem etc.) continuam vendo somente "Cobrar selecionados".

### 2. Novo item no DropdownMenu (linhas ~841-845)

Adicionar abaixo de "Cobrar selecionados":

- Separador (`DropdownMenuSeparator`).
- `DropdownMenuItem` com texto **"🗑️ Excluir horários selecionados"**, em estilo destrutivo (`text-destructive focus:text-destructive`).
- Renderizar somente quando `isManager` for true.
- `onClick` chama um novo handler `excluirSelecionados()`.

O botão "Opções" já fica desabilitado quando `selecionados.size === 0`, então o requisito de "habilitar somente com seleção" já está coberto — o novo item herda esse comportamento.

### 3. Handler `excluirSelecionados`

Novo handler na página, semelhante ao `cobrarSelecionados` existente:

1. Pegar `ids = Array.from(selecionados)`.
2. Validar que não há nada com `status` diferente de `agendado` / paciente diferente de "DISPONÍVEL" — para evitar excluir consultas já realizadas/pagas. Regra proposta:
   - Permitir excluir apenas linhas onde `paciente_nome === "DISPONÍVEL"` **ou** `status === "agendado"` sem `pagamento_id`.
   - Se algum item da seleção não puder ser excluído, mostrar `toast.error` listando quantos foram bloqueados e abortar.
3. `window.confirm(`Excluir ${ids.length} horário(s)? Esta ação não pode ser desfeita.`)`.
4. `await supabase.from("agendamentos").delete().in("id", ids)`.
5. Em sucesso: `toast.success`, limpar `selecionados` (`setSelecionados(new Set())`) e recarregar a lista (mesmo `load()`/refetch usado pelos outros handlers da página).
6. Em erro: `toast.error(error.message)`.

### 4. Sem mudanças de backend

A tabela `agendamentos` já tem RLS aplicada por clínica/perfil — admins e gestores já podem deletar. Não é necessária nova migration nem alteração de policies.

## Fora de escopo

- Não mexer no fluxo de "Cobrar selecionados".
- Não alterar o layout das colunas Alertas/Ações.
- Não criar tela de gerenciamento de permissões — apenas reaproveitar o `role` já existente em `clinicaAtual`.
