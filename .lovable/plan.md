# Relatório de Levantamento — Cluster A (Divergência GR ↔ Financeiro)

**Modo:** somente leitura. Nenhuma correção proposta. Cinco sintomas mapeados com arquivo:linha e fonte de dados.

## Diagnóstico consolidado

Três divergências estruturais explicam os cinco sintomas:

1. **GR e Financeiro fazem contas em caminhos diferentes.** GR consulta `medico_convenios` ao vivo no momento da impressão e cruza com `fin_lancamentos` (valor efetivamente pago). Financeiro Atendimentos usa um `convenios[]` em memória e o `fin_atendimentos.valor_total` (preço tabelado no cadastro), aplicando `Math.max(base, convenio.valor)` que **infla o total** quando a convenção tem valor maior.
2. **Aba Repasse depende de `medico_procedimentos` já persistido.** Um serviço adicionado só na aba Especialidade fica em estado local; só entra em `medico_procedimentos` ao salvar o formulário — e por isso não aparece automaticamente na aba Repasse.
3. **"Número da GR" no frontend é `via_numero` (1ª/2ª via), não um número sequencial de documento.** O número que a recepção vê como "10 vs 11" é `ficha_numero` — posicional, congelado na primeira impressão, sem log em `audit_log` porque `print-gr.ts` não chama `registrarAcao` e não há gatilho de auditoria confirmado em `gr_impressoes`.

---

## A1 — GR R$ 10,40 vs Financeiro R$ 52,00

**Superfície A (GR):** `src/lib/print-gr.ts:262-596`
- Lê `medico_convenios` ao vivo (l. 469-473, filtro `ativo=true`) + `fin_lancamentos.valor` (valor pago real, l. 314-337)
- Calcula `prestador = Number(conv.valor)` (l. 486) e aplica `Math.min(prestador, valor)` quando não é repasse fixo (l. 509-511)

**Superfície B (Financeiro):** `src/routes/_authenticated/app.financeiro.atendimentos.tsx:509-594` (`calcRepasseFull`)
- Lê `convenios[]` em memória (carregado em `loadOpts` l. 873-900, paginação 1000/chunk)
- Recebe `pago = Number(r.valor_total)` (l. 684) — vem de `fin_atendimentos.valor_total`, que é preço tabelado
- Retorna `total: Math.max(base, Number(c.valor))` (l. 558) → total exibido é o valor da convenção, não o pago

**Divergência:** as duas superfícies leem `medico_convenios`, mas as bases (`fin_lancamentos.valor` vs `fin_atendimentos.valor_total`) e a fórmula (`Math.min` vs `Math.max`) produzem resultados opostos quando a convenção fixa o repasse acima do pago.

**Validação humana necessária:** confirmar qual é o valor "correto" do repasse — o pago (GR) ou o de tabela (Financeiro). Sintoma sugere que GR está certo.

---

## A2 — Serviço em Especialidade não aparece em Repasse

**Superfície:** `src/components/medicos/MedicoFormDialog.tsx:228-315` (useEffect sync) e `:747` (aba Repasse)
- Aba Repasse é derivada reativamente de `form.procedimentos`
- `form.procedimentos` é hidratado de `medico_procedimentos` (l. 453-471) no load
- Serviço adicionado via Especialidades entra em `form.procedimentos` (memória) mas só persiste em `medico_procedimentos` no submit
- `procsFiltradosPorEspecialidade` (l. 177-189) exige `procs` carregado; retorna cedo se `!procs.length` (l. 239)
- Auto-cleanup (l. 211-226) **remove de `form.procedimentos`** qualquer id fora de `idsValidos` — se `procEspMap` recarrega antes do save, o item some silenciosamente

**Divergência:** dependência de ordem de carregamento (`procs` async) + limpeza automática antes do save. Sem persistir, sem aparecer na Repasse.

**Validação humana necessária:** confirmar se o serviço está em `procedimento_especialidades` (join) ou só em `procedimentos.grupo` — decide qual caminho de filtro se aplica.

---

## A3 — Agendamento 09/07 aparece 2× como 08/07 no Financeiro

**Superfície:** `src/routes/_authenticated/app.financeiro.atendimentos.tsx:616-760`
- Faz merge de `fin_atendimentos` (manual) + `fin_lancamentos` (agenda) — l. 617-644
- Dedup (l. 655-681): só suprime `fin_atendimentos` cujo `lancamento_id` bate com um `fin_lancamentos.id` carregado; se `r.lancamento_id IS NULL`, **passa direto**
- Filtro por data: `.gte("data",fIni).lte("data",fFim)` em ambas as tabelas — coluna `data` é a data de pagamento gravada, não `agendamentos.inicio`
- Data exibida (l. 693, 733): `r.data` (`fin_lancamentos.data`)

**Divergência provável:**
- **Duplicação:** `fin_atendimentos` histórico sem `lancamento_id` sobrevive ao dedup ao lado do `fin_lancamentos` novo → 2 linhas.
- **Data 08/07 em vez de 09/07:** consistente com fuso — `inicio` `2026-07-09T03:00Z` renderiza como `2026-07-08` em UTC-3 se `data` foi gravado em UTC no servidor.

**Validação humana necessária:** SELECT em `fin_atendimentos` + `fin_lancamentos` do paciente citado para conferir (a) se há duas linhas, (b) `lancamento_id`, (c) valor bruto de `data` das duas fontes.

---

## A4 — Número na impressão da GR difere da agenda

**Superfície:** `src/lib/print-gr.ts:397-425` (cálculo) + `:634-641` (congelamento) + `src/routes/_authenticated/app.agenda.tsx:1848` (leitura)
- Se `agendamentos.ficha_numero` já existe → reusa (l. 401)
- Senão calcula por rank posicional em `agendamentos` do dia ordenado por `inicio` (l. 403-421)
- Grava de volta com `.is("ficha_numero", null)` (l. 634-641) — congelamento idempotente

**Divergência:** entre agendar e imprimir, qualquer insert/mudança de horário no dia altera o rank posicional. A agenda pode estar mostrando um `ficha_numero` congelado em impressão anterior enquanto a GR nova calcula outro live-rank (janela de corrida antes do freeze).

**Validação humana necessária:** SELECT em `agendamentos` (agenda do dia) confirmando `ficha_numero`, `inicio`, `created_at` e se há reprints prévios.

---

## A5 — GR nº 10 impressa, sistema mostra nº 11, sem auditoria

**Superfície:** `src/lib/print-gr.ts:183-200` (via) + `:625-632` (insert em `gr_impressoes`)
- `via_numero` em `gr_impressoes` **é o número da via física** (1=médico, 2=financeiro), máximo útil 2 — não é o "número da GR"
- Insert grava `clinica_id, agendamento_id, via_numero, impresso_por, impresso_por_nome, ficha_numero` — **não há campo de sequência de GR**
- **Nenhuma chamada a `audit_log`/`registrarAcao`** em `print-gr.ts` — auditoria só existiria via trigger em `gr_impressoes`, não confirmado

**Divergência:** o "10 vs 11" que o usuário vê provavelmente é `ficha_numero` congelado em impressão anterior enquanto o live-rank atual do dia é outro (mesmo mecanismo do A4). E sem chamada a auditoria no fluxo de impressão, nada é registrado do lado do app.

**Validação humana necessária:**
1. Confirmar qual campo o usuário chama de "número da GR" (`ficha_numero`? `gr_impressoes.id`? sequência DB?).
2. Verificar no banco se existe trigger de auditoria em `gr_impressoes`.

---

## Tabela mestre — fonte de verdade por superfície

| Superfície | Tabelas | Onde é calculado |
|---|---|---|
| GR › PRESTADOR | `fin_lancamentos.valor` + `medico_convenios` (live) + RPC `medico_dados_sensiveis` | `print-gr.ts:454-511` |
| Financeiro › valor_medico | `fin_atendimentos.valor_total` ou `fin_lancamentos.valor` + `medico_convenios` (memória) | `app.financeiro.atendimentos.tsx:509-594` |
| Aba Repasse (form médico) | `medico_procedimentos` + `medico_convenios` + `procedimentos` | `MedicoFormDialog.tsx:228-315` |
| GR › ficha | `agendamentos.ficha_numero` (frozen) ou rank live | `print-gr.ts:397-425` |
| GR › via | `gr_impressoes.via_numero` | `print-gr.ts:183-200` |
| Agenda › ficha | `agendamentos.ficha_numero` | `app.agenda.tsx:1848` |

---

## Perguntas em aberto (para próxima etapa, quando você autorizar)

1. Valor real de `fin_atendimentos.valor_total` do registro reclamado no A1.
2. Existência de trigger de auditoria em `gr_impressoes`.
3. Qual campo o usuário identifica como "número da GR" no A5.
4. Fuso do write path de `fin_lancamentos.data` (server function vs insert do cliente).
5. Se `ultrassonografia` está em `procedimento_especialidades` ou só em `procedimentos.grupo`.

**Fim do levantamento.** Aguardando sua ordem para: (a) responder às perguntas em aberto com SELECTs read-only, (b) passar para outro cluster (B/C/D/E), ou (c) autorizar plano de correção do A1.
