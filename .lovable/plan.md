## Diagnóstico

Os horários **não foram perdidos** — estão no banco (109 disponibilidades na clínica atual, ex.: Dr. ALEX LOUZA com 4 horários, Dr. CARLOS ALBERTO com 3, etc.).

O que está acontecendo: a tela de Horários médicos faz um `SELECT` pedindo a coluna `limite_pacientes`, **mas essa coluna não existe na tabela** `medico_disponibilidades`. O Supabase devolve erro, o código ignora o erro e mostra `0 horário(s)` para todos os médicos.

A coluna `limite_pacientes` foi referenciada no código (no formulário "Pacientes/dia" e na geração de agenda) mas a migração que cria a coluna nunca foi aplicada.

## Correção

1. **Criar migração** adicionando `limite_pacientes integer` (nullable, sem default) à tabela `public.medico_disponibilidades`.
2. Depois disso, a página `/app/disponibilidades` volta a listar todos os horários já cadastrados, e o campo "Pacientes/dia" passa a salvar normalmente.

Nenhuma outra mudança de código é necessária — o problema é só a coluna faltando no banco.