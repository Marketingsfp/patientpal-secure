## Fechar caixa de outros operadores (admin/gestor)

Adicionar, na aba **"Todos (Financeiro)"** da tela Caixa, um botão **"Fechar"** por linha — visível apenas para admin/gestor e apenas em sessões com status `aberto`. Permite ao gestor encerrar sessões que operadores esqueceram de fechar.

**RLS já permite:** as policies `cx_sess_update` e `caixa_movimentos_*` liberam `can_manage_clinica(auth.uid(), clinica_id)`, então não são necessárias mudanças de banco.

## Fluxo

1. Na tabela "Todos (Financeiro)", cada linha `status=aberto` ganha um botão **"Fechar"** (ícone cadeado).
2. Ao clicar, abre um diálogo mostrando:
   - Operador, abertura, saldo **calculado** da sessão
   - Campo **"Valor informado"** (default = saldo calculado)
   - Campo **"Observação"** (obrigatório — ex.: "Fechado pelo gestor Fulano")
3. Ao confirmar:
   - `UPDATE caixa_sessoes` da sessão-alvo: `status='fechado'`, `fechado_em=now()`, `valor_fechamento_informado`, `valor_fechamento_calculado`, `diferenca`, `observacoes` (prefixadas com `[FECHADO PELO GESTOR <nome>]`).
   - `INSERT caixa_movimentos` tipo `fechamento` na sessão, com `user_id` do **operador dono** (para manter integridade do saldo) e descrição contendo o gestor responsável.
   - Toast de sucesso e `loadTodos()` para recarregar.

## Detalhes técnicos

- Arquivo único: `src/routes/_authenticated/app.caixa.tsx`.
- Novo estado: `fecharAlheia: Sessao | null`, `valorInformadoAlheia`, `obsFecharAlheia`, `savingAlheia`.
- Nova função `fecharCaixaAlheia(s: Sessao)` — espelha `fecharCaixa`, mas usa `s.id` / `s.user_id` e não imprime comprovante (opcional: reaproveitar `printComprovanteCaixa` marcando operador dono + "fechado por gestor").
- Botão renderizado dentro da última `TableCell` da linha (ao lado do olho de detalhe), condicional a `s.status === 'aberto'`.
- Nada de mudança em `caixa-shell` (fluxo v1 apenas).

## Verificação

1. Logar como admin, abrir **Caixa → Todos (Financeiro)**.
2. Confirmar que sessões abertas de outros operadores mostram o botão "Fechar".
3. Fechar uma sessão de teste, informar valor e observação, confirmar.
4. Verificar que a linha passa para status `fechado`, com valores preenchidos e observação contendo o nome do gestor.
5. Confirmar que operadores comuns (recepção/caixa) continuam sem enxergar a aba nem o botão.