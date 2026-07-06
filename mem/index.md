# Project Memory

## Core
ClinicaOS: sistema premium para clínicas. Cada mudança avaliada em 4 eixos: 💰 Financeiro, ⏱️ Operacional, 😊 Experiência do paciente, 🛡️ Segurança/Auditoria.
ClinicaOS é PLATAFORMA multi-clínica: config > código. Toda regra de procedimento vem de `fn_regras_procedimento(procedimento_id, unidade_id)`; nenhum módulo pode ter `if` por tipo de procedimento hard-coded.
Status separados: operacional (atendimento) | financeiro (pagamento) | orçamento (`aberto|em_andamento|finalizado|cancelado`). "Convertido" é evento, não estado.
Nunca introduzir regra que possa causar perda financeira sem bloqueio ou alerta (desconto excessivo, valor negativo, edição de orçamento convertido, cobrança duplicada, atendimento sem tabela, NFS-e com cadastro incompleto, paciente associado tratado como particular, procedimento sem preço).
Edição de orçamento convertido só para admin/gerente, sempre com log completo (usuário, data/hora, IP, campo, valor antes/depois).
Reutilizar componentes, busca de pacientes, padrões visuais e RPCs existentes. Nunca duplicar lógica entre módulos.
Antes de implementar uma feature, declarar: impacto financeiro, operacional, experiência, risco técnico, risco de negócio, tempo estimado, ganho esperado.
Prioridade máxima: reduzir cliques/tempo da recepção, evitar retrabalho e informações repetidas ao paciente.
Sem convênios externos. Modalidades: Paciente Particular, Paciente Associado, Cartão de Benefícios. Em UI/menu/busca usar "Cartão de Benefícios", "Associados", "Regras do Cartão", "Empresas associadas" — nunca "Convênios".
Identificadores legados de pacientes (codigo_prontuario, codigo_prontuario_anterior, numero_pasta, número de ficha) são IMUTÁVEIS: só leitura/busca/filtro. Proibido UPDATE, normalização, renumeração, trigger ou merge automático sem aprovação explícita.
Política permanente: dados históricos (identificadores legados de pacientes, histórico financeiro, movimentações de caixa, NFS-e/boletos emitidos, audit_log, criado_por/atualizado_por/created_at) são IMUTÁVEIS — nenhuma migration/trigger/RPC/IA/script/dedup altera automaticamente. Migration estrutural exige relatório + aprovação. Evolução: flag → preview → playwright → validação → promoção → rollback. Nunca remover clássico enquanto V2 vive. Remoção destrutiva só com autorização; preferir aditivo. Em dúvida, parar e perguntar.

## Memories
- [Governança de mudanças](mem://preferences/governanca) — Framework dos 4 eixos + checklist pré-implementação
- [Arquitetura de plataforma](mem://preferences/arquitetura-plataforma) — Config-first, motor de regras, separação de status, KPIs suportados
- [Repasse cartão consulta](mem://features/repasse-cartao-consulta) — Regras de repasse
- [Testes clientes pendentes](mem://tests/clientes-pendentes) — Notas de teste
- [Identificadores legados de pacientes](mem://constraints/identificadores-legados-pacientes) — Campos protegidos, permitido/proibido
- [Governança e dados imutáveis](mem://constraints/governanca-dados-imutaveis) — Política permanente: dados protegidos (pacientes/financeiro/auditoria), governança de migrations, padrão flag→preview→promoção, compatibilidade V2/clássico, alterações destrutivas