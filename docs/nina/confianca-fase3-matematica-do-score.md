# Fase 3 — Matemática e significado do score de confiança

## O problema

O motor calculava a nota só com as dimensões "aplicáveis". Quando nenhuma
dimensão era aplicável, o denominador ficava zero e o código devolvia `100`.
Resultado prático: **quanto menos o sistema verificava, mais confiante ele se
declarava**. Uma resposta sem catálogo consultado, sem intenção clara e sem
ferramenta executada podia sair com "confiança alta".

## O que mudou

### 1. Estados de validação com significados distintos

| Status | Significado | Entra na nota? | Entra na cobertura? |
|---|---|---|---|
| `PASS` | verificado e aprovado | sim | sim |
| `WARNING` | verificado com ressalva | sim | sim |
| `FAIL` | verificado e reprovado | sim | sim |
| `BLOCK` | reprovação que impede a ação | sim | sim |
| `UNKNOWN` | **relevante, mas sem evidência** | não | conta como não coberta |
| `NOT_APPLICABLE` | legitimamente irrelevante no turno | não | não |

`UNKNOWN` nunca equivale a `PASS`. Ele não é tratado como erro comprovado
(não vira bloqueador), mas derruba a cobertura e pode limitar a decisão.

### 2. `evidence_coverage` (0–100)

Nova medida, separada da nota: quanto do peso relevante foi de fato
verificado. A nota responde "o que foi verificado deu certo?"; a cobertura
responde "quanto foi verificado?". As duas viajam juntas na decisão e na
auditoria.

### 3. Fim do `return 100`

Sem nenhuma dimensão avaliável, o resultado é nota `0` e
`confidence_insufficient = true`. Isso nunca produz `HIGH` nem `ALLOW`.

### 4. Tetos centralizados e versionados

Todos os limites vivem em `policy.ts` (`POLITICA_PADRAO.cobertura`):

- `minimaParaHigh: 70` — abaixo disso não existe nível alto;
- `minimaParaAllow: 50` — abaixo disso a resposta não é liberada direto;
- `tetoScoreCoberturaBaixa: 74` — teto de nota com cobertura insuficiente;
- `dimensoesCriticas` — intenção, dados obrigatórios, fonte oficial e
  integridade das ferramentas: desconhecida qualquer uma delas, o turno não
  chega a `HIGH`;
- `fontesObrigatorias` — fonte oficial desconhecida nunca libera resposta; em
  ação de escrita, bloqueia a ação.

Os pesos dos validadores **não** foram alterados.

### 5. Versão da política

`VERSAO_POLITICA` passou de `v1` para `v2`, porque a interpretação da nota
mudou. Snapshots já gravados mantêm a versão com que foram criados — nada é
reescrito, e a leitura antiga continua válida no seu próprio contexto.

## Antes e depois

| Situação | Antes | Depois |
|---|---|---|
| Nenhuma dimensão aplicável | 100 / HIGH / ALLOW | 0 / insuficiente / não libera |
| Só a intenção verificada, ótima | 100 | nota alta, cobertura baixa, teto 74, sem HIGH |
| Fonte oficial não verificada | fora do cálculo | `UNKNOWN`, derruba cobertura, não libera |
| Saudação sem catálogo | dispensa | dispensa (`NOT_APPLICABLE` legítimo, cobertura 100%) |

## Validação executada

- `bunx tsgo --noEmit` — sem erros.
- `bun test src/lib/nina` — 1.013 testes, 0 falhas.
- Gate da fase em `src/lib/nina/confidence/cobertura-evidencias.test.ts`:
  pouca evidência ≠ 100; `UNKNOWN` ≠ `PASS`; `NOT_APPLICABLE` legítimo
  preservado; cobertura registrada; dimensão crítica desconhecida limita a
  decisão.
- O teste de baseline da Fase 1 que congelava o `100` indevido foi convertido
  em teste de regressão do comportamento corrigido, com a origem documentada.

## Pendências

- Nenhum fluxo vivo com o modelo foi executado nesta fase.
- O efeito da cobertura sobre o volume real de `CLARIFY`/handoff só pode ser
  medido observando o Shadow Mode com tráfego real.
