## Objetivo

Permitir incluir/excluir dependentes em um contrato de convênio depois da venda, registrar as datas dessas movimentações na aba **Dados** e — quando o contrato já estiver assinado — gerar automaticamente o **Termo de Inclusão/Exclusão** (já cadastrado no Convênio) para impressão/assinatura.

## O que já existe

- `contrato_dependentes` já tem `incluido_em`, `excluido_em`, `ativo` → não precisa de migração estrutural.
- `cb_convenios.termo_inclusao_html` já é editado na tela do Convênio (aba "Termo de Inclusão").
- A aba **Dados** do contrato já lista os dependentes (mas só os ativos, sem datas).

## Mudanças

### 1. Aba "Dados" — exibir datas e ações (`src/routes/_authenticated/app.contratos.tsx`)

- Carregar TODOS os dependentes do contrato (sem filtrar `ativo = true`), trazendo `incluido_em`, `excluido_em`, `ativo`. Também trazer `termo_inclusao_html` do convênio.
- Renderizar a lista no formato:
  - `• NOME — parentesco (tipo) — Incluído: dd/mm/aaaa`
  - Se `excluido_em` → acrescentar `• Excluído: dd/mm/aaaa` em vermelho; nome com tachado/cor `muted`.
  - Botão "Excluir" ao lado de cada dependente ativo.
- Botão **"Incluir dependente"** acima da lista (respeitando `max_dependentes` do convênio sobre o total de ATIVOS).
- Contagem mostra `(ativos/{max})`.

### 2. Diálogo "Incluir dependente"

- Campos: paciente (usar `PatientSearchInput` existente), parentesco (select reaproveitado), tipo (`dependente`/`agregado`).
- Ao confirmar:
  1. `insert` em `contrato_dependentes` (`incluido_em = hoje`, `ativo = true`).
  2. Se `contrato.assinado_em != null` **e** `convenio.termo_inclusao_html` existe → abrir o diálogo do Termo (passo 4).
- Recarrega lista.

### 3. Diálogo "Confirmar exclusão"

- Pergunta "Excluir {nome} do contrato?".
- Ao confirmar:
  1. `update contrato_dependentes set ativo = false, excluido_em = hoje` para aquele registro.
  2. Se `contrato.assinado_em != null` **e** `termo_inclusao_html` existe → abrir o diálogo do Termo (passo 4) em modo "Exclusão".

### 4. Diálogo "Termo de Inclusão/Exclusão"

- Mostra o `termo_inclusao_html` do convênio com substituição das mesmas variáveis já usadas no contrato (`CLINICA_*`, `PACIENTE_*`, `DATA_HOJE`, `VALOR_MENSAL`, etc.) + variáveis novas específicas do termo:
  - `DEPENDENTE_NOME`, `DEPENDENTE_PARENTESCO`, `DEPENDENTE_CPF`
  - `TIPO_MOVIMENTO` (`Inclusão` / `Exclusão`)
  - `DATA_MOVIMENTO`
- Botões: **Imprimir A4** (abre janela com o termo renderizado, igual padrão do `print-contrato.ts`), **Copiar link para o paciente assinar** (reaproveita `token_publico` do contrato) e **Fechar**.
- Helper de substituição extraído para função pequena no próprio arquivo (sem nova lib).

### 5. Não muda

- Não altera schema do banco.
- Não muda o fluxo da venda inicial nem o template principal do contrato.
- A Nina e demais áreas seguem iguais.

## Detalhes técnicos

- Carga no `load()` passa a buscar `select("id, paciente_nome, parentesco, tipo, incluido_em, excluido_em, ativo, pacientes:paciente_id(cpf)")` sem `.eq("ativo", true)`.
- O tipo `Dep` ganha `incluido_em: string | null; excluido_em: string | null; ativo: boolean`.
- Lista ordenada: ativos primeiro (por `incluido_em` asc), depois excluídos (por `excluido_em` desc).
- A contagem que limita inclusão usa `deps.filter(d => d.ativo).length`.
- Para a janela de impressão do termo, reaproveitar o mesmo CSS/skeleton de `print-contrato.ts` (sem mover para arquivo novo; uma função local `printTermoInclusao(html)` dentro do componente basta).
- Validação: ao incluir, bloquear se já houver dependente ativo com mesmo `paciente_id`.

## Pergunta antes de implementar

Quando você **exclui** um dependente depois do contrato assinado, você quer que apareça o mesmo "Termo de Inclusão" (renomeado dinamicamente para "Termo de Exclusão" usando a variável `{{TIPO_MOVIMENTO}}`), ou prefere que a exclusão **não gere termo nenhum** e o termo só apareça em inclusões? Vou seguir com a opção 1 (mesmo termo, com variável `TIPO_MOVIMENTO`) se você aprovar o plano sem comentar isso.
