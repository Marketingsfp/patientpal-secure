---
description: Regras de segurança e LGPD — aplicam-se a todo o repositório
paths:
  - "**"
---

# Regras — Segurança e LGPD

Este é um sistema em produção com dados reais de pacientes (saúde) e financeiros de clínicas reais. Aplicam-se a qualquer tarefa, em qualquer diretório.

1. **Princípio do menor privilégio.** Ao dar acesso a uma funcionalidade nova (rota, RPC, coluna), conceda o mínimo necessário para o papel que a usa — não replique acesso amplo "para simplificar". Este projeto já tem um gap conhecido (permissão por módulo aplicada só na UI, não no RLS — ver `docs/regras-de-negocio.md`); não aumente essa distância.

2. **Dados pessoais e de saúde são sensíveis por padrão.** CPF, data de nascimento, telefone, endereço, diagnóstico, prontuário, exames, biometria facial (`face_descriptor`) e dados bancários de médico exigem o mesmo cuidado que segredo de API — não logue, não exponha em mensagem de erro, não inclua em texto de commit.

3. **Nunca use dado real de paciente em teste, exemplo ou documentação.** Se precisar ilustrar um caso, use dado fictício claramente marcado (`Paciente Teste`, `000.000.000-00`). Isso vale para qualquer arquivo em `docs/`, `mem/` ou comentário de código.

4. **Autorização sempre no servidor, nunca só na UI.** Ocultar um botão/menu não é controle de acesso — a validação real é RLS (banco) ou checagem explícita em server function (`requireSupabaseAuth` + verificação de papel). Se uma feature nova depender só de esconder algo na tela, trate como incompleta.

5. **Não confie em ocultação de componente como segurança.** Qualquer dado que a UI decide não mostrar para um papel ainda está acessível via API se o RLS/RPC não bloquear explicitamente — sempre verifique os dois lados (o achado central da auditoria deste projeto é exatamente esse descompasso).

6. **Proteja contra acesso entre clínicas.** Toda nova tabela, RPC ou query precisa filtrar por `clinica_id` usando os helpers existentes (`is_member`, `has_role`, `can_manage_clinica`) — nunca assuma que o filtro do frontend é suficiente.

7. **Proteja logs.** Não imprima payload completo de requisição/resposta que contenha PII em `console.log`/logs de servidor. Erros voltados ao usuário devem ser mensagens genéricas; detalhe técnico vai para observabilidade interna, não para o cliente.

8. **Nunca exponha token/segredo.** Tokens de webhook (WhatsApp `verify_token`/`app_secret`, Focus NFe, `SUPABASE_SERVICE_ROLE_KEY`, chaves em `integration_secrets`) não podem aparecer em código versionado, resposta de API, mensagem de commit ou neste conjunto de documentos — nem truncados.

9. **Relate achados antes de alterar fluxo sensível.** Se, ao investigar uma tarefa, você encontrar um problema de segurança/LGPD não relacionado ao pedido original (ex.: RLS ausente, dado exposto), **reporte primeiro** e espere decisão do usuário antes de corrigir — não misture a correção com a tarefa em andamento sem avisar.

10. **`.env` está versionado neste repositório** (achado de auditoria anterior) com chaves públicas (`SUPABASE_PUBLISHABLE_KEY`/URL). Não adicione a ele nenhuma chave privada — se precisar de uma variável sensível nova, use secrets do ambiente de deploy (Cloudflare/Lovable), nunca o `.env` versionado.
