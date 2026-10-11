# Revisão de segurança completa — 11/10/2026 04:10 UTC (somente leitura)

Nada foi alterado. Este documento é o relatório; aprovar não aplica nenhuma correção. Cada correção será pedida e aprovada à parte.

## Estado medido agora

- Tabelas públicas sem RLS: **0**
- Políticas de gravação com `true`: **0**
- Funções elevadas (`SECURITY DEFINER`): **314** (eram 303); executáveis por visitante sem login: **71** (igual à revisão anterior)
- Sem Edge Functions; rotas públicas em `src/routes/api/public/`
- Escaneamento automático: 2 erros de código, 2 erros de banco, 14 avisos

## Achados

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Alta | `src/routes/api/nina-voz.ts` | Rota de voz (TTS Gemini) não confere usuário no próprio código; confia só na proteção do site. Qualquer chamada direta gasta crédito de IA pago. | Exigir sessão válida (`requireSupabaseAuth` ou validação do token no handler) e limite por usuário/minuto. |
| 2 | Alta | `src/lib/coach/salvar.functions.ts` | Texto salvo por atendente vai para relatórios do Coach sem escapar HTML — pode injetar código na tela/impressão de quem abre o relatório. | Escapar HTML na geração do relatório (ou sanitizar ao salvar). |
| 3 | Alta | tabelas `especialidade_unidade`, `tipo_servico_unidade` | Leitura `USING (true)` para **anon**: qualquer visitante lista vínculos de especialidade/serviço de todas as clínicas. Ficou incoerente com `especialidades`/`tipos_servico`, restritas a admin na última correção. | Decidir com a equipe: só logados da clínica (`is_member`) ou manter público se o agendamento online depender disso. Possível regra de negócio — validar com a equipe da clínica. |
| 4 | Alta | função `checkin_agendamento` | Continua executável por visitante; com token muda estado do agendamento e devolve nome. | `REVOKE EXECUTE ... FROM anon`, manter para authenticated/totem via `_totem_autorizado`. |
| 5 | Média | `src/routes/api/public/tts.ts` | Rota pública de voz do painel: sem login nem limite de uso; o fallback gasta crédito de IA. | Exigir token público da clínica (como o totem) e limite por minuto. |
| 6 | Média | `src/routes/api/public/whatsapp.$clinicaId.ts` | Registros de auditoria gravados antes de validar assinatura da Meta — terceiros podem inserir registros falsos. | Validar `X-Hub-Signature-256` antes de qualquer gravação. |
| 7 | Média | `src/routes/_authenticated/app.orcamentos-agenda.tsx`, `app.orcamentos.tsx` | Recebe mensagens `postMessage` sem conferir a origem — outro site aberto pode mandar pedidos de agendamento / manipular exportação. | Conferir `event.origin` contra a origem do próprio app. |
| 8 | Média | `src/lib/nina/aprendizado.functions.ts`, `src/lib/mcp/tools/buscar-pacientes.ts` | Texto de busca entra cru no filtro `.or()` — dá para alargar a busca (na de pacientes, ver mais pacientes que o pretendido dentro da clínica). | Escapar `, ( ) .` ou usar filtros separados `.ilike()`. |
| 9 | Média | `src/lib/nina/teste-console.functions.ts` | Membro de uma clínica pode ver atividade da Nina de outra clínica (falta conferir vínculo com `clinicaId`). | `assertMembroDaClinica` antes da leitura. |
| 10 | Média | `src/lib/consulta-ia.functions.ts`, `nina.functions.ts`, `atendimento-ai.functions.ts`, `francisco/functions.ts`, `src/routes/api/nina-fala.ts` | Cliente consegue enviar mensagens com papel "system/assistant" ou trocar instruções da IA. | Aceitar só papel `user` vindo da tela; instruções montadas no servidor. |
| 11 | Média | 71 funções elevadas abertas a anon | Inclui funções de paciente, relatórios, Coach e Crédito citadas nas revisões anteriores (itens ainda abertos). | Revogar `anon` em lote, mantendo só as públicas de propósito (agendamento online, totem com token, contrato público). |
| 12 | Média | `pagar_cobranca_credito_clinica` / papéis | Papel autorizado para pagamento do Crédito ainda não confirmado; existem duas fontes de papel (`user_roles` e `clinica_memberships`). | Confirmar regra com a equipe e unificar a checagem. |
| 13 | Baixa | `src/components/medico/paciente-dialogs.tsx` | Dados do paciente vão para HTML de impressão sem escapar. | Escapar HTML nos campos impressos. |
| 14 | Baixa | `src/routes/_authenticated/app.agenda.tsx` | Exportação da agenda permite fórmula de planilha (`=`, `+`, `-`, `@`). | Prefixar `'` nessas células. |
| 15 | Baixa | `integration_secrets` / tela antiga de Segredos | Tela mostra 4 primeiros e 2 últimos caracteres do valor e o lê no navegador. | Não trazer `valor` para o cliente; mostrar só "configurado". |
| 16 | Baixa | itens antigos | Rota timeout da Nina, concorrência do webhook Francisco, rate limit do totem sem teste físico, baixa financeira podendo editar todo o agendamento — sem mudança desde a última revisão. | Manter na fila. |
| 17 | Crítica (indireta) | dependências | `proxy-addr` (via `@lovable.dev/mcp-js`) crítico; altos em `undici`, `sharp`, `ws` (ferramentas de build), `seroval`, `fast-uri`, `@modelcontextprotocol/sdk`, `js-yaml`. Todos indiretos. | Atualizar `@lovable.dev/mcp-js`, `@tanstack/*` e `@cloudflare/vite-plugin` para versões que puxam as correções; rodar testes. |

## OK

Segredos ficam só no servidor; chave de serviço não aparece no navegador; API v1 e token do totem conferidos; RLS ativo em todas as tabelas.

## Limitações

Não revisei as 314 funções nem todas as ~260 políticas uma a uma; não confirmei se o agendamento online depende das tabelas do item 3.

## Ordem sugerida (aguarda autorização)

1. Itens 1, 2, 4 (rápidos, alto risco)
2. Item 3 (depois da decisão da equipe)
3. Itens 5–10
4. Item 11 em lote, com lista revisada antes
5. Dependências (item 17)
