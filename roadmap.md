# Roadmap — Instruções da Nina

- [x] FASE 1 — Backend: tabela versionada de Instruções da Nina (global, escopos whatsapp + painel interno) + importação da v1 com o conteúdo atual; fallback do código mantido.
- [x] FASE 2 — Interface: seção "Instruções da Nina" abaixo do canvas em Nina → Arquitetura, editor grande carregado da fonte persistente, botão "Salvar rascunho", sem alterar comportamento da Nina.
- [x] FASE 3 — Publicação versionada das Instruções da Nina: publicar cria nova versão (anterior arquivada, nunca apagada), histórico com responsável/status/comentário, leitura de versão antiga, comparação e restauração como nova versão. Runtime ainda usa o texto do código.
- [x] FASE 6 — Rastreabilidade do prompt: cada execução da Nina guarda a referência imutável da versão das Instruções usada (número, data de publicação, origem e módulos realmente utilizados) e a aba Execução mostra a versão histórica daquela mensagem.
- [x] FASE 7 — Segurança das Instruções da Nina: permissões separadas (ver / editar / publicar / histórico) verificadas no servidor pelo papel real da clínica, publicação restrita a administrador também no banco, auditoria de rascunho, publicação e restauração no audit_log (sem secrets). Homologação com publicação real pendente de autorização do time.

## Telefonia (permissão de atendimento humano da Nina)
- [x] Fase 1 — permissão em Cadastros › Perfis
- [x] Fase 2 — pool de distribuição filtrado por Telefonia
- [x] Fase 3 — fila de Não atribuídas só é movimentada por Telefonia
- [x] Fase 4 — consistência em realtime: sem cache, reavaliar fila ao salvar perfil, auditoria enriquecida
- [x] Fase 5 — elegibilidade determinística testada (8 cenários) e paridade produção/homologação/Test Runner
