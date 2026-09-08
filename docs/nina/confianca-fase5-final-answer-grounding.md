# Fase 5 — Verificação da resposta final e grounding por afirmação

## Problema corrigido

Antes, o motor de confiança avaliava um texto e o paciente recebia outro:

```text
modelo gera texto A -> motor avalia A -> pós-processamento -> paciente recebe B
```

O número exibido ao lado da mensagem podia, portanto, não ser o número daquela
mensagem.

## Depois

```text
modelo -> ferramentas -> regras -> pós-processamento -> saudação obrigatória
-> avisos internos -> RESPOSTA FINAL -> verificação -> answer_confidence
-> persistência -> envio
```

Os gates de segurança que precisam rodar **antes** das ações críticas (agendar,
cancelar, transferir) continuam exatamente onde estavam.

## Dois conceitos separados

| Conceito | O que responde | Quando roda |
| --- | --- | --- |
| `action_safety` | é seguro executar a ação? | antes da ação |
| `answer_confidence` | a mensagem entregue é confiável? | depois de todo o texto pronto |

O indicador ao lado da mensagem da Nina passa a mostrar `answer_confidence`.
Execuções antigas, que só têm avaliação de ação, continuam sendo exibidas com o
que existe.

### Transferência não é 100%

`handoffSolicitado` já não promove a nota da mensagem. Transferir pode ser uma
ação segura (`action_safety` alto) e, ao mesmo tempo, a mensagem entregue pode
conter uma afirmação sem fonte — nesse caso a nota da resposta é baixa.

## Grounding por afirmação

`catalogoEncontrou = true` não valida mais a resposta inteira. Cada afirmação é
ligada a uma fonte:

```text
"Cardiologia custa R$ 150"  -> catálogo publicado
"Dr. João atende"            -> catálogo publicado
"há vaga sábado 14h"         -> Agenda   <- se faltar, a resposta não é confiável
"seu agendamento está feito" -> prova persistida (appointment_id)
```

A verificação é determinística: contexto estruturado, claims estruturados,
resultados de ferramentas, fontes recuperadas e estado operacional. **Nenhuma
chamada extra de modelo (GPT/Sol) entra no caminho crítico.** A leitura por
expressão regular do texto continua existindo apenas como camada complementar,
nunca como única fonte do significado operacional.

## Penalidade removida

A regra que reduzia a confiança quando a resposta trazia muitas categorias de
informação (`foco_da_resposta`) foi removida — ela conflitava com a orientação
de dar uma visão completa (valor + profissional + datas + horários + unidade).
No lugar dela: **fato sem evidência** e **afirmação não sustentada**.

## Gate de saída

A avaliação guarda a impressão digital do texto avaliado. Se o texto mudar
depois (saudação obrigatória, aviso de transferência, banner), a avaliação é
invalidada e refeita sobre o texto realmente enviado. Score de texto anterior
nunca é reaproveitado.

## Banco

Na tabela de decisões de confiança foram acrescentados: tipo de avaliação
(`action_safety` / `answer_confidence`), impressão digital do texto final e a
lista de afirmações verificadas com suas fontes. Registros antigos continuam
válidos como avaliação de ação. Nenhuma regra de acesso foi alterada.

## Validação executada

- `bunx tsgo --noEmit` — sem erros.
- `bun test src/lib/nina` — 1.037 testes, 0 falhas.
- Testes novos: grounding por afirmação, separação ação/resposta, gate de saída.

## Pendências

- Nenhum fluxo vivo foi executado: sem envio de WhatsApp, sem agendamento real,
  sem teste transacional em produção.
- A calibragem dos pesos (grounding = 20) com dados reais isolados continua
  pendente, como na Fase 4.
- A origem de `appointmentCreated` / `appointmentId` a partir de evidência
  persistida do Tool Broker segue como pendência herdada da Fase 4.
