## Objetivo

Fazer com que cada profissional/agenda tenha sua **própria sequência de fichas** (001, 002, 003…) por dia, **independente** de qual filtro está ativo, de qual query o `load()` executou por último, ou de quantas linhas o servidor devolveu. O laboratório deve ver 001–023 sempre — nunca 024, 039, 058…

## Diagnóstico (o que está errado hoje)

Arquivo: `src/routes/_authenticated/app.agenda.tsx`, bloco `fichaPorId` (linhas 2017-2040).

1. A ficha exibida **não vem do banco** — é recalculada posicionalmente no cliente com base em `items`.
2. `items` depende do `load()`, que **empurra o filtro de médico para o servidor** (linha 1204-1206). Isso muda o conjunto de agendamentos usado como base da contagem entre um reload e outro.
3. O comentário atual diz "fila única global por dia da clínica", mas a implementação real produz "fila local do médico" quando o filtro está ativo — daí as duas fotos incompatíveis.

## Regra correta (confirmada pelo usuário)

**Foto 1 é o comportamento esperado.** Cada profissional (ou recurso de enfermagem) tem sua própria sequência começando em 001 dentro do dia. O filtro visual do usuário **não deve alterar** os números — mudar o filtro só esconde/mostra linhas.

## O que vou alterar

Um único bloco em `src/routes/_authenticated/app.agenda.tsx`:

**Substituir a lógica de `fichaPorId` (linhas 2017-2040)** para numerar por chave composta `(dia, medico_id)`:

```text
- ordenar TODOS os items por (inicio, paciente_nome)
- para cada linha:
    chave = dia (YYYY-MM-DD) + medico_id
    contador[chave] += 1
    fichaPorId[a.id] = padStart(contador[chave], 3, "0")
```

Assim:
- LABORATORIO no dia 14/07 sempre vai de 001 a 023, independente de qual filtro esteja aplicado.
- Cada médico tem sua própria sequência 001, 002, 003… no mesmo dia.
- Recursos de enfermagem (que já são mapeados como "médicos virtuais" na linha 1268) participam da mesma regra automaticamente.
- Slots sem médico atribuído (raros) ficam agrupados numa sequência à parte por dia, o que preserva o comportamento antigo desses casos-limite.

Também atualizo o **comentário** do bloco para refletir a regra correta ("sequência por profissional dentro do dia"), removendo o texto atual que diz o oposto.

## O que **não** vou mexer

- Não vou tocar em `load()`, nem retirar o filtro do servidor. Ele continua útil para performance.
- Não vou usar a coluna `ficha_numero` do banco nesta rodada — ela está sendo carregada mas nunca foi usada como fonte de verdade, e não sei se ela é preenchida de forma consistente em todos os pontos de criação (múltiplo, orçamento, reagendamento). Auditar isso é outro trabalho.
- Não vou mudar impressão de comprovante, senha, chamada, prontuário nem lançamentos financeiros — tudo isso já usa `id` do agendamento, não o número exibido.
- Não vou alterar permissões, RLS, nem regras de repasse/estorno.

## Impacto e riscos

- **Impacto positivo:** número da ficha estável entre reloads, filtros e usuários.
- **Risco baixo:** a mudança é isolada a um `useMemo` de UI. Cai fora de qualquer fluxo transacional.
- **Ponto de atenção:** quem já estava acostumado com o comportamento "salpicado" da foto 2 vai ver os números baixarem. Nada quebra — só fica mais previsível.

## Validação

1. Typecheck do arquivo alterado.
2. Abrir `/app/agenda`, aplicar filtro LABORATORIO no dia 14/07/26 e conferir que aparece 001–023 sequencial.
3. Trocar o filtro para outro médico e voltar — os números devem permanecer os mesmos por profissional.
4. Recarregar a página várias vezes — números não podem mudar.
5. Tirar o filtro (TODOS) — cada linha continua com o número do seu próprio profissional (várias linhas com 001 é esperado, uma por médico).

## Fora de escopo (para outra rodada, se quiser)

- Auditar se a coluna `ficha_numero` no banco reflete a mesma regra em todos os pontos de criação e, se sim, passar a exibir dela direto. Isso elimina qualquer chance de dois usuários verem números diferentes.
- Revisar impressão de comprovante/senha para incluir o nome do profissional junto do número, já que 001 passa a existir uma vez por médico.
