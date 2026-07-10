## Diagnóstico — o que aconteceu com a ficha 185

**Rastreamento do agendamento (id `ed231b94…`, dra. Roberta, 10/07/2026 09:10):**

1. O horário nasceu como **slot genérico** ("SLOT GERADO AUTOMATICAMENTE"), com `paciente_nome = "DISPONIVEL"` e `procedimento = "RISCO CIRURGICO"` (rótulo do slot).
2. Quando a recepção atribuiu a paciente MARIA SELMA ao slot, o `paciente_id` foi preenchido — porém o campo `procedimento` foi **zerado (NULL)** no mesmo UPDATE. É por isso que a coluna "Serviço" na agenda ainda mostra "RISCO CIRURGICO" (vem do label do slot), mas no banco não há procedimento vinculado.
3. Às 11:52 a recepcionista (EDNALDA) cobrou R$ 110,00 em dinheiro. O `fin_lancamentos` gerado ficou:
   - `descricao = "MARIA SELMA FERNANDES SANTOS — CONSULTA"` (fallback genérico porque `agendamentos.procedimento` estava NULL).
   - `agendamento_id` correto (Roberta).
   - **`medico_id` = CLAUDIA MARIA** (não Roberta). Fonte do erro: o caminho de cobrança usado não copiou o médico do agendamento; algum campo de médico foi preenchido/mantido de outra tela.
4. A guia impressa (2ª via, 16:11) exibiu "CARDIOLOGIA – CONSULTA" porque a rotina de impressão monta o texto com a **especialidade da médica** (`CARDIOLOGIA`, vinda de Roberta) + o `procedimento`/fallback (`CONSULTA`). Ou seja: a GR imprimiu como se estivesse tudo certo, mas o dado do médico no lançamento não bate.
5. Em **Financeiro > Atendimentos** a linha existe (é a `002 · R$ 110,00`), mas aparece atribuída a **CLAUDIA MA…** e sem serviço — por isso passa despercebida. Efeito colateral: o **repasse médico** dessa consulta iria para a profissional errada.

Resumo: o pagamento está registrado, só que com **médico errado** e **serviço genérico**, e por isso não é reconhecido como o atendimento da Roberta na tela de Atendimentos.

## Plano de correção

### 1. Corrigir o registro atual (dados)

Migração pontual (`supabase/migrations/…_fix_ficha_185_maria_selma.sql`):
- `UPDATE fin_lancamentos SET medico_id = '<Roberta>', descricao = 'MARIA SELMA FERNANDES SANTOS — CARDIOLOGIA - CONSULTA' WHERE id = '8f18613f-785f-416c-9eb0-dc149b9b2e48'`.
- `UPDATE agendamentos SET procedimento = 'CONSULTA (CARDIOLOGIA)' WHERE id = 'ed231b94-a70a-43df-9bee-cfa90fcf935a'` (garante que uma futura reimpressão/relatório mostre o serviço certo).

### 2. Prevenir — não deixar `agendamentos.procedimento` ser zerado ao ocupar slot

`src/routes/_authenticated/app.agenda.tsx` (fluxos que trocam "DISPONIVEL" por paciente real):
- No UPDATE do agendamento, remover o campo `procedimento` do payload quando o valor novo seria NULL/vazio, preservando o que já estava lá.
- Se o rótulo do slot for genérico (ex.: "RISCO CIRURGICO", "DISPONIVEL"), abrir um seletor obrigatório de procedimento antes de salvar (usando `medico_procedimentos` da médica; se houver um único, seleciona automaticamente).

### 3. Prevenir — cobrança nunca cria lançamento com médico "solto"

`src/components/financeiro/lancamento-dialog.tsx` e caminhos de cobrança em `app.agenda.tsx`:
- Quando `agendamentoId` está setado, `medico_id` do `fin_lancamentos` deve ser SEMPRE `agendamento.medico_id`. Congelar o campo de médico no diálogo (readonly) e sobrescrever no `insert` mesmo que o usuário tenha mexido em outro lugar da UI.
- Se `agendamento.procedimento` estiver NULL no momento do pagamento, **exigir** escolha de procedimento antes de confirmar (com pré-seleção baseada em `medico_procedimentos`). Nunca gravar descrição com fallback `"CONSULTA"` num lançamento pago.
- Após o insert, propagar de volta o procedimento escolhido para `agendamentos.procedimento` (mantém consistência entre agenda, GR e repasse).

### 4. Auditoria mínima em `fin_lancamentos`

Hoje `audit_log` só cobre `agendamentos` — por isso não conseguimos rastrear a origem do `medico_id = Claudia`. Adicionar trigger `AFTER INSERT/UPDATE/DELETE` em `fin_lancamentos` gravando `user_email`, `dados_antes`, `dados_depois` (mesmo padrão dos triggers existentes). Isso permite investigar rapidamente casos parecidos no futuro.

### Detalhes técnicos (para revisão)

- Ids envolvidos: agendamento `ed231b94-a70a-43df-9bee-cfa90fcf935a`; lançamento `8f18613f-785f-416c-9eb0-dc149b9b2e48`; médica correta Roberta `0e7c549d-d5a0-4e4e-92e8-8994a46494e3`; médica gravada errada Claudia `76f64b9b-148e-4da8-8964-55f2433fc1ad`; paciente `c88a9c7f-1359-41e3-b114-01d8248296e0`.
- Nenhuma linha em `fin_atendimentos` foi criada — a página Financeiro > Atendimentos une `fin_atendimentos` + `fin_lancamentos` (agenda). Portanto a linha existe, mas com atribuição errada.
- A migração é apenas UPDATE em duas linhas — reversível manualmente se necessário.

### Fora de escopo (proposto não fazer agora)

- Recalcular repasses históricos de outros lançamentos (só se você pedir, depois de rodar o item 4 e investigar).
- Renomear o slot "RISCO CIRURGICO" no cadastro da agenda — é decisão de negócio.