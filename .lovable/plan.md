## Ajuste

Mover **Comprovantes** do submenu lateral do Financeiro para uma aba na parte superior da tela de Atendimentos, ao lado do título "Atendimentos" (marcado com X na imagem).

## Como fica

Na tela `/app/financeiro/atendimentos`, no topo, aparecerão duas abas:

```
[ Atendimentos ]  [ Comprovantes ]
```

- **Atendimentos** — conteúdo atual, sem qualquer alteração.
- **Comprovantes** — a listagem de repasses pagos (já implementada), agora renderizada dentro da mesma rota como aba.

O conteúdo da aba Comprovantes é exatamente o que já foi construído: lista agrupada por médico + data de pagamento, com botões Visualizar e Imprimir 2ª via.

## Alterações técnicas

- `src/routes/_authenticated/app.financeiro.tsx`
  Remover o item **Comprovantes** do submenu lateral (fica só Atendimentos, Estorno, etc. como antes).
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx`
  Adicionar um seletor de abas (Tabs shadcn) no topo. Aba 1 = conteúdo atual; aba 2 = componente `ComprovantesTab` importado do novo arquivo.
- `src/routes/_authenticated/app.financeiro.comprovantes.tsx`
  Deixar de ser uma rota. Transformar em componente exportado `ComprovantesTab` (mesmo código já pronto, sem `createFileRoute`) para ser usado como conteúdo da aba. A URL `/app/financeiro/comprovantes` deixa de existir.

## Nada muda

- Regras de negócio, dados, agrupamento, impressão, permissões e RLS permanecem iguais.
- A aba Atendimentos continua funcionando como hoje.
- O comportamento e o layout do comprovante (2ª via) já validados não mudam.

## Validação

- Abrir `/app/financeiro/atendimentos` → ver as duas abas no topo.
- Clicar em Comprovantes → ver a lista de repasses pagos.
- Voltar em Atendimentos → tudo funcionando normalmente.
- Confirmar que Comprovantes não aparece mais no menu lateral do Financeiro.