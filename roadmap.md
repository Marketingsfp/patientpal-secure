# Roadmap

## Nina — CRM e agendamento (em andamento)
- [x] Camada de ferramentas do paciente (`src/lib/nina/paciente-tools.server.ts`)
- [x] Loop de tool calling no WhatsApp (`src/lib/whatsapp.server.ts`)
- [x] Ferramenta de disponibilidade real na Nina interna
- [x] Flag `nina_agenda_ativa` ligada só na POLICLÍNICA MENINO JESUS
- [ ] Teste ponta a ponta no WhatsApp real (depende de validação humana)
- [ ] Reagendar / cancelar pela Nina (fase seguinte)

## Nina — aprendizado contínuo (novo pedido, 31/08/2026)
- [x] Análise A–G da arquitetura atual e proposta
- [ ] Definir clínica-alvo com o colaborador
- [ ] FASE 1 — Feedback (👍/👎) e registro de erros
- [ ] FASE 2 — Learning Store (`nina_aprendizados`, estados PENDING/APPROVED/…)
- [ ] FASE 3 — Busca semântica (embeddings) dos aprendizados
- [ ] FASE 4 — Context Builder adaptativo (recuperação por relevância)
- [ ] FASE 5 — AI Evaluator (detecção automática de erro)
- [ ] FASE 6 — Knowledge Gap (aprender com o atendimento humano)
- [ ] FASE 7 — Dataset de regressão a partir de erros reais
- [ ] FASE 8 — Painel "Nina → Aprendizado" + dashboard de evolução
- [ ] FASE 9 — Avaliação com o modelo real
