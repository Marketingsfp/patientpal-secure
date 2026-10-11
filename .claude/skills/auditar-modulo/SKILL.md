---
name: auditar-modulo
description: Audita um módulo do ClinicaOS (ex. Agenda, Caixa, Financeiro) sem alterar nada — mapeia rotas, componentes, hooks, tabelas, policies e funções, classifica achados por criticidade e produz relatório antes de qualquer mudança.
---

# /auditar-modulo

Uso: `/auditar-modulo <nome do módulo>` (ex.: `/auditar-modulo caixa`, `/auditar-modulo cartão de benefícios`).

## O que esta skill faz

Analisa um módulo do sistema **de ponta a ponta, somente leitura**, e entrega um relatório estruturado. Não corrige nada nesta etapa — mudanças só depois de o usuário revisar o relatório e autorizar explicitamente.

## Procedimento

1. **Confirme o módulo pedido** contra `docs/contexto-do-projeto.md` (seção "Módulos"). Se o nome for ambíguo (ex.: "Exames" pode ser `exames-resultados` ou parte de `procedimentos`), pergunte antes de prosseguir em vez de adivinhar.

2. **Mapeie a superfície do módulo, sem alterar arquivos:**
   - Rotas em `src/routes/` (públicas e `_authenticated/app.*`) relacionadas.
   - Componentes em `src/components/<modulo>` e `src/components/<modulo>-v2` (se existir versão v2 paralela).
   - Hooks relevantes em `src/hooks/`.
   - Server functions em `src/lib/*.functions.ts`.
   - Tabelas Supabase associadas (grep em `supabase/migrations/` e em `src/integrations/supabase/types.ts`).
   - Políticas RLS dessas tabelas (SELECT/INSERT/UPDATE/DELETE, e se usam `is_member`/`has_role`/`can_manage_clinica`).
   - Funções `SECURITY DEFINER`/RPCs chamadas pelo módulo.

3. **Mapeie os fluxos principais** (ex.: para Caixa: abrir sessão → lançar movimento → fechar caixa) como uma lista sequencial, citando o arquivo onde cada etapa acontece.

4. **Verifique, nesta ordem, e separe fato de hipótese:**
   - **Segurança**: RLS cobre o módulo? Existe checagem de papel/módulo (`perfil_permissoes`) só na UI sem espelho no banco? `service_role` é usado em algum caminho acessível ao cliente?
   - **Funcionamento**: existe lógica "pergunta depois grava" sem trava (corrida/concorrência)? Existe tratamento de erro (`try/catch`, `.catch()`) em toda chamada assíncrona relevante?
   - **Responsividade**: componentes têm classes responsivas (`sm:`/`md:`/`lg:`) ou fixam largura/altura que corta conteúdo em mobile?
   - **Performance**: existe N+1 (loop de chamadas ao Supabase), `.limit()` alto sem paginação real, ou fetch de tabela inteira?
   - **Acessibilidade**: inputs sem `label`, botões só com ícone sem `aria-label`.
   - **Regras de negócio**: cruze com `docs/regras-de-negocio.md` e `mem/` — a implementação bate com o que já foi documentado? Alguma regra documentada não tem rastro no código (ou vice-versa)?

5. **Classifique cada achado** como Crítico / Alto / Médio / Baixo (mesmos critérios do relatório de auditoria geral do projeto: Crítico = vazamento de dado, perda financeira, acesso indevido, queda de sistema).

6. **Separe explicitamente fatos de hipóteses.** Fato = tem arquivo/linha/tabela como evidência. Hipótese = comportamento provável mas não confirmado — marque como "Não foi possível confirmar com segurança" ou "Possível regra de negócio — validar com a equipe da clínica", conforme o caso.

7. **Entregue o relatório** (título/módulo, descrição + evidência, impacto/probabilidade, causa raiz provável, recomendação, necessidade de validação humana) e **pare**. Não proponha diff de código nesta etapa — se o usuário quiser corrigir algo, direcione para `/corrigir-bug-seguro`.
