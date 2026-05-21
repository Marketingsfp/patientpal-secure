## Adicionar menu no avatar do header com "Alterar senha"

### Mudanças em `src/components/app-shell.tsx`

1. Envolver o círculo com a inicial (avatar no header) em um `DropdownMenu` (shadcn).
2. O menu terá os itens:
   - **Alterar senha** — abre um `Dialog` com dois campos (Nova senha, Confirmar nova senha) e botão "Salvar".
   - **Sair** — chama `handleSignOut` (substitui o botão de logout atual ao lado do nome, que pode ser removido para evitar duplicidade).
3. Adicionar estado `pwOpen`, `pwNew`, `pwConfirm`, `pwSaving`.
4. Ao salvar:
   - Validar `pwNew.length >= 6` e `pwNew === pwConfirm`.
   - Chamar `supabase.auth.updateUser({ password: pwNew })`.
   - Mostrar `toast.success` ou `toast.error`.
   - Fechar o dialog e limpar campos.

### Sem mudanças

- Lógica de auth, rotas, ou outros componentes.
- Apenas adições de UI no header.
