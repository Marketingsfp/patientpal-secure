## Objetivo

Mostrar, na tela **Financeiro → Estorno**, o nome do usuário que **solicitou** o estorno (e também quem **resolveu**, quando já aprovado/recusado), em vez de apenas o horário.

## Onde mudar

Apenas 1 arquivo: `src/routes/_authenticated/app.financeiro.estorno.tsx`.

## Como fica

Coluna **"Solicitado"** passa a exibir:

```
09/07/2026, 12:08:33
por Maria Recepção
```

E, quando a linha estiver **Aprovada** ou **Recusada**, logo abaixo do bloco "Resolvido em …" aparece também:

```
Resolvido em 09/07/2026, 12:15
por João Financeiro
```

Se o nome do usuário não for encontrado, mostra "—" (sem quebrar nada).

## Detalhe técnico

- Após carregar as solicitações, coletar os UUIDs distintos de `solicitado_por` + `resolvido_por` e buscar em uma única query `profiles (id, nome)` — guardado num `Map<id, nome>`.
- Renderizar `nomes.get(s.solicitado_por) ?? "—"` na coluna Solicitado e o mesmo para `resolvido_por` na coluna Motivo (onde já mostramos "Resolvido em …").
- Sem alterações de banco, sem alterações de regra de negócio, sem mexer em outras telas.

## Fora do escopo

- Não altero fluxo de aprovação/recusa, nem o diálogo de solicitação (`SolicitarEstornoDialog`), nem o sininho (`EstornosBell`).
- Não crio filtro por solicitante agora — posso adicionar num próximo passo se quiser.
