# Roadmap — Instruções da Nina

- [x] FASE 1 — Backend: tabela versionada de Instruções da Nina (global, escopos whatsapp + painel interno) + importação da v1 com o conteúdo atual; fallback do código mantido.
- [x] FASE 2 — Interface: seção "Instruções da Nina" abaixo do canvas em Nina → Arquitetura, editor grande carregado da fonte persistente, botão "Salvar rascunho", sem alterar comportamento da Nina.
- [x] FASE 3 — Publicação versionada das Instruções da Nina: publicar cria nova versão (anterior arquivada, nunca apagada), histórico com responsável/status/comentário, leitura de versão antiga, comparação e restauração como nova versão. Runtime ainda usa o texto do código.
- [x] FASE 6 — Rastreabilidade do prompt: cada execução da Nina guarda a referência imutável da versão das Instruções usada (número, data de publicação, origem e módulos realmente utilizados) e a aba Execução mostra a versão histórica daquela mensagem.
