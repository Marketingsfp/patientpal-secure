## Objetivo

Criar um **Comprovante de Agendamento** — impresso simples para entregar ao paciente quando ele apenas agenda (sem passar pelo caixa). Diferente da GR: sem número de ficha, sem valores, sem repasse, sem exigência de pagamento.

## O que muda

### Novo arquivo: `src/lib/print-comprovante-agendamento.ts`

Função `printComprovanteAgendamento({ agendamentoId, clinicaId })` que:

1. Busca do banco: dados da clínica (nome, endereço, telefone, logo), do agendamento (data, hora, médico, especialidade, procedimento, unidade/sala) e do paciente (nome, telefone).
2. Monta um HTML A5/térmico simples com:
   - Cabeçalho: logo + nome da clínica + endereço/telefone
   - Título: **COMPROVANTE DE AGENDAMENTO**
   - Bloco do paciente: nome + telefone
   - Bloco do agendamento: data/hora em destaque, médico, especialidade, procedimento, unidade
   - Orientações (texto fixo): "Chegar 15 min antes", "Trazer documento com foto e cartão do convênio, se aplicável", "Em caso de imprevisto, avisar com antecedência"
   - Rodapé: data/hora da emissão e nome do atendente
3. Usa o mesmo padrão do `print-caixa-comprovante.ts` (iframe oculto + `window.print()` para evitar bloqueio de pop-up).
4. **Não** grava nada em `gr_impressoes` (é comprovante, não guia oficial).

### `src/routes/_authenticated/app.agenda.tsx`

- Importar `printComprovanteAgendamento`.
- Adicionar `imprimirComprovante(a)` análogo ao `imprimirGR`, mas **sem** exigência de pagamento.
- Adicionar item no menu de ações de cada agendamento, logo acima de "Imprimir GR":
  - `<DropdownMenuItem onClick={() => imprimirComprovante(a)}>` → **"Imprimir comprovante de agendamento"** (ícone `Printer`).
- Sempre habilitado (não depende de `pagosSet`).

## Fora do escopo

- Não altera a GR nem o fluxo de pagamento.
- Não altera schema, RLS, nem tabelas.
- Sem novo cadastro de layout — o texto de orientações fica fixo no template (pode ser evoluído depois se você quiser tornar editável por clínica).

## Verificação

- Após implementar, abro `/app/agenda` no Playwright, abro o menu de um agendamento não pago e confirmo que o item aparece e imprime (screenshot da janela de impressão via iframe).