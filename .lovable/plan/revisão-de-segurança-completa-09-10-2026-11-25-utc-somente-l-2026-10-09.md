# Revisão de segurança completa — 09/10/2026 11:25 UTC (somente leitura, nada foi alterado)

## Conferido agora no banco
- Tabelas sem proteção por linha (RLS): **0**.
- Funções com privilégio elevado: 300; **76 chamáveis por visitante sem login** (ontem 75).
- `_credito_clinica_situacao`: não aparece mais como liberada a visitante (correção de ontem confirmada).
- Funções do totem (`totem_checkin_cpf`, `totem_checkin_paciente`, `totem_match_biometria`, `totem_checkin_facial`): continuam com acesso de visitante, **de propósito** — agora exigem o token do totem dentro da função.

## Achados

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Média | `pagar_cobranca_credito_clinica` | Liberada a visitante e não confere o papel de quem recebe. | Tirar acesso de visitante; exigir caixa/financeiro/gestor/admin. Papéis a validar com a clínica. |
| 2 | Média | `nina_trace_purgar`, `nina_execucoes_expurgo`, `integracao_verificacoes_limpar`, `coach_limpar_eventos_antigos` | Rotinas de limpeza ainda liberadas a visitante. Ontem confirmei que conferem quem chama, mas não deveriam estar abertas. | Deixar só para o servidor. |
| 3 | Média | `integracao_criar_api_key` | Liberada a visitante; confere papel por dentro. | Tirar acesso de visitante (defesa extra). |
| 4 | Média | `is_financeiro_clinica` | Usa `clinica_memberships.role`, diferente de `user_roles`. | Unificar a fonte do papel. |
| 5 | Média | perfil Financeiro | Pode excluir em 15 tabelas de dinheiro. | Confirmar registro no `audit_log`; preferir cancelamento. |
| 6 | Baixa | gatilhos `fn_*`, `tg_*`, `pacientes_*` | Execução liberada; sem efeito fora do gatilho. | Retirar EXECUTE de visitante/logado em lote. |
| 7 | Baixa | totem | Limite de 20 tentativas e recusa sem token ainda não testados no aparelho. | Teste na recepção com paciente agendado. |
| 8 | Baixa | `src/routes/api/public/hooks/francisco.ts` | Token seguro, sem trava contra rodadas simultâneas. | Trava de rodada única. |
| 9 | Baixa | `src/routes/api/public/nina.espera-timeout.ts` | Compara o segredo com `!==` (não em tempo constante) e aceita GET. | Usar comparação em tempo constante; só POST. |
| 10 | Baixa | agenda / baixa do Financeiro | Pode mudar qualquer campo do agendamento. | Restringir por gatilho. |
| 11 | Baixa (scanner) | `permissions`, `tipos_servico`, `especialidades` | Leitura por qualquer logado; catálogos. | Confirmar e marcar como intencional. |
| 12 | Info | `pagar_repasse_terceiro` | Agora existe no banco (antes faltava). | Nada. |
| 13 | OK | webhook WhatsApp | Recusa assinatura inválida ou sem App Secret. | Confirmar App Secret nas 3 clínicas. |
| 14 | Crítica (indireta) | dependências | `proxy-addr` (via `@lovable.dev/mcp-js`); altas em `undici`, `sharp`, `ws`, `seroval`, `fast-uri`, `js-yaml`, `browserslist`. | Atualizar `@tanstack/react-start`, `@tanstack/react-router`, `@lovable.dev/mcp-js`, com testes. |
| 15 | OK | segredos | Chave de serviço só no servidor; `.env.example` sem valores reais. | — |

## Não coberto
- Corpo das funções públicas de propósito (consulta, contrato, anamnese, painel, check-in) uma a uma.
- Políticas das ~250 tabelas linha a linha; o scanner automático está desatualizado (08/10 20:52).
- Não há Edge Functions no projeto.

## Próximo passo (se aprovar)
Nada muda automaticamente. Sugiro começar pelos itens 1 e 2, em uma migração pequena só com REVOKE/checagem de papel.
