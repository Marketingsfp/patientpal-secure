## Objetivo

Permitir que uma linha **Manual** no "Repasse Individual" represente **um serviço específico** e sobrescreva o valor da categoria correspondente para aquele serviço.

A lógica de leitura do repasse no app já prioriza correspondência por **nome do serviço** e só cai para a sentinela de categoria (`__CAT__:<TIPO>`) quando não acha — então a sobrescrita funciona automaticamente assim que existir uma linha manual com o nome do procedimento. Falta ajustar a tela de cadastro para que essa linha manual seja criada corretamente e não seja apagada pela sincronização automática.

## Mudanças (somente em `src/components/medicos/MedicoFormDialog.tsx`)

1. **Linha manual = picker de serviço (com opção "Avulso")**
   - Hoje o botão "Manual" cria uma linha com campo de texto livre.
   - Trocar o `Input` de nome (quando a linha não é categoria) por um `Select` com:
     - todos os serviços já selecionados na aba Especialidades do médico, rotulados `NOME (ESPECIALIDADE)`, com `value` = nome do procedimento (igual ao que o lookup do financeiro/print usa);
     - uma opção "Avulso (digitar)…" que volta a mostrar o `Input` de texto livre, preservando o uso atual (ex.: "Cartão Consulta").
   - Texto de ajuda da seção: acrescentar "Use Manual para sobrescrever o repasse de **um serviço específico** (prevalece sobre a categoria) ou para itens avulsos."

2. **Sincronização automática não pode apagar overrides**
   - No `useEffect` que monta as linhas de categoria (linhas 207–253), o filtro `mantidos` hoje remove qualquer linha cujo nome bate com um procedimento cadastrado.
   - Ajustar: **preservar** linhas manuais cujo nome corresponde a um procedimento que ainda está selecionado para o médico (são overrides intencionais). Continuar removendo apenas linhas órfãs, isto é, cujo procedimento não está mais selecionado.

3. **Nada muda em**:
   - Schema / migrations (segue usando `medico_convenios.nome`).
   - Lookup em `src/routes/_authenticated/app.financeiro.atendimentos.tsx` e `src/lib/print-gr.ts` (já fazem match por nome antes de cair na sentinela de categoria).
   - Repasse padrão, Cartões Benefícios, demais abas.

## Resultado para o usuário

- Categoria "Procedimentos" com R$ 100, e uma linha Manual com serviço "POSTECTOMIA / FIMOSE" R$ 250 → todos os procedimentos pagam R$ 100, exceto POSTECTOMIA, que paga R$ 250.
- Linha Manual avulsa (ex.: "Cartão Consulta") continua funcionando como hoje.
