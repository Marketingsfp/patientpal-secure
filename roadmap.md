# Roadmap

## Em andamento
- [x] FASE 4 — tirar Inbox/eventos/contadores/espera do caminho crítico da mensagem
- [ ] FASE 4 — agendar em segundo plano a regra de espera de 30 minutos (rota `/api/public/nina/espera-timeout`)

## Fila
- [x] Aplicar a migração do relatório "Marcações por atendente" exatamente como enviada (índice + `rel_marcacoes_por_atendente`)
- [ ] API integração v1.3 — defeito 1: deduzir procedimento no servidor + código `procedure_not_resolved`
- [ ] API integração v1.3 — defeito 2: `procedimento_id/nome/tipo` em `GET /availability`
- [ ] API integração v1.3 — defeito 3: `horarios_disponiveis_publico` coerente com o núcleo (duração e agenda aberta)
- [ ] API integração v1.3 — defeito 4: `com_horario=true` em `/specialties` e `/doctors`
- [ ] API integração v1.3 — atualizar documentação e OpenAPI
- [x] Adiantamento: opção "já pagou adiantado" na cobrança (dialog, confirmação, rastro)
- [x] Adiantamento: mensagem da agenda ensinando as duas saídas
- [x] Adiantamento: migração do texto da trava `fn_agendamento_exige_pagamento`
