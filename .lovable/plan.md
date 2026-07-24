## Contexto (verificado)

Comparando as duas GRs enviadas:

- **Impressão original** (foto 2 — Quédima) mostra a linha `USUÁRIO: QUÉDIMA SUELEN` logo após o VENCIMENTO.
- **Reimpressão** (foto 1 — Stella) **não mostra** a linha `USUÁRIO`. O restante do layout já é igual, e o rodapé de reimpressão já está correto.

Em `src/lib/print-gr.ts` (função `printGuiaMensalidadeCore`, linhas ~1314–1465) o template usa:

```
${usuarioFinalNome ? `<tr>...USUÁRIO: ${esc(usuarioFinalNome)}...</tr>` : ""}
```

E `usuarioFinalNome = usuarioNome ?? primeiraVia?.impresso_por_nome`.

Na chamada de reimpressão (`contratos-page.tsx` linha ~3229) só é passado `reimpressoPorNome`/`reimpressoPorId` — não vai `usuarioNome`. Portanto o valor exibido depende de `gr_impressoes.impresso_por_nome` da 1ª via. Quando o pagamento é antigo (contratos migrados / feitos antes de o sistema começar a gravar esse campo) a linha some.

**Diagnóstico:** falta um fallback quando `gr_impressoes` não tem o nome — nesse caso podemos buscar quem lançou o pagamento pela `contrato_mensalidades.lancamento_id → fin_lancamentos.criado_por → profiles.nome`.

## Escopo

- Só front-end / lib de impressão. Sem mudança de banco ou de regra de negócio.
- Aplica-se apenas à **GR de mensalidade** (que é o caso das fotos). A GR de atendimento e a agrupada não estão em discussão.
- Clínica-alvo: correção puramente técnica (bug de exibição). Ajuste global salvo se você preferir aplicar por clínica — me avise nesse caso.

## O que muda

Em `src/lib/print-gr.ts`, dentro de `printGuiaMensalidadeCore` (e replicado para `printGuiaMensalidadeComTaxaCore`, que compartilha o mesmo template):

1. Depois de calcular `usuarioFinalNome = usuarioNome ?? primeiraVia?.impresso_por_nome`, se ainda estiver vazio, buscar via `contrato_mensalidades.lancamento_id`:
   - `select criado_por from fin_lancamentos where id = <lancamento_id>`
   - depois `select nome from profiles where id = <criado_por>`
   - usar esse nome como `usuarioFinalNome`.
2. Se mesmo assim continuar nulo, manter comportamento atual (linha oculta) — não inventar nome.
3. O rodapé de reimpressão (`*** 2ª VIA — REIMPRESSÃO *** / REIMPRESSO POR / EM …`) continua idêntico.

Resultado: a reimpressão terá exatamente o mesmo miolo da 1ª via (incluindo o `USUÁRIO:` correto do operador que faturou), acrescido do bloco de reimpressão no rodapé.

## Validação

- Reimprimir a GR do contrato da Stella (#20261926) e conferir que aparece `USUÁRIO: <nome de quem faturou>` acima do bloco QTD/DESCRIÇÃO, mantendo o rodapé de reimpressão.
- Reimprimir uma GR recente (que já tenha `impresso_por_nome` gravado) para garantir que o comportamento não regride.

## Pendências / confirmação

- Confirme que quer aplicar **global** (todas as clínicas). Como é bug de exibição sem regra de negócio, minha recomendação é global; se preferir só Menino Jesus, me diga.
