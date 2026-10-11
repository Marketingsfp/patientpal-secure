# Contexto do Projeto — ClinicaOS / Health Hub Pro

> Levantamento por leitura direta de `src/routes/`, `supabase/migrations/` e `src/lib/`. Data: 2026-07-10. Ver também `mem/index.md` para decisões de produto já validadas com o usuário.

## O que é

Sistema de gestão **multi-clínica** (SaaS interno, uma instância atende várias clínicas/unidades via `clinica_id`/`unidades`). Em produção, com pacientes e financeiro reais. Rodando sobre Lovable Cloud (Supabase) + Cloudflare Workers.

## Módulos — status de confirmação

Critério: **Confirmado** = rota + tabela(s) encontradas; **Parcial** = rota ou tabela existe mas escopo funcional não foi lido em profundidade; **Citado, não confirmado** = mencionado em `mem/`/conversas mas sem rastro no código; **Dúvida** = existe mas propósito não está claro sem perguntar ao time.

### Confirmados

| Módulo | Evidência (rotas) | Evidência (tabelas) |
|---|---|---|
| Agenda | `app.agenda`, `app.agenda-v2`, `app.agenda.express`, `app.orcamentos-agenda`, `app.disponibilidades` | `agendamentos`, `medico_agendas`, `medico_disponibilidades`, `medico_agenda_procedimentos` |
| Recepção / fluxo | `app.recepcao`, `app.fluxo` | `agendamentos.fluxo_etapa` (enum `fluxo_etapa`) |
| Filas e check-in | `checkin.$token`, `app.checkin`, `totem.tsx`, `autoatendimento.tsx`, `painel.tsx` (painel público de senhas) | `senhas`, enums `tipo_senha`/`status_senha` |
| Pacientes | `app.clientes.*` (v1), `clientes-v2/` (v2 sob flag), rotas públicas `paciente.*` (portal do paciente) | `pacientes`, `paciente_biometria` |
| Médicos | `app.medicos`, `app.medico.$medicoId` | `medicos`, `medico_biometria`, `medico_convenios`, `medico_especialidades`, `medico_procedimentos` |
| Serviços / procedimentos | `app.procedimentos`, `app.tipos-servico`, `app.especialidades` | `procedimentos`, `tipos_servico`, `especialidades`, `procedimento_especialidades` |
| Prontuário | `app.prontuarios`, `app.prontuario-modelos`, `app.anamneses`, `app.odontologia` | `prontuarios`, `prontuario_modelos`, `anamnese_modelos`/`respostas`, `odonto_prontuarios`, `odonto_dentes` |
| Caixa | `app.caixa` (v1), `caixa-v2/` (v2 sob flag) | `caixa_sessoes`, `caixa_movimentos` |
| Financeiro | 13 sub-rotas `app.financeiro.*` (atendimentos, estorno, movimento, categorias, contas, notas, lembretes, bi, analitico, relatorios, empresas, alertas, regras-ia) | `fin_lancamentos`, `fin_categorias`, `fin_contas`, `fin_atendimentos`, `fin_alertas`, `fin_notas_pacientes`, `fin_regras_ia`, `estorno_solicitacoes` |
| Orçamentos | `app.orcamentos` (v1), `orcamentos-v2/` (v2 sob flag) | `orcamentos`, `orcamento_itens`, `agendamento_orcamento_itens` |
| Repasses médicos | dentro de `app.financeiro.atendimentos`; `medicos.percentual_repasse_padrao`/`valor_repasse_padrao` | `pagamento_splits`, `procedimento_split_regras`, `regras_rateio`, `procedimento_cb_convenio_valores` |
| Cartão de benefícios | 6 sub-rotas `app.cartao-beneficios.*` | `cb_convenios`, `cb_convenio_regras`, `cb_convenio_valores`, `cb_convenio_faixas`, `cb_beneficios`, `cartoes_convenio`, `contrato_dependentes`, `contrato_mensalidades` |
| CRM | `app.crm` | `crm_etapas`, `crm_oportunidades` |
| Marketing | `app.campanhas`, `app.mkt-envios`, `app.mkt-landing`, `app.mkt-leads`, `app.mkt-segmentos`, rota pública `lp.$slug` (landing page) | `campanhas_marketing`, `mkt_envios`, `mkt_landing_pages`, `mkt_leads`, `mkt_segmentos` |
| RH | `app.cargos`, `app.setores`, `app.hr-contratos`, `app.hr-ferias`, `app.hr-holerites`, `app.hr-ponto` | `cargos`, `setores`, `hr_contratos`, `hr_ferias`, `hr_holerites`, `hr_pontos`, `hr_banco_horas`, `hr_escalas` |
| Relatórios | `app.relatorios`, `app.financeiro.relatorios`, `app.financeiro.bi`, `app.painel-executivo`, `app.cartao-beneficios.relatorios` | consultas sobre tabelas operacionais/financeiras; sem tabela própria de "relatório" |
| Auditoria | `app.auditoria` | `audit_log` (trigger `fn_audit_trigger` em `agendamentos`, `pacientes`, `fin_lancamentos`, `medicos`, `procedimentos`, `gr_impressoes`, `orcamento_itens` — **não** em `prontuarios`) |
| LGPD | `app.lgpd` | `lgpd_consentimentos`, `lgpd_solicitacoes` |
| Contratos (assinatura eletrônica) | `app.contratos`, rota pública `p.contrato.$token` | `contratos_assinatura`, `documentos_emitidos`, `modelos_documentos` |
| WhatsApp (integração) | webhook público `api/public/whatsapp.$clinicaId`, admin `app.nina` | `whatsapp_configs`, `whatsapp_mensagens`, `whatsapp_templates`, `atend_conversas` + ~12 tabelas `atend_*` (bot/fila de atendimento) |
| NFS-e (integração fiscal) | `app.configuracoes.nfse`, `app.nfse.index`, `app.nfse.testar`, webhook público `api/public/focusnfe.webhook` | `nfse`, `nfse_emitentes` |
| Backup | webhook público `api/public/hooks/backup-diario`, `app.backups` | `backup_execucoes`, bucket Storage `backups-diarios` |
| LMS / Treinamentos | `app.lms-admin`, `app.treinamentos`, rota pública `verificar.$codigo` (verificação de certificado) | `lms_cursos`, `lms_modulos`, `lms_licoes`, `lms_quizzes`, `lms_progresso`, `lms_certificados`, `lms_trilhas_cargo` |
| Enfermagem | `app.enfermagem-recursos`, `app.alertas-enfermagem`, `app.triagem-enfermagem` | `enfermagem_recursos` (+ disponibilidades/procedimentos/atendentes), `alertas_enfermagem`, `triagens_enfermagem` |
| Exames | `app.exames-resultados` | `exame_resultados` |
| Estoque | `app.estoque` | `estoque_produtos`, `estoque_movimentos` |
| Boletos | `app.boletos` | `boletos` |
| Chat interno | `app.chat` | `chat_canais`, `chat_membros`, `chat_mensagens`, `chat_leituras` |
| Multi-clínica / estrutura | `app.clinicas`, `app.unidades` | `clinicas`, `unidades`, `clinica_memberships` |
| Permissões / perfis de acesso | `app.perfis` | `perfis_acesso`, `perfil_permissoes`, `permissions`, `role_permissions`, `user_roles` |
| Planos (assinatura do sistema) | `app.planos` | `planos_assinatura`, `sistema_planos` |
| Atendimento por IA | `app.atendimento-ia.*`, `app.atendimento-multiplo`, `app.consulta-rapida` | ligado a `atend_*` e à IA da Nina (`gerarRespostaNina` em `src/lib/whatsapp.server.ts`) |
| Integrações/segredos | `app.integration-secrets` | `integration_secrets` (RLS restrita a admin) |

### Parciais (existem, escopo não auditado a fundo)

- **Modelos de documentos genéricos** (`app.modelos-documentos`, `app.documentos`, tabela `modelos_documentos`) — relação exata com "Contratos" não confirmada.
- **`app.diagnostico`** (rota pública, fora de `_authenticated`) — página de healthcheck técnico (frontend/env/Supabase), não é módulo de negócio.
- **`app.painel`** (autenticado) vs. **`painel.tsx`** (público) — nomes parecidos, propósitos distintos (painel público = chamada de senha em TV; painel autenticado não foi lido em detalhe).
- **Rotas `dev-*`** (`app.dev-caixa-shell`, `app.dev-clientes-shell`, `app.dev-hhp`, `app.dev-list-shell`, `app.dev-menu-shell`, `app.dev-orcamentos-shell`) — telas de preview de desenvolvimento (`robots: noindex`), acessíveis a qualquer usuário autenticado; não são módulos de negócio.

### Citados, mas não confirmados no código

- **Automação via n8n** — discutida em conversa nesta sessão como possibilidade; **nenhum vestígio no código** (`grep` por "n8n" em `src`, `supabase`, `docs`, `mem` retornou vazio). Se implementada no futuro, documentar aqui.
- **Motor de regras "config-first" universal** (`fn_regras_procedimento`, `status_operacional`/`status_financeiro`) descrito em `mem/preferences/arquitetura-plataforma.md` como padrão obrigatório para *toda* feature nova — confirmado no código, mas **hoje aplicado apenas a `orcamento_itens`** (migrations de 2026-07-05), não a `agendamentos` nem a outros módulos. Ver `docs/regras-de-negocio.md`.

### Dúvidas pendentes

- Existem **duas branches remotas** além de `main`: `qa/ui-functional-fixes` e `security/audit-fixes`. Conteúdo não inspecionado nesta rodada — podem ser trabalho em andamento de outro colaborador.
- Qual gerenciador de pacotes é canônico (`bun.lock` vs. `package-lock.json` coexistem).
- Propósito exato de `app.painel` (autenticado) não foi lido linha a linha.
