# Auditoria de aplicação das instruções da Nina (por turno e por rodada)

## Objetivo

Mostrar, com evidência, **como cada instrução publicada foi aplicada** em cada turno, e corrigir três diagnósticos que hoje podem enganar quem lê o resultado.

## Escopo

Nina do WhatsApp (produção e homologação) — apenas registro/auditoria e os diagnósticos da Homologação. Não muda prompt publicado, modelos, pesos, regras de negócio, envio real, banco de dados de atendimento nem WhatsApp real.

## O que muda (antes → depois)

| Hoje | Depois |
| --- | --- |
| O resumo do turno guarda versão, hashes, transformações e entrega, mas não as regras nem a verificação de cada exigência | Guarda também: instruções de sistema efetivamente enviadas, regras identificadas, aplicáveis, não aplicáveis, não interpretadas, gerais suprimidas por exceção, resultado por exigência, resposta original do modelo, intervenções e texto entregue com hash |
| "Restrições cumpridas" pode aparecer mesmo quando nenhuma exigência foi extraída | Quando a leitura das regras falha, o resultado é **indeterminado**, nunca "cumpridas" |
| "Validar fonte e aderência" aprova com `includes` | Regra de resposta exata é conferida por **igualdade literal**; o diagnóstico declara que usa caminho isolado e lista o que do atendimento normal não percorre |
| "Validar atendimento completo" busca o último resumo da clínica | Busca pelo **ID exato do turno/execução** e conversa, sem associar outro atendimento |
| Um único veredito de aderência | Cinco resultados separados: versão carregada, prompt enviado, modelo cumpriu, sistema alterou o texto, mensagem entregue cumpriu |

## Arquivos

Novo
- `src/lib/nina/rastreio/auditoria-instrucoes.ts` — módulo puro com o contrato da auditoria por rodada: conjuntos de regras, estados por exigência (`cumprida`, `descumprida`, `nao_aplicavel`, `indeterminada`, `sem_regras`, `falha_de_interpretacao`), resposta original, intervenções e entrega com hash.
- Testes: `auditoria-instrucoes.test.ts` e um teste de **dois turnos simultâneos** garantindo que as evidências não se misturam.

Alterados
- `src/lib/nina/rastreio/turno.ts` — `RegistroTurno` ganha a lista de auditorias por rodada e `resumoTurnoParaTrace` passa a serializá-la (referências, contagens e hashes; sem texto de paciente).
- `src/lib/nina/rastreio/turno.server.ts` — funções para registrar a auditoria da rodada, a resposta original do modelo e o texto entregue.
- `src/lib/whatsapp.server.ts` — captura por rodada: prompt composto (envelope, comportamento, contrato de precedência), regras do turno, regras suprimidas pela precedência, resposta original, intervenções já rastreadas e texto final entregue. Também nos caminhos de encaminhamento e fallback.
- `src/lib/nina/homologacao/verificacoes.ts` — igualdade literal na aderência de fonte; separação dos cinco resultados; aviso explícito de caminho isolado; marcador produzido por código nunca conta como prova de obediência do modelo.
- `src/lib/nina/homologacao/verificacoes.server.ts` — devolve `turnoId`/`execucaoId` do pipeline e consulta o resumo por esses identificadores e pela conversa, em vez do último da clínica.
- `src/lib/nina/ai-gateway.server.ts` — apenas se necessário para expor identificadores de rodada/execução já existentes; sem log de segredo nem de prompt fora do diagnóstico autorizado.

## Detalhes técnicos

- Captura completa do texto das instruções continua sujeita ao diagnóstico autorizado por clínica (`nina_diagnostico_payload`) e à sanitização atual; fora dele são gravados hashes, contagens e IDs de regra.
- O vínculo anti-mistura usa `turnoId`/`execucaoId`/`conversaId` já existentes em `eventoEntregaDoTurno`; nenhuma busca por "mais recente".
- Registro de auditoria nunca derruba atendimento: toda falha é apenas logada, como já ocorre no rastreio.

## Validação

Typecheck, testes direcionados (homologação, rastreio, confiança), suíte completa e build. Sem envio real, publicação, migração ou alteração de dados.

## Pendências

Validação visual autenticada e execução real na Homologação dependem de você confirmar ambiente e clínica.
