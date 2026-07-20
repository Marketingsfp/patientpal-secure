## Regra de negócio (confirmada)

Aplicável às **3 clínicas**. Para toda mensalidade de contrato de convênio (Cartão Benefício):

- Do dia do vencimento até **5 dias corridos depois**, o paciente:
  - paga a parcela **sem juros e sem multa**;
  - continua podendo usar o convênio, **mas somente para consultas com valor ≤ R$ 9,99**;
  - **não** pode usar o convênio para **exames** (tipo de serviço = Exame) nem para outros procedimentos.
- A partir do **6º dia** de atraso:
  - passam a incidir os encargos já previstos (multa 10% + juros 0,033% ao dia — hoje contam desde o 1º dia);
  - o convênio fica **totalmente bloqueado** (agendamento com Tipo = Convênio é barrado) até a regularização.
- O texto contratual já prevê esse período de tolerância de 5 dias — o sistema hoje ainda não respeita.

## O que muda

### 1. Banco — RPCs e função utilitária

- Nova função `public.contrato_dias_tolerancia()` retornando `5` (constante única, fácil de ajustar depois).
- Atualizar `paciente_cartao_inadimplente(_paciente_id, _clinica_id)`:
  - só considera "bloqueado" quando existir parcela com `dias_atraso > 5`;
  - retorna também `em_carencia` (booleano) e a lista das parcelas em carência (0–5 dias de atraso).
- Nova RPC `paciente_cartao_status(_paciente_id, _clinica_id)` combinando os três estados: `ok | em_carencia | bloqueado`, mais `dias_carencia_restantes` da parcela mais crítica.
- Ambas continuam SECURITY DEFINER, com o mesmo check de `clinica_memberships` já existente.

### 2. Backend do fluxo de agenda (`src/routes/_authenticated/app.agenda.tsx`)

- Ampliar `ConvenioInfo`: adicionar `emCarencia: boolean` e `diasCarenciaRestantes: number | null` (mantém `emDia`, `parcelasAtrasadas` por compatibilidade).
- Ao montar `ConvenioInfo`, usar a nova RPC:
  - `bloqueado` → `emDia=false`, tratado igual à inadimplência de hoje (cobra particular / bloqueia benefício).
  - `em_carencia` → aplica uma **trava de elegibilidade**:
    - carrega o procedimento (`procedimentos.tipo`, `tipo_procedimento`, `valor_padrao`);
    - permite o desconto/regra do convênio **apenas** se: (a) tipo/nome indicar **consulta** *e* (b) valor final que o paciente pagaria pelo convênio ≤ **R$ 9,99**;
    - se o procedimento for **Exame** (`procedimentos.tipo` ILIKE '%exame%' ou `tipo_procedimento`/`tipo_servico` = Exame), o desconto é anulado e é emitido `avisoLimite` claro: "Mensalidade em atraso há X dia(s) — dentro da tolerância de 5 dias apenas consultas até R$ 9,99 são cobertas pelo convênio";
    - para os demais procedimentos que não caibam na exceção: cobra valor particular com o mesmo aviso.
  - `ok` → comportamento atual.

### 3. Bloqueio no `criar-agendamento.functions.ts`

- O bloqueio duro de inadimplência passa a valer só quando `bloqueado === true` (parcelas com >5 dias). Em carência a criação não é barrada, mas o desconto do convênio segue as regras acima.

### 4. Pagamento de mensalidade em `contratos-page.tsx`

- Ajustar `calcValorComJuros` para começar a cobrar multa+juros somente a partir do **6º dia** de atraso (`diasAtraso > 5`).
- No dialog de pagamento, mostrar badge "Dentro da tolerância — sem encargos" quando estiver de 1 a 5 dias vencida.

### 5. Testes / validação

- Consultas SQL de verificação nas 3 clínicas para conferir contratos com parcelas em janela de tolerância.
- Testes manuais: (a) parcela vencida há 2 dias → agendar CONSULTA R$ 9,99 (permitido); agendar EXAME (bloqueado); pagar mensalidade (sem juros). (b) parcela vencida há 7 dias → agendamento bloqueado; pagamento com multa+juros.

## Fora do escopo

- Não altero regras de preço em `cb_convenio_regras`.
- Não mudo o valor da multa (10%) nem do juros (0,033%/dia) — só o marco inicial (D+6).
- Sem migração de dados histórica: parcelas já pagas com juros no passado permanecem como estão.

## Riscos

- Toco em `paciente_cartao_inadimplente`, que é chamada tanto pela Agenda quanto por criação de agendamento — a nova versão preserva o contrato (`bloqueado`, `total_aberto`, `mensalidades`) e apenas adiciona campos.
- Como a regra vale para as 3 clínicas, não uso feature flag; a constante fica em uma função SQL para futuro ajuste.
