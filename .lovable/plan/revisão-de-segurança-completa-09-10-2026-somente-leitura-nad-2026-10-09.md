# Revisão de segurança completa — 09/10/2026 (somente leitura, nada foi alterado)

## O que foi conferido agora
- Proteção por linha (RLS): ligada em **todas** as tabelas do banco (nenhuma tabela sem proteção).
- Funções com privilégio elevado (SECURITY DEFINER): 297 no total; **75 podem ser chamadas por visitante sem login**.
- Scanner do banco (última rodada 08/10 20:52, desatualizado): 3 achados de leitura liberada.
- Dependências: 1 crítica e várias altas, todas indiretas.
- Rotas públicas e webhook: usada a revisão de ontem (whatsapp, francisco, focusnfe, backup, nina watchdog/timeout, integrações v1).

## Achados

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Alta (confirmar) | funções `listar_duplicados_pacientes`, `credito_clinica_situacao`, `dashboard_blocos_periodo`, `rel_agendamentos_marcados`, `rel_marcacoes_por_atendente` | Chamáveis por visitante sem login e leem dados de pacientes/produção. Não conferi o corpo de cada uma: se não exigirem usuário logado e vínculo com a clínica, expõem dados. | Ler o corpo; tirar o acesso de visitante (`REVOKE ... FROM anon, PUBLIC`) das que não são telas públicas. |
| 2 | Alta (confirmar) | `pagar_cobranca_credito_clinica`, `revisar_limite_credito_clinica`, `integracao_criar_api_key`, `nina_instrucoes_publicar` | Funções que **gravam** e estão liberadas para visitante. Ontem já foi visto que o pagamento do Crédito não confere o papel de quem paga. | Tirar acesso de visitante; conferir papel e vínculo dentro de cada uma. |
| 3 | Média | `nina_trace_purgar`, `nina_execucoes_expurgo`, `integracao_verificacoes_limpar`, `coach_limpar_eventos_antigos` | Rotinas de limpeza liberadas para visitante; se não checarem quem chama, alguém de fora pode apagar registros de auditoria. | Deixar só para o servidor (service role). |
| 4 | Média | `coach_*` (registrar uso/tempo, vincular atendente, resumo) | Liberadas para visitante; dependem de checagem interna. | Restringir a usuários logados. |
| 5 | Baixa | gatilhos `fn_*`, `tg_*`, `pacientes_*` | Funções de gatilho com execução liberada; normalmente não fazem nada fora do gatilho, mas aparecem no scanner. | Retirar EXECUTE de anon/authenticated em lote. |
| 6 | Info (OK) | `consulta_publica`, `contrato_publico`, `assinar_contrato_publico`, `emitir_senha_publica`, `painel_senhas_publicas`, `totem_*`, `checkin_agendamento`, `salvar_anamnese_publica`, `resolver_clinica_*`, `tts_config_publico`, `verificar_certificado` | Públicas de propósito (totem, painel, check-in, contrato, anamnese). | Conferir que cada uma exige token e devolve só o mínimo. |
| 7 | Alta (scanner) | tabela `permissions` | Qualquer logado lê a tabela inteira. Provável catálogo de permissões. | Confirmar sem dado sensível e marcar como intencional. |
| 8 | Baixa (scanner) | `tipos_servico`, `especialidades` | Leitura liberada a qualquer logado; catálogo. | Marcar como intencional. |
| 9 | Média | `pagar_cobranca_credito_clinica` | (de ontem) não confere o papel de quem recebe. | Exigir caixa/financeiro/gestor/admin. |
| 10 | Média | `is_financeiro_clinica` | (de ontem) usa `clinica_memberships.role`, divergente de `user_roles`. | Unificar fonte do papel. |
| 11 | Média | migração do perfil financeiro | (de ontem) Financeiro pode **excluir** em 15 tabelas de dinheiro. | Confirmar registro de exclusão no `audit_log`; preferir cancelamento. |
| 12 | Baixa | baixa do Financeiro na agenda | (de ontem) pode mudar qualquer campo do agendamento. | Restringir por gatilho. |
| 13 | Baixa | `src/routes/api/public/hooks/francisco.ts` | Token seguro, sem limite de chamadas. | Trava contra rodadas simultâneas. |
| 14 | OK | webhook WhatsApp | Agora recusa aviso com assinatura inválida ou sem App Secret (`whatsapp-assinatura.ts`). Achado alto de ontem resolvido. | Confirmar App Secret nas 3 clínicas. |
| 15 | Crítica (indireta) | dependências | `proxy-addr` (via `@lovable.dev/mcp-js`). Altas: `undici`, `sharp`, `ws` (ferramentas de build), `seroval` e `fast-uri` (rodam no servidor), `js-yaml`, `browserslist`. | Atualizar `@tanstack/react-start`, `@tanstack/react-router` e `@lovable.dev/mcp-js`, com testes. |
| 16 | OK | segredos | Chave de serviço só no servidor; `.env.example` sem valores reais; prefixo VITE_ só para chaves públicas. | — |

## Não coberto
- Corpo de cada uma das 75 funções liberadas para visitante (itens 1–5 marcados "confirmar").
- Políticas das ~250 tabelas linha a linha: usado o scanner, que está desatualizado. Recomendo rodar o scanner de novo.
- Não há Edge Functions no projeto.

## Próximo passo (se aprovar)
Nada é alterado automaticamente. Ao aprovar, começo por ler o corpo das funções dos itens 1 e 2 e confirmar quais realmente expõem dados, antes de propor qualquer bloqueio.
