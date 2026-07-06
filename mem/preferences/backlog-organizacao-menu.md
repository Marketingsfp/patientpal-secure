---
name: Backlog — auditoria de duplicidades no menu
description: Ajustes de organização do menu registrados como próximo trabalho após o encerramento de Clientes V2 e antes de iniciar Agenda V2. Não implementar sem retomada explícita.
type: preference
status: concluido
---

**CONCLUÍDO — Opção A aplicada nos dois blocos (aditivo, sem migration, sem alteração de regra).**

## Executado

### Cartão de Benefícios
- Menu lateral colapsado para uma única entrada `Cartão de Benefícios` → `/app/cartao-beneficios/contratos`.
- Sub-navegação agora vive nas abas do layout `/app/cartao-beneficios`: Vendas · Convênios · **Benefícios (regras)** · **Modelos** · Dependentes · Relatórios (BI).
- `Empresas Associadas` mantido no centro Cartão (aponta para `/app/financeiro/empresas`).
- Zero mudança em `cb_beneficios`, `cb_convenio_regras`, RPCs ou regras de cálculo.

### Exames × Procedimentos
- Rótulos renomeados no menu e nos titles das rotas:
  - `Procedimentos` → **Catálogo de Serviços** (`/app/procedimentos` — fonte de verdade: preços, agenda, orçamento, caixa, conversão).
  - `Exames` → **Resultados de Exames / Laudos IA** (`/app/exames-resultados` — workflow clínico/IA).
- Nenhuma tabela, coluna, RPC ou fluxo alterado.

## Histórico

Registrado originalmente como próximo ajuste de organização do menu, fora de qualquer módulo do roadmap.

## Ordem de execução

1. Concluir validação visual do Clientes V2 no preview real.
2. Encerramento formal do Clientes V2 (com relatório).
3. **Auditoria de duplicidades no menu** (este item).
4. Somente então iniciar planejamento da Agenda V2.

## Duplicidades a auditar

- **Benefícios × Relatórios do Cartão** — possível sobreposição entre a área de Benefícios e os Relatórios dentro de Cartão de Benefícios. Verificar se são conceitos distintos ou se um cobre o outro.
- **Exames × Procedimentos** — verificar se Exames é um subconjunto de Procedimentos, se há itens cadastrados nos dois lugares, e se a recepção/médico sabem onde procurar cada coisa.

## Escopo esperado da auditoria (quando for iniciada)

- Levantar o que cada tela expõe hoje (dados, permissões, quem usa).
- Mapear sobreposição real de dados/ações.
- Propor consolidação, renomeação ou separação clara — sem apagar nada antes de aprovação.
- Nenhuma migration destrutiva. Preferir aditivo (aliases, redirects, renomear labels).
- Manter naming: "Cartão de Benefícios", "Associados", nunca "Convênios".

**Why:** o usuário quer o menu limpo e sem ambiguidade para a recepção, mas não quer abrir essa frente antes de encerrar Clientes V2 — disciplina "um módulo por vez".
**How to apply:** não implementar nada até o usuário retomar explicitamente. Se surgir uma sugestão relacionada durante outro módulo, registrar aqui e seguir.