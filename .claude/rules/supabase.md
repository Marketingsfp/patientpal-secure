---
description: Regras para Supabase — migrations, RLS, funções e código de acesso ao banco
paths:
  - "supabase/**"
  - "src/integrations/supabase/**"
  - "src/lib/*.functions.ts"
  - "src/routes/api/**"
---

# Regras — Supabase / Banco de Dados

Aplicam-se a `supabase/migrations/`, `src/integrations/supabase/`, qualquer `*.functions.ts` e `src/routes/api/**`.

1. **Nunca altere o banco de produção diretamente.** Não execute `supabase db push`, SQL de escrita, nem qualquer comando que mude schema ou dados fora de uma migration revisada e aprovada pelo usuário.

2. **Nunca apague dados.** Sem exceção, mesmo em tabelas de staging (`_mj_*`, `_pac_stage_import`, `_tmp_*`) — confirme com o usuário antes de propor `DROP`/`DELETE`, mesmo que a tabela pareça obsoleta.

3. **Não edite uma migration já aplicada.** Migrations em `supabase/migrations/` são histórico imutável assim que existem no repositório — se algo precisa mudar, crie uma **nova** migration corrigindo o efeito, com um comentário explicando o motivo.

4. **Toda mudança de schema é uma nova migration**, nomeada no padrão existente (`YYYYMMDDHHMMSS_descricao.sql`), nunca editada em arquivo antigo.

5. **RLS é obrigatório em toda tabela nova.** Este projeto tem RLS habilitado em 100% das tabelas de negócio — não crie tabela sem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` e políticas explícitas na mesma migration.

6. **Verifique isolamento multi-clínica.** Toda política nova deve usar `is_member(auth.uid(), clinica_id)` (ou `has_role`/`can_manage_clinica`) — não use `USING (true)` em tabela de negócio. Se uma política parecer permissiva demais, pare e pergunte antes de aplicar.

7. **Funções `SECURITY DEFINER` sempre com `SET search_path = public`** (ou schema explícito) — nunca crie uma sem isso; é o padrão de hardening já estabelecido em ~120 funções existentes.

8. **`service_role`/`supabaseAdmin` nunca no frontend.** Esse cliente (`src/integrations/supabase/client.server.ts`) bypassa RLS por completo e só pode ser importado por código que roda exclusivamente no servidor (`*.functions.ts`, `src/routes/api/**`). Se um import dele aparecer em um componente React, é um bug crítico — reporte antes de "corrigir" silenciosamente.

9. **Não exponha segredos.** Nunca coloque valor de `SUPABASE_SERVICE_ROLE_KEY`, tokens de API (Meta WhatsApp, Focus NFe, Lovable AI Gateway) ou qualquer credencial em código, commit, log ou nesta documentação — mesmo truncado, prefira omitir por completo.

10. **Verifique impacto retroativo antes de alterar uma coluna/tabela usada por dado histórico.** Ver `mem/constraints/governanca-dados-imutaveis.md` — dados de pacientes, financeiro e auditoria são tratados como somente leitura/referência histórica neste projeto; qualquer migration que toque neles exige relatório prévio (tabelas, colunas, índices, RLS afetados, rollback) e aprovação explícita.

11. **Apresente o SQL para revisão antes de qualquer execução.** Mesmo com aprovação de escopo, mostre a migration completa (incluindo `RLS`/`GRANT`/`REVOKE`) e espere confirmação explícita antes de rodar `supabase db push` ou equivalente — nunca execute automaticamente.

12. **Alteração de RLS/permissão é sensível por padrão.** Trate qualquer mudança em política RLS, GRANT/REVOKE ou função `SECURITY DEFINER` com o mesmo cuidado de uma migration estrutural — mesmo que pareça pequena, é a camada que impede acesso indevido entre clínicas.
