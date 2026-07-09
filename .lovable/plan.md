## Objetivo

1. Todo o texto da GR (Guia de Atendimento) impressa deve sair **em negrito**.
2. O cupom 80mm precisa parar de estourar em nomes longos, valores grandes, procedimentos compridos e pagamento misto — nada de texto cortado, coluna vazando ou linha "grudada".

Aplica-se aos três layouts do arquivo `src/lib/print-gr.ts`:
- GR individual (ticket do paciente).
- GR agrupada (vários agendamentos do mesmo paciente).
- Duplicata/2ª via.

Não mexe em nada da UI da agenda — só no HTML/CSS que vai pra impressora.

---

## O que muda na aparência

### Negrito global
- Peso 700 aplicado ao corpo inteiro (`body { font-weight: 700 }`).
- Elementos que hoje são `sm` (rodapé, endereço, "IMPRESSÃO Nº X") também ficam em negrito, só continuam menores.
- Cabeçalho "GUIA DE ATENDIMENTO" e valor recebido continuam maiores/destacados, mas agora sobre uma base já toda em negrito — visual mais uniforme e legível em impressoras térmicas velhas (que costumam borrar texto fino).

### Responsividade do cupom 80mm
Problemas identificados hoje no ticket:

1. Linhas como "PROFISSIONAL: CARLOS EDUARDO GONCALVES MONTEIRO" usam `white-space: nowrap` → em nome longo o texto sai cortado ou a coluna transborda os 76mm úteis.
2. Nome do procedimento longo (ex.: "NEUROLOGIA - CONSULTA DE RETORNO ...") gruda no valor QTD sem espaço e pode cortar.
3. `.row` (flex) do "VALOR RECEBIDO / R$ ..." não previne quebra quando o rótulo é longo ou o valor tem muitos dígitos.
4. Pagamento misto: linha "DINHEIRO: (RECEB. R$ X / TROCO R$ Y)" transborda em recibos com troco alto.
5. Endereço da clínica em duas linhas com `<br/>` sem quebra automática de palavra em cidades compostas.

Correções de CSS aplicadas ao `<style>` do `printGuiaAtendimentoCore` e ao helper compartilhado (`VIA_CSS`):

- `body { font-weight: 700; word-break: break-word; overflow-wrap: anywhere; }` — força quebra dentro de palavras longas em vez de estourar.
- Remover `white-space: nowrap` das linhas de FICHA / PROFISSIONAL / HORÁRIO / USUÁRIO; deixar o rótulo (`FICHA:` etc.) numa `<td>` de largura fixa e o valor em `<td>` fluida com `word-break`.
- Tabela de serviço: `td.qtd { width: 10mm; }` fixo; `td.servico { word-break: break-word; }` para nomes longos quebrarem em 2/3 linhas.
- `.row` do valor recebido: trocar `flex` sem wrap por `display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4px;` — o rótulo à esquerda encolhe, o valor à direita nunca é cortado.
- Detalhe de pagamento misto: cada linha vira `<tr>` com rótulo em `<td>` sem `nowrap` e valor à direita; texto de troco/recebido quebra para linha seguinte quando necessário.
- Endereço da clínica: usar `<div>` empilhados com `word-break: break-word` (sem `<br/>` no meio de "CIDADE - UF").
- Confirmar que `.ticket` continua `width: 76mm` (margem visual do papel 80mm) e adicionar `max-width: 100%` para o cupom não estourar quando o driver da impressora usa área útil menor.
- Espaçamento vertical entre blocos (`.sep`) mantido; `line-height` sobe para 1.3 (mais respiro com tudo em negrito).
- `.lg` (título "GUIA DE ATENDIMENTO", valor total) sobe 1 pt para continuar se destacando sobre o corpo já bold.

Nada é alterado no `@page { size: 80mm auto }` — impressora térmica continua imprimindo do mesmo jeito, só que o conteúdo agora se acomoda em qualquer largura útil que o driver reportar.

---

## Detalhes técnicos

- Arquivo único: `src/lib/print-gr.ts`.
- Bloco de estilo do `printGuiaAtendimentoCore` (a partir da linha 519), do `printGuiaAgrupada` (linha ~964) e do fluxo de reimpressão (linha ~1178): mesmas regras replicadas ou centralizadas numa constante `BASE_CSS` reutilizada nos três locais para não divergir.
- Nenhuma migration, nenhum ajuste de dado — puramente cosmético/CSS.
- Sem alteração de comportamento: número de vias, número da ficha, cálculos de repasse, texto de "IMPRESSÃO Nº X" e registro em `gr_impressoes` continuam iguais.
- Compatível com o `iframe` oculto atual — o HTML gerado continua o mesmo mecanismo.

---

## Fora do escopo

- Não mexer no visual dos botões de imprimir dentro da Agenda / Ficha.
- Não trocar fonte (segue `Courier New` monoespaçada, padrão de cupom fiscal).
- Não alterar tamanho do papel nem lógica de cálculo/valores.

---

## Verificação

Após aplicar, testar visualmente com um caso que combine todos os cenários problemáticos:
- Paciente com nome longo (ex.: MARIA ALICE BASTOS PEREIRA MUNIZ).
- Procedimento longo com especialidade entre parênteses.
- Pagamento misto com troco.
- Duplicata (2ª via) — precisa continuar com rótulo "2ª VIA" e quebra de página entre vias.
