## Objetivo

Melhorar a visualização das mensalidades em contratos com renovação (como o da paciente Quédima Suelen), atendendo dois pontos:

1. **Reiniciar a contagem de parcelas a cada renovação** — quando o contrato tiver ciclos (Original + Renovação 1, Renovação 2…), cada ciclo mostra parcelas numeradas de **1 a 12** (ou o total do ciclo). Hoje, a coluna `#` mostra 1..24 (números absolutos do banco), o que confunde a leitura.
2. **Novas parcelas (mais recentes) aparecem no topo da lista** — hoje a tabela começa pelo ciclo original (parcela 1 do contrato antigo) e as parcelas da renovação, que são as que ainda precisam ser pagas, ficam lá embaixo. Vamos inverter a ordem dos ciclos: a **renovação mais recente aparece primeiro**, seguida pelas anteriores, e por último o ciclo original.

Nenhuma regra de negócio ou dado do banco muda — o ajuste é puramente de exibição na aba **Mensalidades** dos contratos.

## Como será o comportamento

- Coluna `#` (Parcela):
  - Adesão continua com o selo "Adesão".
  - Taxa de inclusão continua com o selo "Taxa inclusão".
  - Parcelas mensais passam a mostrar a posição **dentro do ciclo** (1/12, 2/12… reiniciando a cada renovação). Contratos sem renovação continuam exatamente como estão.
- Ordem das linhas:
  1. Adesão (topo).
  2. Taxas de inclusão de dependente (por vencimento).
  3. Parcelas mensais agrupadas por ciclo, **do mais recente para o mais antigo** (Renovação 2 → Renovação 1 → Original). Dentro de cada ciclo, mantém a ordem por número da parcela (1, 2, 3…).
- Cabeçalho de ciclo (ex. "Renovação 1 — 27/06/2026 a 27/05/2027") continua aparecendo antes do primeiro item do ciclo.
- Card "Pagas X/Y" no topo do contrato continua refletindo o ciclo atual (já é assim hoje).

## Detalhes técnicos

Arquivo: `src/components/pages/contratos-page.tsx`.

1. Criar um mapa `parcelaLocalPorId: Record<string, { pos: number; total: number }>` a partir da segmentação já existente em `ciclos` (linhas 3150-3170). Para cada ciclo, iterar `ciclo.parcelas` e gravar `pos = idx + 1`, `total = ciclo.parcelas.length`.
2. Na coluna `#` (linha 3889), substituir `m.numero_parcela` por `parcelaLocalPorId[m.id]?.pos ?? m.numero_parcela` quando `temCiclosMultiplos`. Sem renovação, mantém `m.numero_parcela`.
3. Ajustar o sort de `linhasCobranca` (linhas 3099-3106) para, quando `ra === 2` (parcela mensal), ordenar primeiro por **índice do ciclo decrescente** e depois por `numero_parcela` crescente. Usar um `Map<id, cicloIndex>` derivado de `ciclos` para O(1).
4. Manter o cabeçalho de ciclo já existente (linhas 3844-3870); ele funciona por "primeira parcela do ciclo encontrada na iteração", então continua correto após a inversão (a 1ª parcela do ciclo mais recente aparece primeiro).

Sem alterações no banco, RPCs ou lógica de geração de parcelas. Sem impacto em agenda, caixa, comprovantes, exportações ou renovação — apenas a renderização da tabela de mensalidades.

## Fora de escopo

- Reescrever contagem no banco (`numero_parcela` permanece contínuo internamente).
- Mudar carne/impressos.
- Mudar ordem em portal do paciente / cartão digital.

## Validação

- Verificar visualmente no contrato da Quédima Suelen: Renovação 1 aparece no topo com parcelas 1/12…12/12 e ciclo Original abaixo, também 1/12…12/12.
- Conferir um contrato sem renovação para garantir que nada mudou.
- Conferir contrato só com adesão + taxa de inclusão para garantir que continuam no topo.