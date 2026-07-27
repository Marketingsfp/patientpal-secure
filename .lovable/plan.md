## Problema

No Caixa, a coluna **Paciente** fica com "—" nos recebimentos de mensalidade feitos pelo pagamento avulso. A tela do caixa mostra o nome a partir do campo `paciente_id` do lançamento financeiro, e hoje esse campo só é preenchido quando o pagamento vem de um agendamento. No pagamento avulso não há agendamento, então o lançamento nasce sem paciente.

Tipo do pedido: erro de código / preenchimento de dado (não é regra de negócio nova).

## O que será feito (nas 3 clínicas)

1. **Tela de recebimento (`lancamento-dialog.tsx`)**
   - Novo parâmetro opcional para receber o paciente titular.
   - Ao salvar, se não houver agendamento, grava esse paciente no lançamento (`paciente_id`).

2. **Pagamento avulso (`pagamento-avulso-dialog.tsx`)**
   - Passa o titular selecionado para a tela de recebimento.

3. **Faturamento rápido de mensalidade (`faturamento-rapido-dialog.tsx`) e mensalidades em Contratos (`contratos-page.tsx`)**
   - Mesmo ajuste: passam o titular do contrato, para que todo recebimento de mensalidade apareça com nome.

4. **Correção dos registros antigos**
   - Vincular o paciente titular aos lançamentos de mensalidade já existentes que estão sem paciente, usando o contrato/mensalidade de origem quando houver e, na falta disso, o nome do titular presente na descrição do lançamento.
   - Será feito por atualização de dados, sem apagar nada.

## Fora do escopo

- Nenhuma alteração em valores, regras de convênio, carência ou repasse.
- Nenhuma mudança no visual do caixa além do nome passar a aparecer.

## Validação

- Conferir no banco que os lançamentos avulsos de hoje ficaram com titular vinculado.
- Teste prático seu: um novo pagamento avulso deve aparecer no Caixa já com o nome do titular na coluna Paciente.
