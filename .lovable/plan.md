**Tipo do pedido:** regra de negócio + inconsistência de dados no Financeiro/Agenda.

**Diagnóstico confirmado**
- A paciente Raquel está com agendamento em **21/07/2026**.
- O lançamento financeiro vinculado está com `data = 13/07/2026`.
- A tela de **Financeiro > Atendimentos** hoje filtra atendimentos da agenda por `fin_lancamentos.data`, ou seja, pela data do pagamento/lançamento, não pela data marcada na agenda.
- Por isso ela aparece no repasse de 13/07 mesmo estando agendada para 21/07.

**Regra correta a aplicar**
- Atendimento vindo da agenda deve liberar repasse pela **data do agendamento** (`agendamentos.inicio`).
- Se houver reagendamento, o repasse acompanha a **nova data do agendamento**, porque o lançamento continua vinculado ao agendamento novo.
- O fato de estar pago antecipadamente não deve antecipar o repasse médico.

**Plano de correção**
1. **Ajustar a listagem de repasse** em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`:
   - Para registros de origem `agenda`, carregar os lançamentos com vínculo de agenda e usar `agendamentos.inicio::date` como `data` exibida/filtrada.
   - O filtro “De/Até” deve considerar a data marcada da agenda, não a data do lançamento financeiro.
   - Manter atendimentos manuais usando `fin_atendimentos.data`, pois eles não têm agenda vinculada.

2. **Blindar o pagamento do repasse** na função do banco `pagar_repasse_medico`:
   - Antes de marcar o repasse como pago, validar que todos os lançamentos de agenda selecionados pertencem a agendamentos já realizados.
   - Validar também que a data do agendamento não é futura em relação ao dia do repasse informado.
   - Assim, mesmo se alguma tela antiga/cache tentar pagar antes da data correta, o banco bloqueia.

3. **Corrigir o caso já existente da Raquel**:
   - Após a correção, ela deve deixar de aparecer no período 13/07/2026 e aparecer no período 21/07/2026.
   - Não vou apagar pagamento nem agendamento; a correção é de regra de elegibilidade/exibição do repasse.

4. **Validação após implementação**
   - Consultar a mesma paciente no banco para confirmar: lançamento em 13/07, agendamento em 21/07.
   - Conferir que o período 13/07 não lista esse repasse e o período 21/07 lista.
   - Confirmar que o botão de pagamento não consegue pagar repasse de agenda futura/não realizada.

**Impacto esperado**
- Financeiro continua registrando pagamento no dia em que o paciente pagou.
- Repasse médico passa a ser controlado pelo dia do atendimento marcado/realizado.
- Reagendamentos passam a mover automaticamente a competência do repasse para a nova data.