## Objetivo
Executar um teste funcional automatizado (Playwright headless) na página `/app/fluxo`, acionando **uma vez cada** um dos botões principais e reportando o resultado.

## Botões a testar
1. **Voltar etapa** (ícone `‹` — em qualquer card fora de "Aguardando").
2. **Prioridade** (ícone `CircleDot` / alerta — cicla normal → prioritário → urgente).
3. **Chamar** (coluna Triagem — cria senha no painel + move para Atendimento).
4. **Avançar** (coluna intermediária — move para próxima etapa).
5. **Finalizar** (coluna Atendimento — move para Finalizado).
6. **Rechamar** (coluna Atendimento — cria nova senha sem mudar etapa).

## Execução
- Usar Playwright via shell (`/tmp/browser/fluxo-test/`) autenticando com a sessão Supabase injetada.
- Antes de cada clique: capturar o estado inicial do card-alvo (nome, etapa, prioridade) via query no banco.
- Após cada clique: aguardar 1-2s, capturar screenshot e reconsultar o banco para validar a mudança esperada.
- Marcar cada teste como **PASSOU** / **FALHOU** com evidência (screenshot + valores antes/depois).
- Escolher cards distintos (para não interferir uns nos outros) dentre os 140 seeds criados.

## Validações por botão
| Botão | Verificação |
|---|---|
| Prioridade | `prioridade` no DB muda para o próximo valor + toast "Prioridade: …" |
| Voltar | `fluxo_etapa` recua uma coluna |
| Avançar | `fluxo_etapa` avança uma coluna |
| Chamar (Triagem) | Nova linha em `senhas` (tipo N, status chamada) + etapa vai para atendimento + toast "Chamando …" |
| Rechamar (Atendimento) | Nova linha em `senhas`, etapa permanece "atendimento" |
| Finalizar | Etapa vai para `finalizado` |

## Relatório final
Tabela resumo com paciente-alvo, ação, esperado, obtido, status (✅/❌), erros de console/rede se houver, e prints em `/tmp/browser/fluxo-test/screenshots/`.
