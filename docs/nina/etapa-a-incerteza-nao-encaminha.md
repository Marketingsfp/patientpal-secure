# Etapa A: incerteza pura não encaminha

**Nota de 16/09/2026:** o commit `4167d03ae` (resposta direta) retirou o motor de confiança do atendimento e da homologação. A ligação desta regra em `src/lib/whatsapp.server.ts` deixou de existir junto com o restante da avaliação; a regra permanece implementada e testada em `baixa-confiabilidade.ts` para o caso de o motor voltar ao fluxo.

Data: 15/09/2026. Arquivos: `src/lib/nina/confidence/baixa-confiabilidade.ts`, `src/lib/whatsapp.server.ts`, testes em `baixa-confiabilidade.test.ts`.

## O problema

A nota do motor tem dois componentes reportados separadamente: `score` ("o que verifiquei deu certo?") e `evidenceCoverage` ("quanto consegui verificar?"). Cobertura abaixo de 70% limita a nota a 74, um ponto abaixo do corte de MEDIUM. A regra obrigatória de baixa confiabilidade encaminha todo LOW para atendimento humano **inclusive na etapa A**, que por definição "só observa".

Resultado: uma resposta sem nenhuma dimensão reprovada, sem bloqueador absoluto e sem afirmação sem fonte era descartada só porque o motor não conseguiu olhar o suficiente. Incerteza estava sendo tratada como falha.

## O que mudou

`decidirBloqueioBaixaConfianca` recebe um novo sinal, `incerteza`, com dois campos medidos pelo runtime a partir do resultado do motor e da política vigente da clínica:

- `coberturaInsuficiente`: `evidenceCoverage < politica.cobertura.minimaParaHigh`;
- `falhaComprovada`: algum validador com peso na nota terminou em FAIL ou BLOCK.

Na **etapa A**, um LOW com `coberturaInsuficiente = true` e `falhaComprovada = false` não bloqueia nem encaminha, desde que nenhum destes sinais esteja presente:

| Impedimento | Efeito |
| --- | --- |
| `FALHA_COMPROVADA` | encaminha |
| `BLOQUEADOR_ABSOLUTO` | encaminha |
| `AFIRMACAO_SEM_FONTE` | encaminha |
| `PEDIDO_DE_ATENDIMENTO_HUMANO` | encaminha (motivo próprio, independe da nota) |
| `CONFLITO_DE_IDENTIDADE` | encaminha |
| `CONFORMIDADE_BLOQUEANTE` | encaminha |

Regra publicada aplicável **não verificada** não é impedimento: é incerteza, não falha. Ela continua sendo tratada pela conformidade de entrega, que roda logo depois e mantém o próprio bloqueio para exigências críticas.

A partir da **etapa B** a incerteza volta a encaminhar, como antes. Sem o sinal `incerteza` (chamadas antigas), o comportamento é o anterior: LOW encaminha.

## O que não mudou

- Nenhum número da política: pesos, limites (HIGH 90, MEDIUM 75) e tetos de cobertura (70 / 50 / 74) são os mesmos. A nota exibida continua sendo a real.
- Falha comprovada encaminha em qualquer etapa.
- Etapas B, C e D não foram tocadas.
- A conformidade com instruções publicadas continua bloqueando violação e exigência crítica não verificável.

## Auditoria

Quando a isenção vale, o turno registra:

- etapa de validação "Baixa confiabilidade por incerteza: etapa A registra e não encaminha", com nota, cobertura, cobertura mínima e as dimensões sem evidência;
- evento de rastro `answer.low_confidence_observed` com `candidato_descartado: false`;
- na decisão de bloqueio: `isencaoIncertezaEtapaA: true`, `motivo: INCERTEZA_SEM_FALHA_ETAPA_A_OBSERVA`. Quando não vale, `impedimentoIncerteza` diz por quê.

## Validação executada

- `bun test src/lib/nina/confidence/baixa-confiabilidade.test.ts`: 20 testes (9 anteriores + 11 novos), 0 falhas.
- `bun test src/lib/nina/confidence`: 1.299 testes, 0 falhas.
- `tsc --noEmit`: nenhum erro nos arquivos alterados (os erros existentes do projeto são dependências ausentes: `xlsx`, `@lovable.dev/mcp-js`).
- Nenhum fluxo vivo executado; nenhuma flag de clínica alterada.
