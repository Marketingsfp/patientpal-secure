## Diagnóstico

Os botões (Prioridade, Avançar, Voltar, Finalizar, Chamar) **executam** no banco — a atualização acontece e o toast aparece. O problema é que **a tela não reflete a mudança**, dando impressão de "não fez nada".

Causa raiz confirmada por consulta ao banco:

1. A tabela `agendamentos` **não está na publicação `supabase_realtime`** (`SELECT ... FROM pg_publication_tables WHERE tablename='agendamentos'` retorna 0 linhas).
2. `REPLICA IDENTITY` está em `d` (default), o que também prejudica o payload de UPDATEs no realtime.
3. O componente `/app/fluxo` depende exclusivamente do canal realtime para redesenhar após cada ação (`setEtapa` e `ciclarPrioridade` não chamam `carregar()` no sucesso). Sem eventos realtime → nada muda na tela até um refresh manual.

Isso também explica o replay recente: dois toasts "Prioridade: urgente" seguidos, sem o badge do card mudar de cor.

## Correção

### 1. Migration — habilitar realtime para `agendamentos`
```sql
ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
```
(Verificar antes se já não está publicada por outro caminho; ignorar erro `already member of publication`.)

### 2. Defense-in-depth em `src/routes/_authenticated/app.fluxo.tsx`
Mesmo com realtime funcionando, o UI deve responder na hora ao clique — não esperar o round-trip do websocket. Ajustes:

- `setEtapa(id, etapa)`: após sucesso, atualizar `ags` localmente (`setAgs(prev => prev.map(...))`) para feedback imediato.
- `ciclarPrioridade(a)`: idem, atualizar `prioridade` no estado local no sucesso.
- `chamarPaciente(a)`: já move etapa via `setEtapa` — herda o mesmo fix.
- Se a resposta do Supabase vier com `error`, reverter/recarregar via `carregar()`.

Isso torna a tela robusta mesmo se realtime cair de novo no futuro.

### 3. Validação
- Rodar Playwright em `/app/fluxo` na clínica de teste:
  - clicar Prioridade → badge muda de cor imediatamente + linha no DB atualizada.
  - clicar Avançar → card salta de coluna sem refresh manual.
  - clicar Voltar → card volta uma coluna.
  - clicar Finalizar em Atendimento → card vai para Finalizado.
  - clicar Chamar em Triagem → card vai para Atendimento + linha em `senhas`.
- Confirmar no console que evento `postgres_changes` chega (log temporário durante teste).
- Screenshot antes/depois de cada ação em `/tmp/browser/fluxo-fix/`.

## Escopo
- 1 migration curta.
- Edição de `src/routes/_authenticated/app.fluxo.tsx` (apenas dentro dos handlers `setEtapa` e `ciclarPrioridade`).
- Nenhum outro arquivo tocado.