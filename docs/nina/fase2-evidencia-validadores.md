# Fase 2 — Evidência factual e validadores de confiança

## O que mudou

Antes, o motor de confiança olhava principalmente para sinais agregados
("o catálogo encontrou algo", "a ferramenta respondeu com sucesso").
Agora ele trabalha com **fatos concretos** extraídos do retorno real de cada
consulta.

- **Antes:** ferramenta respondeu com sucesso → afirmação considerada apoiada,
  mesmo que o valor dito pela Nina não existisse no retorno.
- **Depois:** a afirmação só é considerada comprovada quando existe um fato do
  mesmo campo, do mesmo procedimento/profissional/unidade e com o mesmo valor.

## Peças novas

- `src/lib/nina/confidence/evidencia.ts` — tipos de fato e de consulta,
  normalização, comparação monetária/textual, correspondência entre afirmação e
  fato, consolidação de tentativas (retry) e detecção de retorno truncado.
- `src/lib/nina/confidence/evidencia-extrator.ts` — traduz os retornos reais das
  ferramentas (catálogo, agenda, agendamento, paciente) em fatos e no status da
  consulta. Formato desconhecido nunca vira fato: vira `nao_verificado`.
- `src/lib/whatsapp.server.ts` — coleta os fatos durante a execução das
  ferramentas e os entrega ao motor junto do texto final.

## Regras de status da consulta

| Situação | Status | Efeito |
| --- | --- | --- |
| Retorno com registros | `com_itens` | pode sustentar afirmação correspondente |
| Retorno sem registros | `vazio` | sustenta **negativa**, nunca afirmação |
| Erro técnico | `falha` | nunca vira "não temos" |
| Formato não reconhecido | `nao_verificado` | avaliação fica incompleta |
| Resposta cortada por limite | `truncado` | avaliação incompleta |

Falha refeita com sucesso (retry) deixa de contar como falha do turno — a mesma
regra vale no validador de integridade e nas verificações do motor, que antes
divergiam entre si.

## Casos tratados explicitamente

- Preço divergente do catálogo (R$ 999 contra R$ 150) não é liberado.
- Preço igual ao catálogo é liberado.
- Endereço, serviço ou convênio nunca consultados não podem ser afirmados.
- Escala do profissional não é vaga disponível.
- Reserva já gravada em turno anterior comprova o horário reservado, sem exigir
  nova consulta.
- Negativa apoiada em consulta oficial que respondeu sem itens é resposta
  correta, não bloqueio.

## Limitações

- Não houve WhatsApp real, LLM real, publicação nem produção.
- A extração cobre os formatos atuais de catálogo, agenda, agendamento e
  paciente; formatos novos entram como `nao_verificado` até serem mapeados.
