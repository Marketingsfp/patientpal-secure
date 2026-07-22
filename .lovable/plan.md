## Objetivo

Trocar o desenho atual dos dentes no odontograma clínico (retângulos com raiz genérica) por formatos anatômicos mais realistas, no estilo da foto 2 (contornos de coroa + raízes por tipo de dente), mantendo TODA a lógica clínica atual (5 faces clicáveis, cores por status, seleção, anel âmbar de "orçado", arcadas permanente/decídua/mista, legenda).

## Escopo (o que muda)

Somente visual do componente `src/components/odontologia/odontograma-clinico.tsx` (usado dentro da aba "Prontuário" em `/app/odontologia`).

Não muda:
- Nada em `src/components/odontograma.tsx` (versão simples, usada em outros lugares — se o usuário quiser aplicar também lá, faço em seguida).
- Nada em `src/lib/odonto.ts` (status, cores, faces).
- Nada em orçamento/`DentePicker`/backend.

## Clínica-alvo (Regra 1.10)

Como é ajuste puramente visual do componente compartilhado (sem regra de negócio), a mudança valeria para as 3 clínicas por natureza. **Vou confirmar isso com você antes de aplicar** — se quiser restringir a uma clínica específica, coloco atrás de flag `odontograma_anatomico` por `clinica_id`.

## Como vai ficar

Para cada dente vou desenhar um SVG anatômico com **coroa + raízes** conforme o tipo (FDI):

- **Incisivos (11–13, 21–23, 31–33, 41–43 e decíduos 51–53, 61–63, 71–73, 81–83)**: coroa retangular alta e afilada, 1 raiz longa e fina.
- **Pré-molares (14–15, 24–25, 34–35, 44–45)**: coroa mais quadrada, 1 raiz (superiores podem ter leve bifurcação sugerida).
- **Molares (16–18, 26–28, 36–38, 46–48 e decíduos 54–55, 64–65, 74–75, 84–85)**: coroa larga com sulco central, superiores com 3 raízes (2 vestibulares + 1 palatina), inferiores com 2 raízes (mesial + distal).
- Superior x inferior: raízes viradas para cima nos superiores (quadrantes 1/2/5/6) e para baixo nos inferiores (3/4/7/8), como já é hoje.

A coroa continua sendo o `clipPath` das 5 áreas de face clicáveis (V/M/D/L/O), então **click e coloração por face permanecem idênticos** — só o contorno do clipPath vira anatômico em vez de retangular.

Estilo do traço: `stroke="hsl(var(--border))"`, `stroke-width` fino (~0.9), fill das faces pelas cores de status. Aparência limpa/linear, coerente com a foto 2 (contorno cinza-azulado, sem sombra, sem preenchimento decorativo).

Layout: manter linhas superior/inferior, numeração FDI centralizada acima de cada dente, separador entre superior e inferior. Larguras diferentes por tipo (molar mais largo que incisivo) para casar com a proporção da foto 2.

## Passos técnicos

1. Criar helper `toothShape(dente)` retornando `{ crownPath, rootPath, width, height }` conforme tipo (incisivo/canino/pré-molar/molar) e arcada (sup/inf).
2. Reescrever `DenteFaces` em `odontograma-clinico.tsx` para usar esses paths — recalcular os polígonos V/M/D/L/O dentro do `viewBox` da nova coroa (mesma divisão em 4 trapézios + retângulo central, agora recortados pelo `crownPath` anatômico).
3. Ajustar `viewBox` e tamanho render (`h-16 w-*`) para variar por tipo de dente.
4. Manter `title` (tooltip), anel âmbar de orçado, destaque de seleção, tratamento de decíduos e a `Legenda` inalterada.

## Validação

- Abrir `/app/odontologia` na aba Prontuário: conferir aparência nas 3 arcadas (permanente/decídua/mista).
- Clicar em faces individuais: garantir que cor/estado ainda são gravados corretamente por face.
- Conferir orçamento vinculado: dente marcado ainda mostra anel âmbar e ponto.

## Perguntas antes de implementar

1. Aplico nas **3 clínicas** (Menino Jesus, SFP, Sant Marché) ou só em uma? (visual, sem regra de negócio — default seria as 3)
2. Aplico o mesmo desenho anatômico também no odontograma simples de `src/components/odontograma.tsx` (usado no `DentePicker` de orçamento) ou mantenho ele com o visual atual mais compacto?