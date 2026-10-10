# Revisão de segurança completa — 10/10/2026 04:10 UTC (somente leitura, nada foi alterado)

## Conferido agora no banco
- Tabelas sem proteção por linha (RLS): **0**.
- Políticas de gravação liberadas para todos (`true`): **0**.
- Funções com privilégio elevado: 303; **71 chamáveis por visitante sem login** (ontem 69 — subiu 2).
- As 8 funções fechadas ontem (pagamento do Crédito, chave de API, limpezas) continuam fechadas a visitante.
- Não há Edge Functions; as rotas públicas ficam em `src/routes/api/public/`.

## Achados

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Alta | `checkin_agendamento` | Liberada a visitante; com o token do agendamento muda a etapa do fluxo e devolve nome do paciente. Depende só do token ser imprevisível. | Confirmar tamanho/aleatoriedade do token; limitar tentativas; devolver só o primeiro nome. |
| 2 | Média | `listar_duplicados_pacientes`, `dashboard_blocos_periodo`, `rel_agendamentos_marcados`, `rel_marcacoes_por_atendente`, `credito_clinica_situacao`, `nina_instrucoes_autores` | Liberadas a visitante. Conferem o usuário por dentro (visitante recebe vazio), mas tocam dados de pacientes/financeiro. | Tirar acesso de visitante (defesa extra). |
| 3 | Média | `coach_*` (7 funções, ex.: `coach_vincular_atendente`, `coach_registrar_uso_ia`) | Gravadoras liberadas a visitante; a maioria confere o usuário por dentro. `coach_nomes_orfaos` depende de `coach_pode_gerir`. | Tirar acesso de visitante. |
| 4 | Média | `src/lib/nina/aprendizado.functions.ts` (linha 62) | Busca da Nina monta filtro com texto digitado sem escapar (achado do scanner). Logado pode alterar o filtro. | Usar o mesmo saneamento de `src/lib/sanitize-search.ts`. |
| 5 | Média | `pagar_cobranca_credito_clinica` | Fechada a visitante, mas qualquer logado da clínica pode receber. | Exigir caixa/financeiro/gestor/admin. Possível regra de negócio — validar com a equipe da clínica. |
| 6 | Média | `is_financeiro_clinica` | Lê o papel de `clinica_memberships.role`, diferente de `user_roles`. | Unificar a fonte do papel. |
| 7 | Média | perfil Financeiro | Pode excluir em tabelas de dinheiro. | Confirmar `audit_log`; preferir cancelamento. |
| 8 | Baixa | Gatilhos `fn_*`, `tg_*`, `pacientes_*` (~30) | Execução liberada a visitante; sem efeito fora do gatilho. | Retirar EXECUTE em lote. |
| 9 | Baixa | `src/routes/api/public/nina.espera-timeout.ts` | Compara segredo com `!==` e aceita GET. | Comparação em tempo constante; só POST. |
| 10 | Baixa | `src/routes/api/public/hooks/francisco.ts` | Sem trava contra rodadas simultâneas. | Trava de rodada única. |
| 11 | Baixa | totem | Limite de 20/min e recusa sem token não testados no aparelho. | Teste na recepção. |
| 12 | Baixa | agenda / baixa do Financeiro | Pode mudar qualquer campo do agendamento. | Restringir por gatilho. |
| 13 | Info | `permissions`, `tipos_servico`, `especialidades` | Leitura agora só de administradores (mudança de ontem). | Conferir se recepção/médicos ainda veem as listas. |
| 14 | Crítica (indireta) | dependências | `proxy-addr` (via `@lovable.dev/mcp-js`); altas em `undici`, `sharp`, `ws`, `seroval` etc. | Atualizar `@tanstack/*` e `@lovable.dev/mcp-js`, com testes. |
| 15 | OK | segredos / webhook WhatsApp / integração v1 | Chave de serviço só no servidor; webhook recusa assinatura inválida; API v1 exige chave. | — |

## Não coberto
- Corpo de cada função pública de propósito (consulta, contrato, anamnese, painel, senhas) linha a linha.
- Políticas das ~260 tabelas uma a uma.
- Quais 2 funções novas abriram para visitante desde ontem (lista atual está pronta para comparar).

## Próximo passo (se aprovar)
Nada muda automaticamente. Sugiro começar pelos itens 1–3 numa migração pequena, só com REVOKE.
