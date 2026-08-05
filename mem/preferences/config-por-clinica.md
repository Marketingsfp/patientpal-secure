---
name: Configurações independentes por clínica
description: Toda parametrização operacional/negocial deve ser isolada por clinica_id; código e UI são compartilhados, mas config nunca é
type: preference
---
As 3 clínicas compartilham a mesma base de código (frontend + backend), mas **toda configuração operacional e de negócio é independente por clínica**. Uma alteração de parametrização em uma clínica NUNCA pode vazar para outra.

**Regras:**
- Toda tabela de configuração/parametrização tem `clinica_id NOT NULL` e RLS por membership.
- Toda RPC/leitura de config recebe/filtra por `clinica_id` (nunca global).
- Novas features seguem `mem://preferences/arquitetura-plataforma` (config-first, motor de regras por unidade).
- Exemplos que DEVEM ser por clínica: convênios, faixas, valores de procedimento, regras de repasse, splits, taxas (adesão/inclusão), carência, horários, tipos de serviço, modelos de documento/prontuário, permissões/perfis, branding, integrações (NFS-e, WhatsApp), impressão, painel/totem, seeds.
- Exemplos compartilhados (globais): estrutura do código, componentes UI, layout, migrations de schema, roteamento, catálogo de módulos.

**How to apply:** ao criar/alterar qualquer parametrização, confirmar que ela é escrita/lida escopada por `clinica_id`. Se surgir necessidade de "config global", justificar por escrito e preferir default + override por clínica.
**Why:** o usuário deixou explícito que cada clínica opera de forma independente; misturar configuração entre clínicas é bug de arquitetura.