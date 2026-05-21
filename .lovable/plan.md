## Problema

A tela está lenta/travando porque `src/components/app-shell.tsx` quebra a regra dos Hooks do React:

- Linha 237: `if (loading || !user) return <…>Entrando…</…>` (early return)
- Linha 254: `useEffect(..., [clinicColor])` é chamado **depois** do early return

Quando `loading`/`user` mudam entre renders, a quantidade de hooks chamados muda → React lança "Rendered more hooks than during the previous render" → cai no error boundary e dá impressão de lentidão/tela travada.

## Correção (apenas 1 arquivo)

`src/components/app-shell.tsx`:

1. Mover o cálculo de `clinicColor` para **antes** do `if (loading || !user) return …`, usando `useMemo` para manter referência estável.
2. Mover o `useEffect([clinicColor])` que aplica as variáveis CSS (`--primary`, `--ring`, `--sidebar-primary`, `--primary-foreground`) para **antes** do mesmo early return.
3. Manter `initial` onde está (não é hook).
4. Não alterar nenhuma outra lógica, dados, estilos ou backend.

Resultado: a contagem de hooks fica constante em todos os renders, o erro some e a navegação volta a ficar fluida.

## Fora de escopo

- Telas de perfis/permissões
- Banco de dados
- Qualquer outra refatoração de performance
