---
name: Governança de mudanças
description: Framework obrigatório dos 4 eixos + checklist pré-implementação para toda alteração no ClinicaOS
type: preference
---
Toda alteração deve ser analisada e comunicada sob 4 eixos antes de implementar:

1. 💰 **Impacto Financeiro** — pode gerar perda, aumentar faturamento, evitar cobrança duplicada?
2. ⏱️ **Impacto Operacional** — quantos cliques elimina? quantos segundos economiza? quantos atendimentos/dia impacta? alguma etapa pode ser automatizada?
3. 😊 **Experiência do Paciente** — reduz tempo de espera, retrabalho, ida ao balcão, informação repetida?
4. 🛡️ **Segurança e Auditoria** — log completo (usuário, data/hora, IP, campo, antes/depois), controle de acesso por role.

**Checklist pré-implementação (declarar sempre):**
- Impacto Financeiro
- Impacto Operacional
- Impacto na Experiência
- Risco Técnico
- Risco para regras de negócio
- Tempo estimado
- Ganho esperado

**Regras rígidas de perda financeira (bloquear ou alertar):**
- desconto > permitido, desconto negativo, valor negativo
- edição de orçamento convertido (só admin/gerente, sempre com log)
- cobrança duplicada
- atendimento sem tabela de preço
- NFS-e com cadastro incompleto
- paciente com convênio/associado sendo tratado como particular
- procedimento sem preço cadastrado

**Padrão do sistema:**
- Reutilizar componentes, busca de pacientes, padrões visuais e RPCs existentes.
- Nunca duplicar lógica entre módulos.
- Priorizar reduzir tempo da recepção.

**Why:** o usuário deixou explícito que o sistema é premium; decisões de arquitetura e UX devem fazer diferença no dia a dia (recepção, médicos, financeiro, administração).
**How to apply:** aplicar em qualquer nova feature, refactor ou correção — antes de qualquer código, apresentar a análise dos 4 eixos + checklist.