## Problemas

Duas coisas quebradas ao criar/pagar mais de um atendimento juntos (multi-exame de imagem — ex.: CAPSULOTOMIA + CERATOMETRIA no mesmo horário):

**1) Numeração da ficha** (Foto 2)
Quando você agenda 2 exames de imagem no mesmo horário, o sistema salva a "linha original" (o slot que já existia com número da agenda, ex.: 020) como principal e cria uma linha nova (irmã) para o segundo exame — **sem `agenda_id`**. O cálculo da ficha usa a agenda como parte da chave, então a irmã cai num bucket separado (`__sem_agenda__`) e começa em 001. Resultado: uma linha com ficha 020, outra com ficha 001.

**2) Nome do paciente na 2ª linha do Movimento de Caixa** (Foto 1)
Ao gerar a cobrança agrupada logo depois de criar um multi-exame, o fluxo passa por `formaPagCtx` sem popular os estados `pagamentoPacienteNome`, `pagamentoRotulos` e `pagamentoPesos`. Aí, na hora de gravar o rateio (`onSavedWithData` → RPC `finalizar_pagamento_agrupado`), a descrição de cada `caixa_movimentos` fica com o nome do paciente **vazio**: literalmente `" — CONSULTA (1/2 do grupo)"` e `" — CONSULTA (2/2 do grupo)"`. Confirmei no banco. A 1ª linha ainda "aparece com nome" na coluna Paciente porque o enriquecimento acha o paciente via `agendamento_id`; a 2ª tem o mesmo dado disponível, então na verdade o problema real é **a descrição sem nome** — corrigir isso conserta as duas linhas de uma vez (e também os relatórios/comprovantes que usam `descricao`).

## Correções (mínimas e focadas)

### 1. Irmãs herdam o `agenda_id` do principal — nova migration
Nova migration ajustando `salvar_agendamento_multi_imagem` para, ao inserir cada linha-irmã, gravar `agenda_id` = `agenda_id` da linha principal (lida logo após o UPDATE/INSERT do principal). Nada mais muda na RPC.

Backfill único no mesmo arquivo: nas linhas irmãs existentes (`atendimento_grupo_id IS NOT NULL AND agenda_id IS NULL`), copiar o `agenda_id` do irmão do mesmo grupo que tenha valor — evita que fichas antigas continuem intercaladas 001/020.

Efeito: todas as linhas do multi-exame passam a compartilhar a mesma agenda → numeração de ficha volta a ser sequencial dentro da agenda daquele médico.

### 2. Descrição da cobrança agrupada sempre com o nome do paciente
Ajuste pontual em `src/routes/_authenticated/app.agenda.tsx`, dentro de `onSavedWithData` (a partir da linha ~5317, onde monta `itensRateio`):

- Antes de usar `pagamentoPacienteNome`, calcular um fallback:
  `const pacNome = pagamentoPacienteNome || items.find(x => x.id === agId)?.paciente_nome || "";`
- Antes de usar `pagamentoRotulos[id] ?? "CONSULTA"`, calcular um fallback por id:
  `const rot = (id) => pagamentoRotulos[id] || items.find(x => x.id === id)?.procedimento || rotuloFallbackProc(items.find(x => x.id === id)?.medico_id) || "CONSULTA";`
- Usar `pacNome` e `rot(id)` na montagem das duas descrições (principal `1/N` e extras `i/N`).

Isso não muda regra de negócio, forma de pagamento, valores, rateio, RLS ou impressão — só garante que a descrição gravada em `fin_lancamentos.descricao` e `caixa_movimentos.descricao` tenha sempre `PACIENTE — PROCEDIMENTO (i/N do grupo)`, independentemente de qual fluxo abriu a cobrança (multi-exame criado agora, seleção múltipla, cobrança de linha única, etc.).

Efeito no Movimento de Caixa: as duas linhas passam a mostrar o nome do paciente (coluna Paciente pelo enriquecimento e coluna Descrição pelo próprio texto salvo).

## Fora do escopo
- Não vou renumerar fichas antigas nem tocar em `ficha_numero` de nenhuma linha existente — a numeração é calculada em runtime pela agenda.
- Não vou mexer em `finalizar_pagamento_agrupado` (só na descrição que o front envia).
- Não vou tocar em enfermagem/triagem/pagamento/estorno/repasse.

## Validação
1. Criar um multi-exame para um paciente (2 procedimentos no mesmo horário) na agenda do Dr. João Hélio.
2. Conferir na lista da agenda: as duas linhas mostram fichas sequenciais dentro da agenda (ex.: 020 e 021), sem 001 fora de ordem.
3. Cobrar as duas juntas (Misto ou qualquer forma).
4. Abrir Caixa → Movimentos: as duas linhas devem mostrar o nome do paciente tanto na coluna Paciente quanto na coluna Descrição (`QUEDIMA … — CAPSULOTOMIA (1/2 do grupo)` e `QUEDIMA … — CERATOMETRIA (2/2 do grupo)`).
5. Rodar o mesmo teste com Atendimento Múltiplo (paciente com serviços diferentes) para confirmar que continua funcionando.

## Riscos
- Migration de backfill toca só linhas com `atendimento_grupo_id` e `agenda_id IS NULL` — impacto restrito ao histórico do multi-exame. Reversível manualmente se necessário.
- Alteração de front é local e presentacional (só monta a string) — sem risco de duplicidade de lançamento nem de cobrança dobrada.
