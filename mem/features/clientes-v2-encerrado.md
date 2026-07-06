---
name: Clientes V2 — encerrado
description: Módulo 1 do roadmap oficialmente concluído e aprovado pelo usuário. Flag OFF por padrão, liberado apenas admin/gestor, recepção segue no clássico.
type: feature
---

**Status:** Concluído e aprovado visualmente pelo usuário.

## Escopo entregue
- Busca server-side
- KPIs
- Resumo
- Filtros rápidos
- Cards
- Drawer
- Modo compacto (persistido em `profiles.preferencias_ui`)
- Layout mobile
- Feature flag `clientes_v2`
- Promoção controlada em `/app/clientes`
- Fallback para o módulo clássico
- Rollback disponível (3 níveis: flag, override no index, reversão de rota)
- Zero alteração em regras de negócio
- Zero alteração em dados históricos (identificadores legados preservados)

## Estado operacional atual (manter)
- `clientes_v2` OFF por padrão
- V2 liberado apenas para admin/gestor
- Recepção permanece no módulo clássico até futura decisão explícita do usuário
- Clássico permanece íntegro como fallback e rota principal para demais perfis

## Próximo passo do roadmap
Auditoria de duplicidades (Cartão×Relatórios do Cartão; Exames×Procedimentos) — documento em `docs/auditorias/duplicidades-menu.md`. Agenda V2 bloqueada até a auditoria ser aprovada.