---
name: Roadmap de módulos e ciclo de evolução
description: Ordem obrigatória de desenvolvimento (Clientes V2 → Agenda V2 → Prontuário V2 → Central Operacional → Dashboards Executivos → BI → Portal do Associado), ciclo de 8 etapas por módulo e relatório de encerramento.
type: preference
---

## Ordem obrigatória (um módulo por vez)

1. Clientes V2
2. Agenda V2
3. Prontuário V2
4. Central Operacional
5. Dashboards Executivos
6. BI e Indicadores
7. Portal do Associado

Não abrir uma nova frente antes de encerrar a atual. Sugestões fora da ordem devem ser recusadas ou registradas como backlog, nunca iniciadas.

## Ciclo obrigatório por módulo (8 etapas)

1. Planejamento
2. Aprovação do usuário
3. Desenvolvimento em preview (rota isolada + feature flag OFF por padrão)
4. Playwright (cenários cobertos e reportados)
5. Validação visual do usuário
6. Promoção controlada (admin/gestor primeiro)
7. Liberação gradual
8. Encerramento com relatório

Cada etapa exige confirmação antes de avançar para a próxima. Nunca pular etapas.

## Relatório de encerramento (obrigatório)

Ao encerrar um módulo, gerar relatório contendo:
- funcionalidades entregues
- riscos
- pendências
- rollback (procedimento e ponto de retorno)
- impacto operacional (financeiro, recepção, médico, paciente)
- documentação (rotas, flags, RPCs, componentes reutilizáveis)

**Why:** manter o projeto organizado, evolução previsível e reduzir risco de regressões cruzadas entre módulos.
**How to apply:** antes de propor qualquer feature nova, verificar se está dentro do módulo ativo da ordem acima. Fora dela → registrar como backlog e não implementar.