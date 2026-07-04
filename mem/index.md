# Project Memory

## Core
ClinicaOS: sistema premium para clínicas. Cada mudança avaliada em 4 eixos: 💰 Financeiro, ⏱️ Operacional, 😊 Experiência do paciente, 🛡️ Segurança/Auditoria.
Nunca introduzir regra que possa causar perda financeira sem bloqueio ou alerta (desconto excessivo, valor negativo, edição de orçamento convertido, cobrança duplicada, atendimento sem tabela, NFS-e com cadastro incompleto, paciente associado tratado como particular, procedimento sem preço).
Edição de orçamento convertido só para admin/gerente, sempre com log completo (usuário, data/hora, IP, campo, valor antes/depois).
Reutilizar componentes, busca de pacientes, padrões visuais e RPCs existentes. Nunca duplicar lógica entre módulos.
Antes de implementar uma feature, declarar: impacto financeiro, operacional, experiência, risco técnico, risco de negócio, tempo estimado, ganho esperado.
Prioridade máxima: reduzir cliques/tempo da recepção, evitar retrabalho e informações repetidas ao paciente.

## Memories
- [Governança de mudanças](mem://preferences/governanca) — Framework dos 4 eixos + checklist pré-implementação
- [Repasse cartão consulta](mem://features/repasse-cartao-consulta) — Regras de repasse
- [Testes clientes pendentes](mem://tests/clientes-pendentes) — Notas de teste