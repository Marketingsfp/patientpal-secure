## Objetivo

No diálogo "Atendimento externo" da agenda, deixar de exibir o valor do serviço e passar a exibir o **valor do repasse que o médico vai receber**, com uma marcação de convênio que muda a regra de cálculo.

## Como vai ficar a tela

1. Paciente / procedimento (como hoje)
2. Clínica de origem (como hoje)
3. Novo campo: caixa de marcação **"Paciente tem convênio"**
   - Vem marcada automaticamente quando o sistema encontra um contrato ativo do paciente (titular ou dependente) nesta clínica; o operador pode desmarcar.
   - Marcada → aparece a lista de convênios da clínica para escolher qual é (pré-selecionado o do contrato encontrado).
4. **Repasse do médico** (somente leitura, destacado): valor calculado, não editável
   - Sem convênio: repasse padrão do médico sobre o preço do serviço na tabela desta clínica (regras já existentes: por serviço, por categoria, ou padrão do médico).
   - Com convênio: usa as regras de repasse de convênio do médico, conforme a modalidade do convênio escolhido (Cartão Consulta ou Cartão Desconto) — repasse fixo por serviço, senão repasse de cartão do médico, senão padrão.
   - Se não houver regra aplicável, mostra R$ 0,00 com aviso "sem regra de repasse cadastrada".
5. Aviso amarelo mantido: valor serve só para o repasse, não entra no caixa nem gera nota.

## Regras de negócio

- O valor do serviço continua sendo lido internamente da tabela desta clínica (base de cálculo), mas não é mais mostrado.
- O repasse gravado no financeiro passa a ser o repasse calculado, não o valor cheio do serviço.
- Trocar o convênio na lista recalcula o repasse na hora.

## Detalhes técnicos

- `src/components/agenda/atendimento-externo-dialog.tsx`: substituir o bloco "Valor do atendimento" por checkbox + select de convênio + linha de repasse; carregar `cb_convenios` da clínica e usar `buscarVinculoConvenio` (`src/lib/convenio/modalidade.ts`) para pré-marcar.
- Cálculo com `calcRepasseFull` (`src/lib/repasse-calc.ts`), montando o contexto com o médico do agendamento, `medico_convenios` (via `getMedicoConveniosAgenda`) e tipos de procedimento; `modalidade` vinda do convênio escolhido ou `null` quando desmarcado.
- Mesma alteração no wizard V2 (`src/components/agenda-v2/novo-agendamento-wizard.tsx`), reaproveitando um helper novo em `src/lib/agenda/atendimento-externo-preco.ts` (ou arquivo irmão) para não duplicar a lógica.
- `src/lib/agenda/atendimento-externo.functions.ts`: aceitar `repasse_medico`, `convenio_id`/`modalidade`; gravar `valor_medico = repasse`, mantendo `valor_clinica = 0` e `valor_total` com o preço da tabela; recalcular no servidor quando o cliente não enviar repasse.
