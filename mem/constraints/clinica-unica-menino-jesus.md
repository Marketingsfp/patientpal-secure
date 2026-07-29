---
name: Apenas Menino Jesus é clínica ativa
description: São Francisco de Paula e Consulta Hoje foram removidas do código; não recriar branding, flags ou lógica para elas
type: constraint
---
O sistema opera hoje com **uma única clínica ativa: POLICLINICA MENINO JESUS**.

- Removido do código (jul/2026): branding (cores/logos) da São Francisco de Paula e da Consulta Hoje, o modo somente-leitura da NFS-e da SFP, e as migrations de seed de feature flags da SFP.
- As flags `ux_melhorias`, `menu_hover_scale` e `turbo_mode_agenda_disabled` agora são **nativas da Menino Jesus** (`FLAGS_PADRAO_MENINO_JESUS` em `src/hooks/use-clinic-feature-flag.ts`) — antes eram herdadas da SFP. O comportamento visual da MJ não mudou.
- **Unificação de dados concluída (29/07/2026)**: só existe UMA linha em `clinicas` (POLICLINICA MENINO JESUS, `7570ddde-8c1c-4b55-ba72-cf12b2a6c940`). Todos os pacientes (~252k), médicos (152), procedimentos (4.581), convênios, caixa, RH, chat e auditoria das outras unidades foram transferidos para a MJ. Duplicados por CPF/CRM foram unificados no cadastro existente; procedimentos de nome repetido e configurações duplicadas foram descartados.
- Removido o trigger `replicar_procedimentos_menino_jesus` (copiava procedimentos da MJ para as outras unidades).
- O índice único de `pacientes(clinica_id, codigo_prontuario)` virou índice comum: prontuários legados repetidos convivem, e NENHUM número foi renumerado (ver `mem://constraints/identificadores-legados-pacientes`).
- O médico/prestador chamado "SAO FRANCISCO DE PAULA" pertence à Menino Jesus (exames externos) — manter em `NOMES_EXAME_SEM_PREFIXO` na agenda.

**Why:** o usuário decidiu manter só a Menino Jesus e pediu remoção limpa de resquícios de código das outras duas.
