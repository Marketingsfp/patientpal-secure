## Simulação — 5 agendamentos com pagamento + verificação no Check-in

### Dados de base (clínica POLICLINICA MENINO JESUS)
- **Clínica:** `7570ddde-…-a6c940` (POLICLINICA MENINO JESUS)
- **Pacientes reais existentes:** JOAO PEDRO NEVES CANTARELA, QA CODEX PACIENTE 01072026, e 3 outros pacientes reais do topo da lista (evito nomes-lixo `"___"`, `"@#$%"` etc.)
- **Médicos reais existentes:** SUELY MARTINS DA SILVA, CARLOS ALBERTO OLIVERO VARILLAS, JEAN FERREIRA CAMPOS, RAFAEL SOARES MONTEIRO DE BARROS, ELETROCARDIOGRAMA (recurso técnico)

### Grade proposta (5 agendamentos, dias/horários variados)

| # | Dia | Horário (BRT) | Paciente | Médico | Procedimento | Valor |
|---|---|---|---|---|---|---|
| 1 | Hoje | 09:00 | JOAO PEDRO NEVES CANTARELA | SUELY MARTINS DA SILVA | Consulta | R$ 150 |
| 2 | Hoje | 14:30 | QA CODEX PACIENTE 01072026 | CARLOS ALBERTO OLIVERO VARILLAS | Consulta | R$ 200 |
| 3 | Amanhã | 10:15 | (3º paciente real) | JEAN FERREIRA CAMPOS | Consulta | R$ 180 |
| 4 | +2 dias | 16:00 | (4º paciente real) | RAFAEL SOARES MONTEIRO DE BARROS | Consulta | R$ 220 |
| 5 | +7 dias | 08:45 | (5º paciente real) | ELETROCARDIOGRAMA | Eletrocardiograma | R$ 120 |

Todos com `duracao = 15 min`, `status = 'agendado'`, `fluxo_etapa = 'aguardando_recepcao'` (que é a etapa que a tela Check-in filtra).

### O que será inserido no banco
Para cada linha da tabela:
1. `INSERT` em `agendamentos` (clinica, paciente_id, medico_id, paciente_nome, inicio, fim, procedimento, status=`agendado`, fluxo_etapa=`aguardando_recepcao`).
2. `INSERT` em `fin_lancamentos` (tipo=`receita`, status=`confirmado`, `agendamento_id` apontando para o item 1, valor, forma_pagamento=`dinheiro`, data = hoje). É essa linha que marca "pago = true" no Check-in (query em `app.checkin.tsx` linha 92-99).

Nenhuma alteração de schema, apenas inserção de dados de teste — via ferramenta de insert.

### Verificação no Check-in
Depois de inserido:
1. Rodo uma consulta SQL confirmando que os 5 registros existem, com `fluxo_etapa = 'aguardando_recepcao'` e um `fin_lancamentos` receita associado (=> aparecerá com badge "PAGO").
2. Abro Playwright, autentico com sua sessão, navego para `/app/checkin`, mudo o seletor de data para **hoje** e tiro screenshot. Devo ver os 2 agendamentos de hoje (Joao Pedro 09:00 e QA Codex 14:30) listados com indicador de pagamento.
3. Mudo o seletor para amanhã e tiro outro screenshot para confirmar o 3º agendamento.
4. Reporto: URL, screenshots, e status ("aparece / não aparece") de cada um dos 5.

### Reversão
Ao final, te entrego a lista dos 5 `agendamento_id` gerados. Se você quiser limpar depois, é só me pedir e eu removo em uma passada (deleta os `fin_lancamentos` e depois os `agendamentos`).

### Ponto de atenção
Os pacientes "QA CODEX PACIENTE 01072026" e outros da lista são pacientes reais do seu banco. Se preferir que eu **crie 5 pacientes fictícios novos** ("PACIENTE TESTE 01", "…02" etc.) para deixar claro que são simulação e facilitar a limpeza, me avisa antes de aprovar que ajusto o plano.