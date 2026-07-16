## Objetivo

Na GR (guia de atendimento impressa), a linha final está mostrando duas vezes a palavra "IMPRESSÃO":

- rótulo à esquerda: `DATA IMPRESSÃO`
- valor à direita: `16/07/2026 19:25 — IMPRESSÃO Nº 4`

Quando o papel é estreito, o rótulo `DATA IMPRESSÃO` quebra a linha e exibe "IMPRESSAO" solto embaixo (o trecho circulado nas fotos). O valor à direita já traz "IMPRESSÃO Nº X", então a palavra no rótulo é redundante.

## Alteração

Apenas texto do rótulo em `src/lib/print-gr.ts`. Trocar `DATA IMPRESSAO` / `DATA IMPRESSÃO` por `DATA` nas 6 ocorrências dos layouts de GR:

- linha 787 (`DATA IMPRESSAO` → `DATA`)
- linha 1192 (`DATA IMPRESSAO` → `DATA`)
- linha 1402 (`DATA IMPRESSÃO` → `DATA`)
- linha 1596 (`DATA IMPRESSÃO` → `DATA`)
- linha 1792 (`DATA IMPRESSÃO` → `DATA`)
- linha 1859 (`DATA IMPRESSÃO` → `DATA`)

O valor à direita (`${fmtData(...)}${viaNumero >= 2 ? ` — ${viaTexto}` : ""}`) fica intacto, então continua aparecendo "16/07/2026 19:25 — IMPRESSÃO Nº 4" quando é 2ª via ou mais.

## Fora do escopo

- Nenhuma alteração em regra de negócio, numeração de vias, cálculo de valores, plano/convênio, cabeçalho ou qualquer outro trecho da GR.
- Sem alterações em outros arquivos.

## Antes / Depois

- Antes: `DATA IMPRESSÃO      16/07/2026 19:25 — IMPRESSÃO Nº 4` (com quebra: "IMPRESSAO" sobrando na linha de baixo)
- Depois: `DATA      16/07/2026 19:25 — IMPRESSÃO Nº 4` (sem repetição, sem sobra)