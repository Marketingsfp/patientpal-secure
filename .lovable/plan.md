## Objetivo

Na aba **Repasse** do cadastro/edição de médico, além das linhas de **categoria** (Consulta / Exame / Procedimento) que já aparecem automaticamente, mostrar **uma linha por serviço** de cada serviço marcado na aba **Especialidades**. O botão **Manual** continua funcionando para adicionar linhas avulsas.

## Como vai funcionar

Ordem de exibição na tabela de "REPASSE INDIVIDUAL":

1. Categorias (Consultas, Exames, Procedimentos) — rótulos automáticos, valem para todos os serviços daquela categoria.
2. Uma linha por **serviço** selecionado em Especialidades (rótulo: `NOME DO SERVIÇO (ESPECIALIDADE)`), com percentual/valor em branco por padrão. Se preenchido, sobrescreve a categoria para aquele serviço específico.
3. Linhas manuais (adicionadas com o botão **Manual**) — continuam livres, como hoje.

Regras:
- Se o médico marcar um novo serviço em Especialidades, a linha aparece automaticamente em Repasse.
- Se o médico desmarcar um serviço, a linha correspondente é removida — **exceto** se já estiver preenchida com % ou valor (aí é preservada para não perder a configuração acidentalmente, igual ao comportamento atual das linhas manuais).
- Salvar continua gravando em `medico_convenios` (chave = nome do serviço), sem migração de banco.
- A precedência de repasse (serviço específico > categoria > padrão) já é a mesma lógica hoje aplicada às linhas Manual, então nada muda no cálculo/leitura em outras telas.

## Onde mexer

`src/components/medicos/MedicoFormDialog.tsx`:

- No `useEffect` que sincroniza `convenios` com `form.procedimentos` (linhas ~210–259), além de manter/inserir as sentinelas `__CAT__:<TIPO>`, também garantir uma linha para **cada serviço distinto** selecionado (chave = nome do procedimento).
  - Inserir novas linhas em branco (`percentual:""`, `valor:""`, `tipo_repasse: form.tipo_repasse`) para serviços recém-marcados.
  - Remover linhas de serviço cujo procedimento saiu de Especialidades **apenas se** `percentual` e `valor` estiverem vazios; se preenchidas, preservar (vira "manual" implícito).
- Na renderização da tabela (linhas ~1280–1325), tratar como "linha automática" (sem select, sem botão de remover) as linhas cujo `nome` corresponde a um serviço atualmente selecionado — mostrar o rótulo `NOME (ESPECIALIDADE)` no lugar do `<select>`.
- O botão **Manual** e as linhas manuais continuam iguais (permitem escolher um serviço no dropdown, inclusive um que já esteja auto-listado, caso o usuário queira duplicar — comportamento atual preservado).

## Escopo

- Somente frontend, arquivo `MedicoFormDialog.tsx`.
- Sem migração de banco, sem alteração de outras telas (Financeiro, Atendimentos, cálculo de repasse continuam iguais).
- Vale para todos os médicos automaticamente na próxima vez que o cadastro for aberto — não requer script para "corrigir" médicos existentes.
