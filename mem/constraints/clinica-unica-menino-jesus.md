---
name: Apenas Menino Jesus é clínica ativa
description: São Francisco de Paula e Consulta Hoje foram removidas do código; não recriar branding, flags ou lógica para elas
type: constraint
---
O sistema opera hoje com **uma única clínica ativa: POLICLINICA MENINO JESUS**.

- Removido do código (jul/2026): branding (cores/logos) da São Francisco de Paula e da Consulta Hoje, o modo somente-leitura da NFS-e da SFP, e as migrations de seed de feature flags da SFP.
- As flags `ux_melhorias`, `menu_hover_scale` e `turbo_mode_agenda_disabled` agora são **nativas da Menino Jesus** (`FLAGS_PADRAO_MENINO_JESUS` em `src/hooks/use-clinic-feature-flag.ts`) — antes eram herdadas da SFP. O comportamento visual da MJ não mudou.
- **Os dados no banco foram mantidos** (linhas em `clinicas`, ~9.5k pacientes da SFP, memberships). Não apagar sem pedido explícito.
- O médico/prestador chamado "SAO FRANCISCO DE PAULA" pertence à Menino Jesus (exames externos) — manter em `NOMES_EXAME_SEM_PREFIXO` na agenda.

**Why:** o usuário decidiu manter só a Menino Jesus e pediu remoção limpa de resquícios de código das outras duas.
