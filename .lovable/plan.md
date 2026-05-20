Trocar o e-mail por **nome do usuário** no pop-up de Auditoria.

## Mudanças

**`src/routes/_authenticated/app.agenda.tsx`**

1. Em `abrirAuditoria`, também chamar `carregarEquipe()` para garantir que `equipeList` (que já traz `{ nome, email }` via `listarEquipe`) esteja carregado.
2. No render do Dialog de auditoria, construir um `Map<email, nome>` a partir de `equipeList` e exibir:
   - `nome` quando houver correspondência por `user_email`;
   - `r.user_email` como fallback;
   - `"—"` quando ambos forem nulos.

Sem mudanças de banco — o nome vem do `profiles` via a função `listarEquipe` já existente.
