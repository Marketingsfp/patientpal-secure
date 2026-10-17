# Revisão de segurança completa — 17/10/2026 (somente leitura, nada alterado)

Fontes conferidas nesta revisão: última varredura automática de segurança, consulta às regras de acesso das tabelas e funções do banco, leitura do código das áreas novas e lista de commits desde 16/10/2026 04:00 UTC.

## Achado mais importante (novo, desde 16/10)

### 1. CRÍTICA — Fase 2 da Área do Paciente sumiu do código, mas continua no banco
- O que vi: os arquivos da fase 2 não existem mais no projeto (documentos e financeiro do portal, link temporário de download, botão "Liberar ao paciente", regras e testes da fase 2, migração da fase 2). As telas `paciente.documentos` e `paciente.financeiro` também sumiram. A sincronização com o GitHub (commits até `22f2cc17f`) trouxe uma versão que não tinha esse trabalho.
- No banco ficou: a tabela `portal_links`, os campos `liberado_paciente_em/por` e as funções automáticas `portal_auto_liberar_documento`, `portal_auto_liberar_exame`, `portal_carimbar_liberacao`.
- Risco: o banco tem regras que o código não conhece (sem teste, sem registro de migração). Se alguém ligar a liberação automática ou recriar a fase 2 diferente, o comportamento fica imprevisível. As 3 funções podem ser chamadas por visitante sem login (permissão aberta ao público), embora sejam de gatilho.
- Correção sugerida: decidir entre (a) restaurar a fase 2 a partir da versão desta conversa, ou (b) registrar uma migração que retire do banco o que ficou da fase 2. Em qualquer caso, tirar a permissão de execução pública dessas 3 funções.

## Área do Paciente — Fase 1 (o que ficou)
- 2. BAIXA — Tabelas `portal_otps`, `portal_sessoes`, `portal_links` têm proteção ligada e nenhuma regra de leitura: ninguém de fora lê. Mas o banco mantém a permissão básica de leitura para visitante (`anon`) nessas e em várias outras tabelas; só a proteção por linha segura. Sugestão: retirar a permissão de visitante dessas tabelas como segunda barreira.
- 3. MÉDIA — A clínica do portal é escolhida pelo endereço, aceitando o cabeçalho `x-forwarded-host` enviado pelo navegador (`src/lib/portal-paciente/portal.server.ts`). Quem forjar esse cabeçalho escolhe a clínica. O impacto é limitado (CPF e código continuam exigidos por clínica, e o portal precisa estar ligado nela), mas a decisão não deveria vir do cliente. Sugestão: usar só o `host` real.
- 4. OK — Cookie de sessão: HttpOnly, Secure, SameSite=Lax, prazo máximo 8 h; IP vem do cabeçalho da Cloudflare. `portal_decidir_solicitacao` fechada para visitante.
- 5. BAIXA — `portal_solicitacoes_cadastro` é lida por qualquer membro da clínica (`is_member`), não só recepção/gestão. Contém telefone/e-mail/endereço novos do paciente. Sugestão: limitar aos papéis que aprovam.

## Subdomínios, cor e logo no login, "regra 1 de acesso"
- 6. BAIXA — `clinica_por_dominio` e `clinica_acesso_por_id` são abertas a visitante (necessário para o login com marca). Devolvem nome, logo e cores; conferir que não devolvem CNPJ, WhatsApp interno ou e-mail. Quem souber o identificador de uma clínica descobre a marca dela — aceitável.
- 7. OK — `acesso_por_dominio` fechada para visitante; `clinica_dominios` só admin da clínica ou da plataforma.
- 8. MÉDIA (já conhecido) — A restrição por domínio é só na tela; o isolamento real continua sendo a proteção por linha. Admin da plataforma sem vínculo vê a unidade travada, mas o que enxerga é decidido pelo banco.

## Link público de contrato (/p/contrato/$token)
- 9. MÉDIA — `documentoContratoPublico` (`src/lib/contrato-publico.functions.ts`) usa a chave total do servidor e devolve o contrato preenchido com dados do paciente para quem tiver o token. Não há limite de tentativas nem prazo de validade do token, nem registro de quem abriu. Sugestão: exigir token não vencido e contrato ainda pendente de assinatura, limitar tentativas por IP e registrar a abertura.
- 10. OK — `contrato_publico` e `assinar_contrato_publico` abertas a visitante por desenho; tabela `contratos_assinatura` só para membros com permissão de módulo.

## Bloqueio de contatos (`atend_contatos_bloqueados`)
- 11. OK — Proteção ligada; só supervisão/gestão/admin do atendimento leem e gravam (`atend_pode_bloquear_contato`).
- 12. BAIXA — `atend_pode_bloquear_contato` pode ser chamada por visitante; devolve só "sim/não" para um usuário e clínica. Sugestão: fechar para visitante.

## Vínculo de paciente e agenda dentro da conversa (OS ZAP)
- 13. A CONFERIR — Não confirmei com segurança se a busca/vínculo de paciente e a janela de agendamento dentro do chat checam permissão de agenda no servidor (além do acesso à conversa). Próximo passo: ler as funções do commit `f06c659ba`/`e61b86a67`.

## Análise do dashboard por IA
- 14. OK — `analisarDashboardOsZapIA` exige login, recalcula os números no servidor com a mesma permissão do dashboard e não aceita instruções vindas da tela. Nada é salvo.
- 15. BAIXA — Sem limite de uso por pessoa; um gestor pode gerar muitos pedidos pagos. Sugestão: limite diário por clínica.

## Ambiente de testes contínuo da Nina
- 16. A CONFERIR — Não confirmado com segurança que as 20–30 conversas simultâneas ficam só em leads de teste e nunca enviam WhatsApp real. Próximo passo: ler os commits `161445fdc`, `932589b62`, `e9e687cc1`.

## Achados antigos ainda abertos (varredura automática)
- 17. CRÍTICA — `especialidade_unidade` e `tipo_servico_unidade`: leitura liberada para qualquer visitante (`USING true`). Sugestão: limitar a membros, ou expor só o necessário para o agendamento online por uma função.
- 18. CRÍTICA — `POST /api/nina-voz` (`src/routes/api/nina-voz.ts`) gera áudio pago sem login. Sugestão: exigir login ou token da sessão de voz e limite de uso.
- 19. MÉDIA — Instruções de IA vindas da tela: `/api/nina-fala` (papel das mensagens), `consultarIA` (contexto como instrução de sistema), `homologarFrancisco` (instrução inteira vem do pedido).
- 20. MÉDIA — Impressão da ficha (`src/components/medico/paciente-dialogs.tsx`) escreve texto sem proteção contra código.
- 21. BAIXA — Exportação da agenda em planilha não neutraliza fórmulas (`src/lib/export-csv.ts`).
- 22. BAIXA — Busca de aprendizados da Nina monta filtro com texto livre (`src/lib/nina/aprendizado.functions.ts`).
- 23. MÉDIA (conhecido) — Permissão por módulo aplicada em parte só na tela; várias tabelas antigas só perguntam "é da clínica?".

## Segredos e dependências
- 24. OK — Não encontrei chave privada no código; `.env` só com chaves públicas.
- 25. A FAZER — Rodar a verificação de dependências vulneráveis e a varredura nova (a última é de 09/10).

## Próximos passos (só se aprovado)
1. Decidir o que fazer com a fase 2 (item 1) — urgente.
2. Rodar varredura nova + dependências e conferir itens 13 e 16.
3. Corrigir em pedidos separados, um por vez, começando pelos críticos (1, 17, 18).

Nenhum arquivo, tabela ou dado foi alterado nesta revisão.
