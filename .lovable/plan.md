# Revisão de segurança completa — 09/10/2026 14:24 UTC (somente leitura, nada foi alterado)

## O que mudou desde a última revisão (13:28 UTC)
- Nenhuma mudança de código, banco, permissões, rotas públicas ou login. Os últimos commits de código (repasse no cartão, assinatura do webhook) já estavam cobertos.

## Conferido agora no banco
- Tabelas sem proteção por linha (RLS): **0**.
- Funções com privilégio elevado: 300; **76 chamáveis por visitante sem login** (igual).

## Achados (nenhum novo; todos continuam abertos)

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Média | `pagar_cobranca_credito_clinica` | Liberada a visitante; não confere o papel de quem recebe. | Tirar acesso de visitante; exigir caixa/financeiro/gestor/admin (papéis a validar com a clínica). |
| 2 | Média | `nina_trace_purgar`, `nina_execucoes_expurgo`, `integracao_verificacoes_limpar`, `coach_limpar_eventos_antigos` | Rotinas de limpeza liberadas a visitante (conferem por dentro). | Só servidor. |
| 3 | Média | `integracao_criar_api_key`, `nina_instrucoes_publicar`, `revisar_limite_credito_clinica` | Gravam e estão liberadas a visitante; conferem papel por dentro. | Tirar acesso de visitante. |
| 4 | Média | `is_financeiro_clinica` | Usa `clinica_memberships.role`, diferente de `user_roles`. | Unificar a fonte do papel. |
| 5 | Média | perfil Financeiro | Pode excluir em 15 tabelas de dinheiro. | Confirmar `audit_log`; preferir cancelamento. |
| 6 | Baixa | `coach_*` | Liberadas a visitante; checagem interna. | Só usuários logados. |
| 7 | Baixa | gatilhos `fn_*`, `tg_*`, `pacientes_*` | Execução liberada; sem efeito fora do gatilho. | Retirar EXECUTE em lote. |
| 8 | Baixa | totem | Limite de 20 tentativas e recusa sem token não testados no aparelho. | Teste na recepção. |
| 9 | Baixa | `src/routes/api/public/hooks/francisco.ts` | Sem trava contra rodadas simultâneas. | Trava de rodada única. |
| 10 | Baixa | `src/routes/api/public/nina.espera-timeout.ts` | Segredo comparado com `!==`; aceita GET. | Comparação em tempo constante; só POST. |
| 11 | Baixa | baixa do Financeiro na agenda | Pode mudar qualquer campo do agendamento. | Restringir por gatilho. |
| 12 | Baixa (scanner) | `permissions`, `tipos_servico`, `especialidades` | Leitura por qualquer logado; catálogos. | Marcar como intencional. |
| 13 | OK | webhook WhatsApp | Recusa assinatura inválida ou sem App Secret. | Confirmar App Secret nas 3 clínicas. |
| 14 | Crítica (indireta) | dependências | `proxy-addr` (via `@lovable.dev/mcp-js`); altas em `undici`, `sharp`, `ws`, `seroval`, `fast-uri`, `js-yaml`, `browserslist`. | Atualizar `@tanstack/react-start`, `@tanstack/react-router`, `@lovable.dev/mcp-js`, com testes. |
| 15 | OK | segredos | Chave de serviço só no servidor; `.env.example` sem valores reais. | Nada. |

## Não coberto
- Corpo de cada função pública de propósito (consulta, contrato, anamnese, painel, check-in).
- Regras das ~250 tabelas linha a linha; scanner automático desatualizado (08/10 20:52).
- Não há Edge Functions no projeto.

## Próximo passo (se aprovar)
Nada muda automaticamente. Sugiro uma migração pequena só fechando acesso de visitante para os itens 1, 2 e 3; a checagem de papel do item 1 depois de a clínica confirmar.
