## Objetivo
Refazer o desenho do odontograma na aba "Prontuário" de Odontologia para ficar **visualmente igual à foto de referência** enviada (dentes com contorno anatômico limpo, traço fino azul-acinzentado, coroa + raízes bem definidas, numeração FDI abaixo, arcadas separadas por linha pontilhada).

## Escopo
- Arquivo único: `src/components/odontologia/odontograma-clinico.tsx`
- Trocar as formas SVG atuais (que ficaram "gordas" e simplificadas) por **desenhos anatômicos fiéis** à imagem de referência, dente por tipo:
  - Incisivos centrais/laterais (11–13, 21–23, 31–33, 41–43): coroa retangular estreita com borda incisal reta + 1 raiz longa e afilada.
  - Caninos (13, 23, 33, 43): coroa com ponta (cúspide) + 1 raiz longa robusta.
  - Pré-molares (14–15, 24–25, 34–35, 44–45): coroa com 2 cúspides + 1–2 raízes.
  - Molares (16–18, 26–28, 36–38, 46–48): coroa larga com 4 cúspides + 2 raízes (inferiores) ou 3 raízes (superiores), como no desenho.
- Manter dentes superiores com raízes para cima e inferiores para baixo, seguindo o layout da referência (18→28 em cima, 48→38 embaixo).
- Manter linha pontilhada horizontal separando as arcadas.
- Numeração FDI abaixo de cada dente superior e acima de cada dente inferior, tipografia leve como na foto.
- Paleta: contorno `slate-400/500`, fundo branco, sem preenchimento pesado.

## Preservado (não muda)
- Lógica clínica existente: 5 faces clicáveis (V/M/D/L/O) via `clipPath` sobre a coroa.
- Estados/cores por condição (cárie, restauração, ausente, etc.).
- Seleção de dente, tooltip, integração com timeline e orçamento.
- Numeração FDI e ordem dos quadrantes.

## Como vou executar
1. Reescrever `toothShape` (e helpers `toothType`) para gerar `path`s anatômicos por tipo de dente, espelhando a referência.
2. Ajustar `viewBox`, espaçamento entre dentes e proporção coroa/raiz para bater com a foto.
3. Reposicionar `clipPath` das faces sobre a nova coroa para manter cliques precisos.
4. Refinar traço (`stroke-width` ~1, cor `#94a3b8`) e remover preenchimentos desnecessários.
5. Validar visualmente na rota `/app/odontologia` aba Prontuário.

## Fora do escopo
- Aba Orçamento, timeline, evolução clínica, banco de dados, regras de negócio.
- Nenhuma alteração em outras clínicas/flags — é ajuste puramente visual, global.

## Clínica-alvo
Ajuste **visual/UI** sem regra de negócio. Confirma que aplico **para todas as 3 clínicas** (SFP, Menino Jesus e a terceira)? Se quiser restringir a uma, me diga qual.