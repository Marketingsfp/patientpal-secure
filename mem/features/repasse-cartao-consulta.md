---
name: Repasse de cartão consulta
description: Como calcular o repasse do médico em atendimentos pagos com Cartão Consulta (paciente paga taxa simbólica, médico recebe valor fixo)
type: feature
---
Atendimentos pagos com **Cartão Consulta**: o paciente paga uma taxa simbólica no caixa (ex.: R$ 9,99) e o **médico recebe o valor cheio fixo** cadastrado em "Repasse cartões benefícios" do médico (`medicos.cb_valor_repasse`, ex.: R$ 35,00).

- O repasse é **sempre fixo**, nunca limitado pelo valor pago no caixa.
- A clínica fica com `valor_pago - prestador` (pode ser negativo no caixa do dia — é compensado depois pelo convênio do cartão).
- Detecção: descrição do lançamento contém "CARTAO CONSULTA"/"CARTÃO CONSULTA"/"CONSULTA CARTAO"/"CONSULTA CARTÃO" e NÃO contém "ADESAO"/"ADESÃO" nem "+ SEGUROS".
- Implementado em `src/lib/print-gr.ts` (branch `isCartaoConsulta && medicoCb?.aceita`).

Para repasses de convênio comum (`medico_convenios` com `tipo_repasse = 'valor'`): só tratar como fixo quando o paciente pagou R$ 0 no caixa (convênio cobre direto). Em pagamento normal, limitar `prestador <= valor_pago`.