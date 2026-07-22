## Escopo — 3 clínicas (SFP, Menino Jesus, terceira)

Ajuste puramente de front (visual + UX do diálogo). Sem regra de negócio nova, sem mudança de schema. Aplicado globalmente às 3 clínicas.

---

## Parte 1 — Odontograma: desenho igual à referência, só contorno

Arquivo único: `src/components/odontologia/odontograma-clinico.tsx`.

Trocar toda a construção anatômica atual (`toothShape`, `buildCrownPath`, `singleRootPath`) por **paths pré-desenhados por tipo de dente**, copiando fielmente o diagrama de referência (contornos limpos, sem cúspides "onduladas" exageradas, raízes bem afiladas e retas, colo estreito, coroa retangular alta).

- Um path fixo por combinação `tipo × arcada`:
  - Incisivo superior / Incisivo inferior
  - Canino superior / Canino inferior
  - Pré-molar superior / Pré-molar inferior
  - Molar superior (3 raízes) / Molar inferior (2 raízes)
- Cada path é desenhado em um viewBox padronizado (ex.: 40×90) e reutilizado por todos os dentes daquele tipo. Sem geradores paramétricos.
- **Somente contorno**: `fill="none"` na coroa, `stroke #94a3b8`, `stroke-width 1`, `stroke-linejoin round`. As raízes também só contorno.
- As **faces clicáveis (V/M/D/L/O)** continuam sendo polígonos preenchidos com a cor do status, recortados pelo `clipPath` da coroa. Quando o status é `higido` a face fica transparente (`fill=none`) — assim o desenho aparece "só contorno" enquanto não há marcação. O contorno da coroa é desenhado **por cima** do clip, garantindo a linha visível.
- Dente **ausente**: X vermelho sobre coroa+raiz (já existe, mantém).
- Numeração FDI: mantém abaixo do dente (superior) / acima (inferior), tipografia leve.

Referência para os paths: usar a última imagem enviada como base literal — coroas retangulares altas, borda incisal reta nos incisivos, ponta única nos caninos, 2 cúspides suaves nos pré-molares, 4 cúspides suaves nos molares, raízes retas com ponta arredondada e leve divergência nas raízes múltiplas dos molares.

---

## Parte 2 — Diálogo "Incluir dente X em orçamento": busca real + preços

Arquivo: `src/components/odontologia/add-to-orcamento-dialog.tsx`.

**Antes:** campo "Procedimento" opcional, busca solta por texto, campos "Descrição" e "Valor" à mão.

**Depois:** o diálogo passa a ser **centrado no serviço** cadastrado na especialidade **Odontologia**.

1. **Busca obrigatória de procedimento** (via `procedimento_especialidades` já filtrado por especialidade Odonto e clínica atual, como já é feito). Some os campos manuais "Descrição" e "Valor" — o valor vem do procedimento selecionado.
2. Ao selecionar o procedimento, mostra um bloco **"Formas de pagamento"** somente-leitura com:
   - **Dinheiro / PIX**: `procedimentos.valor_dinheiro_pix` (fallback `valor_padrao`).
   - **Cartão**: `procedimentos.valor_padrao` (valor cheio de tabela).
   - **Benefícios do paciente** (uma linha por cartão ativo do paciente que tenha benefício em Odontologia):
     - Reutiliza `obterInfoConvenioPaciente` já existente em `app.agenda.tsx` — extrair para `src/lib/cb-regras.ts` como helper compartilhado (`obterInfoConveniosPaciente(pacienteId, clinicaId)` retornando lista, não só o primeiro), sem duplicar lógica.
     - Para cada convênio, consulta `procedimento_cb_convenio_valores` (ou a regra da faixa) para o `procedimento_id` selecionado. Só lista se **houver benefício aplicável** ao procedimento (senão a linha do convênio não aparece).
     - Aplica `applyAcrescimoCartao` (regra já existente) quando o cartão tem acréscimo e o pagamento não é dinheiro — exibe o valor com acréscimo, respeitando exceção do "Convênio Funcionário" e gratuidade.
   - Se o paciente não tiver nenhum cartão benefício com regra em Odontologia, o bloco de benefícios simplesmente não aparece.
3. **Valor do item do orçamento**: mantém o campo (agora somente-leitura com o preço-base do procedimento — dinheiro/pix). A escolha de forma de pagamento continua sendo do fechamento do orçamento, não do item. O bloco de preços serve para o dentista já mostrar ao paciente quanto sai em cada forma, sem sair do diálogo.
4. Ao confirmar, cria o item exatamente como hoje (`orcamento_itens` com `procedimento_id`, `dentes: [dente]`, `valor_unitario` = preço-base).

Não muda schema. Não muda o comportamento de fechamento/pagamento do orçamento.

---

## Fora do escopo
- Aba Anamnese, Evolução, Galeria, Notas clínicas.
- Fechamento/pagamento do orçamento odontológico (fica igual).
- Motor de regras dos cartões (só reuso).
- Backend, RLS, migrações.

## Validação
- Abrir `/app/odontologia` nas 3 clínicas e conferir visualmente o odontograma contra a referência (nada preenchido = só contorno).
- Selecionar dente → "Incluir em orçamento" → buscar um procedimento odontológico real e conferir se os valores de Dinheiro/Cartão aparecem, e se um paciente com Cartão Consulta ativo (ex.: MJ) mostra a linha do convênio quando o procedimento tem benefício, e não mostra quando não tem.

## Detalhes técnicos
- Odontograma: substituir `toothShape`/`buildCrownPath`/`singleRootPath` por um dicionário `TOOTH_PATHS: Record<`${ToothType}-${'sup'|'inf'}`, { crown: string; roots: string; clipCrown: string }>` com paths literais.
- Faces: quando `status === 'higido'` renderizar polígono com `fill="transparent"` (mantém área clicável). Contorno da coroa desenhado após o `<g clipPath>`.
- Extrair `obterInfoConvenioPaciente` de `app.agenda.tsx` para `src/lib/cb-regras.ts` como export nomeado, mantendo assinatura; ajustar o import na agenda para não quebrar. Adicionar variante `listar: true` que retorna todos os convênios ativos do paciente.
- Consulta de preço por benefício: `procedimento_cb_convenio_valores` filtrado por `procedimento_id` + `cb_convenio_id`; se não existir linha, tenta a regra da faixa do convênio (`cb_convenio_regras` com `especialidade_id = odonto`) como fallback, igual a agenda já faz.
