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

## Nina — Base de Conhecimentos (planilha TAP)
- [x] Tabelas, RLS, bucket privado e busca semântica no banco
- [x] Parser com herança de contexto, normalização e conflitos
- [x] Pipeline de processamento, embeddings e ativação por versão
- [x] Ferramenta `consultar_base_conhecimento` (Nina interna e WhatsApp)
- [x] Aba "Base de conhecimentos" com upload, versões e homologação
- [x] Testes do parser (`bun test`)
- [ ] Calibrar com a planilha TAP real (pendente do envio pelo colaborador)


## Atendimento — endereço das conversas (decisão atual)
- [x] As conversas são abertas por seleção interna na Inbox, mantendo o mesmo
      endereço (`/app/nina`). A identificação e localização operacional usam o
      número único e permanente, como #1342.
- [x] URLs individuais por conversa foram descontinuadas: links antigos
      (`/app/nina/<id>`) apenas redirecionam para a Inbox, sem abrir a conversa.

## Nina — Catálogo estruturado (Fases 1–7)
- [x] Fases 1–5: tabelas, formulários, IA, migração e integração
- [x] Fase 6: homologação em clínica fictícia isolada (aprovada)
- [x] Fase 7: modo planilha removido (global; dados antigos isolados; versão não publicada)

## Atendimento — identificação da conversa pelo nome (06/09/2026)
- [ ] Nome do paciente/contato como título no cabeçalho, lista, busca e filas
- [ ] Telefone e #número como informação secundária; "Paciente não identificado" sem nome
- [ ] Sem consulta por item da lista; sem mistura de dados ao trocar de conversa

## Nina — Analista de métricas
- [x] Fase 6 — diagnóstico e plano
- [x] Fase 7 — camada de dados analítica (calendário + consultas combináveis, reconciliada com o painel)
- [x] Fase 8 — analista GPT-5.6 Sol no backend (ferramentas restritas + validação de valores)
- [x] Fase 9 — interface "Análise com IA" no painel (histórico, limites, custo)
- [ ] Fase 10 — validação final ponta a ponta
