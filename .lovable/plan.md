# Revisão de segurança — 14/10/2026 04:07 UTC (somente leitura, nada foi alterado)

Este documento é o relatório. Aprovar NÃO aplica nenhuma correção; cada item só será corrigido com pedido explícito.

## 1. O que mudou nas últimas 24h

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Média | `tel_chamadas`, `tel_transcricoes`, `tel_analises`, `tel_fila_analise` | RLS correta (só leitura, `clinicas_do_usuario()` + `coach_pode_gerir`, escrita só servidor). Porém transcrições guardam fala integral de pacientes (dado de saúde) sem prazo de retenção definido. | Definir retenção (ex.: igual à de 6 meses das mensagens) — regra a validar com a clínica. |
| 2 | Média | `src/lib/coach/telefonia.functions.ts` (`ligacoesParaAnalise`, `resumoLigacoesTelefonia`, `lerTranscricaoLigacao`) | Exigem só nível `read` do Coach, mas usam caminho de servidor que ignora a RLS (que exige `coach_pode_gerir`). Quem tem só leitura do Coach pode ver telefones, transcrições e lista de retorno que a RLS bloquearia. | Alinhar: exigir o mesmo critério da RLS ou consultar com o cliente do usuário. Validar com a equipe quem deve ver. |
| 3 | Baixa | `coach_resumo_ligacoes` (migrations 0013/0014) | SECURITY DEFINER sem checagem interna de clínica; mitigado porque o EXECUTE é só `service_role`. Risco só se alguém regravar o GRANT. | Manter grant; opcionalmente adicionar checagem interna. |
| 4 | Baixa | `src/lib/coach/telefonia-sufficit.server.ts:51` | Log usa `error.message` do banco (demais logs só usam código). Não vaza token, mas foge do padrão. | Logar só `error.code`. |
| 5 | Baixa | Lote de análise (`fila-analise.server.ts`) | Sem limite por usuário além da cota diária; cota calculada em dia UTC enquanto a tela fala em horário de São Paulo. | Unificar fuso da cota. |
| 6 | Baixa | `src/lib/nina/dados-transferencia.ts` | Nome completo e data de nascimento vão em texto para a recepção na transferência. Acesso segue a RLS das conversas; conferir que o texto não entra em logs nem no resumo exportado. | Confirmar com a equipe; nenhum log encontrado no arquivo. |
| 7 | Info | Auditoria legível / protocolo simulado de homologação | Não encontrei esses commits nas últimas ~30h do histórico. `audit_log` segue restrita a gestores e financeiro (tabelas financeiras). | Indicar o commit/PR para revisar. |

## 2. Achados gerais (já conhecidos, continuam abertos)

| Sev. | Onde | Achado | Correção |
|---|---|---|---|
| Alta | `src/routes/api/nina-voz.ts` | Correção de login feita, mas ainda não publicada — produção continua aberta. | Publicar com autorização. |
| Média | Banco | 71 funções SECURITY DEFINER executáveis por visitante sem login; 219 por qualquer usuário logado. | Revisar e revogar EXECUTE das que não são públicas. |
| Média | Papéis | Duas fontes de papel (`clinica_memberships.role` vs `user_roles`). | Unificar fonte. |
| Média | Fotos de orçamento | Retenção indefinida se não buscadas. | Expirar automaticamente. |
| Baixa | Banco | 19 tabelas com RLS sem policy (bloqueadas — sem vazamento); 1 função sem `search_path`; 6 extensões no schema público. | Fixar `search_path`; mover extensões. |
| Baixa | Diversos | Impressão sem escape de HTML, mensagens entre janelas sem checar origem, CSV sujeito a fórmula, busca sem saneamento. | Escapar/sanitizar. |

## 3. Dependências (81 pacotes)

- Crítica: `proxy-addr` via `@lovable.dev/mcp-js` (falsificação de IP) — só ferramenta de desenvolvimento, impacto baixo em produção.
- Altas: `undici`, `ws`, `sharp` (via plugin Cloudflare de build), `seroval` (via TanStack Router/Start — afeta o app rodando: estouro de memória), `fast-uri`, `js-yaml`, `browserslist`.
- Sugestão: atualizar TanStack Router/Start primeiro (único com impacto direto em produção).

## 4. Não verificado

- Teste com usuário real logado em cada papel.
- Conteúdo real dos logs de produção.
- Segredos: nenhum valor encontrado em código; `.env` versionado contém só chaves públicas.
