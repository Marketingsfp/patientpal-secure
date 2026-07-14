## Objetivo

Deixar o **Histórico do agendamento** (modal aberto pelo ícone de escudo na agenda) claro sobre **quem fez o quê**, em vez de mostrar "Alterou / Registro criado" com nomes de coluna crus. Todas as ações da linha do tempo devem descrever a operação em linguagem de recepção.

## Escopo (o que muda)

Um único arquivo: `src/routes/_authenticated/app.agenda.tsx`, dentro do modal `Histórico` (linhas 4895-5010) e da função `abrirAuditoria` (linhas 1081-1124). Não mexo em banco, RLS, triggers nem em outros modais nesta rodada.

## 1. Ações compostas legíveis a partir do `audit_log`

Hoje: UPDATE de agendamento imprime `observacoes: SLOT GERADO... → SLOT GERADO...`, `paciente_id: — → uuid`, `paciente_nome: DISPONÍVEL → NOME`. O usuário vê "Alterou" sem entender o que aconteceu.

Passa a **classificar** cada linha do audit em uma dessas ações, com rótulo e descrição amigáveis:

| Diferença detectada em `dados_antes` → `dados_depois` | Rótulo exibido |
| --- | --- |
| `paciente_nome`: DISPONÍVEL → nome (e `paciente_id`: null → uuid) | **Agendou o paciente** — mostra nome |
| `paciente_nome`: nome → DISPONÍVEL (e `paciente_id`: uuid → null) | **Liberou o horário** — mostra paciente removido |
| `inicio`/`fim` mudou com paciente alocado | **Reagendou** — mostra "de X para Y" |
| `fluxo_etapa` → `aguardando_atendimento` (ou nome usado no banco) | **Fez check-in** |
| `fluxo_etapa` → `em_atendimento` | **Iniciou o atendimento** |
| `status` → `confirmado` | **Confirmou o agendamento** |
| `status` → `realizado` | **Marcou como realizado** |
| `status` → `cancelado` | **Cancelou o agendamento** |
| `data_pagamento`: null → data | **Registrou o pagamento** |
| `observacoes` (mudança pura de texto, sem outros campos relevantes) | **Alterou observação** — antes/depois |
| Qualquer outro UPDATE residual | Cai no formato genérico atual, mas com **rótulos amigáveis** por coluna (Paciente, Profissional, Horário, Status, Observações, Etapa do fluxo). Nunca mais mostra `paciente_id` (redundante com `paciente_nome`), `agenda_id`, `token_publico`, `atendimento_grupo_id`, `fluxo_atualizado_em`. |

Para o **INSERT do agendamento**:
- Se `paciente_nome` inicial é "DISPONÍVEL" (ou null) → **"Gerou o slot da agenda"**. Isso resolve o caso do Luan.
- Se já vem com paciente → **"Agendou o paciente"** direto.

Para o **INSERT de `fin_lancamentos`** (já implementado): mantém "Pagamento registrado — repasse pendente/pago".

Valores de status/etapa também são traduzidos em português quando aparecem crus (`aguardando_recepcao` → "Aguardando recepção" etc.).

## 2. Estorno entra no histórico

Hoje: se Amanda solicitou e Jean aprovou o estorno, isso não aparece no histórico do agendamento — só o `UPDATE` no lançamento. Precisamos mostrar duas linhas específicas.

Em `abrirAuditoria` acrescento uma terceira consulta:

```
supabase.from("estorno_solicitacoes")
  .select("id, status, motivo, resposta, solicitado_por, solicitado_em, resolvido_por, resolvido_em")
  .or(`agendamento_id.eq.${a.id},lancamento_id.in.(${lancIds.join(",")})`)
```

Cada solicitação vira **até duas entradas** na timeline:

- `Solicitou estorno` — em `solicitado_em`, autor = nome de `solicitado_por`, corpo mostra o motivo digitado.
- `Aprovou estorno` / `Rejeitou estorno` / `Cancelou estorno` — em `resolvido_em`, autor = nome de `resolvido_por`, corpo mostra a resposta (quando houver).

Assim o caso do print fica: linha "Amanda — Solicitou estorno" seguida de "Jean — Aprovou estorno".

## 3. Resolver nomes por uuid, não só por email

Hoje só resolve email → nome via `equipeList` (funcionários + médicos). O estorno guarda `uuid`, não email. Amplio o mapa:

- Além do `nomePorEmail` atual, monto `nomePorUserId` a partir de `equipeList` (já traz `id`/`user_id` de médicos e funcionários) e, se faltar, faço uma consulta única em `profiles` pelos uuids que aparecerem em estornos.
- Fallback: quando não achar, exibe "Usuário (…últimos 6 chars do uuid)" em vez do uuid inteiro.

Também aproveito para exibir na coluna "Quem" o **cargo** entre parênteses quando conhecido (médico / funcionário), como o modal `historico-atendimento-dialog.tsx` já faz — assim fica óbvio se foi médico ou recepção que deu baixa.

## 4. Coluna "Alterou / Criou" vira ação semântica

Hoje o badge diz apenas "Alterou" (amarelo) ou "Criou" (verde). Passo a exibir o rótulo da ação detectada acima (ex.: **Check-in**, **Pagamento**, **Reagendou**, **Estorno solicitado**, **Estorno aprovado**), mantendo cores:

- verde: criações, pagamento, check-in, atendimento realizado, estorno aprovado
- âmbar: alterações neutras, reagendou, alterou observação
- rosa: cancelamento, liberação, estorno rejeitado
- azul: notas manuais (já existente)
- roxo: estorno solicitado, para diferenciar do aprovado

## Fora de escopo

- Não crio nova coluna no banco nem novos triggers de audit.
- Não altero o modal `historico-atendimento-dialog.tsx` (aba Financeiro > Atendimentos) — se você quiser esse mesmo nível de detalhe lá, é próxima rodada.
- Não altero permissões/RLS.

## Riscos e mitigação

- **Risco:** algum UPDATE do agendamento pode conter combinação inesperada de campos e cair na regra genérica. **Mitigação:** o fallback continua funcionando (mostra colunas com rótulos amigáveis), então nunca fica pior do que hoje.
- **Risco:** nomes de valores do `fluxo_etapa`/`status` no banco não baterem com o que assumi. **Mitigação:** vou olhar em runtime via `psql` antes de codificar o mapa para não inventar rótulo errado.

## Validação

1. Typecheck do arquivo alterado.
2. Abrir o mesmo agendamento do print (SIMONE SUELY, 14/07 13:50) e conferir:
   - Linha do Luan aparece como "Gerou o slot da agenda", não "Registro criado".
   - Linhas de Amanda/Jean sobre o estorno aparecem como "Solicitou estorno" / "Aprovou estorno" com os nomes certos.
   - As duas linhas "Alterou" com `paciente_id`/`paciente_nome`/`observacoes` colapsam em uma única "Agendou o paciente SIMONE SUELY" (ou "Reagendou de … para …") — sem coluna `paciente_id` crua na tela.
3. Abrir um agendamento com pagamento realizado e conferir que aparece "Registrou o pagamento" com o nome de quem deu baixa.
4. Abrir um agendamento com check-in e conferir "Fez check-in" com o nome da recepção.
