## Objetivo

Cadastrar o **Cartão Terapêutico** com dois planos (R$ 290 e R$ 490) como **dois convênios separados**, cada um com seu conjunto de regras. Assim, futuras alterações (valor, limite, %) são feitas na aba do próprio convênio, sem toque em código.

## Estrutura proposta

**Convênio 1 — "Cartão Terapêutico 290"**
- Mensalidade: R$ 290,00
- Carência: após 1ª mensalidade paga
- Regras:
  1. **Consultas terapêuticas gratuitas** — 4 regras (Psicologia, Fonoaudiologia, T.O., Psicopedagogia), todas `tipo=consulta`, `gratuito=true`, `limite_qtd=2`, `limite_periodo=semana`, `limite_escopo=contrato`, `grupo_gratuidade="terapeutico-290"` (compartilham a mesma cota de 2/semana), `excedente_modo=particular` (excedente = valor particular cheio).
  2. **40% off em consultas** — 4 regras (Pediatria, Neurologia, Ortopedia, Nutrição), `tipo=consulta`, `modo=percentual_desconto`, `percentual=40`.
  3. **10% off em todos os exames** — 1 regra genérica, `tipo=exame`, sem especialidade, `modo=percentual_desconto`, `percentual=10`.

**Convênio 2 — "Cartão Terapêutico 490"**
- Mensalidade: R$ 490,00
- Carência: após 1ª mensalidade paga
- Regras:
  1. **Consultas terapêuticas gratuitas** — mesmas 4 especialidades, `limite_qtd=4`, `grupo_gratuidade="terapeutico-490"`, excedente = particular cheio.
  2. **40% off em consultas** — Pediatria, Neurologia, Ortopedia, Nutrição.
  3. *(sem desconto de exames)*

## Como serão feitas as alterações futuras

Todas via interface, sem código:

- **Menu Cartão Benefícios → Convênios → [Cartão Terapêutico 290/490]**
  - Aba **Dados**: altera valor da mensalidade, taxa de adesão, dependentes, informativo.
  - Aba **Regras de preço**: adiciona/remove/edita especialidades, % de desconto, limite semanal, carência, excedente. Após alterar, botão **"Reaplicar a todos os serviços"** propaga para os preços já cadastrados.
- Contratos vigentes continuam com as regras vigentes na data do agendamento — mudanças passam a valer para novos atendimentos.

## Análise (4 eixos)

- 💰 **Financeiro**: cota semanal compartilhada evita o paciente marcar 5 consultas terapêuticas grátis na mesma semana; excedente cai para particular cheio → protege receita.
- ⏱️ **Operacional**: recepção seleciona só o convênio; sistema aplica automaticamente 2/4 semanais + descontos, sem cálculo manual.
- 😊 **Experiência**: benefício e excedente aparecem já no orçamento/agendamento; sem retrabalho na recepção.
- 🛡️ **Auditoria**: `cb_convenio_regras` já auditada por `updated_at`; carência = 1ª mensalidade paga bloqueia uso antes do pagamento.
- **Risco**: baixo — usa apenas estrutura existente (`cb_convenios` + `cb_convenio_regras` com `grupo_gratuidade`).
- **Tempo**: ~10 min (2 seeds SQL).

## Passos de implementação

1. Criar migração/insert que popule para a `clinica_id` do usuário:
   - 2 linhas em `cb_convenios` (Cartão Terapêutico 290, Cartão Terapêutico 490).
   - 9 regras em `cb_convenio_regras` para o 290 e 5 regras para o 490, conforme mapeamento acima.
   - Usa `especialidade_id` buscando por nome (Psicologia, Fonoaudiologia, Terapia Ocupacional, Psicopedagogia, Pediatria, Neurologia, Ortopedia, Nutrição). Se alguma não existir na clínica, o script cria antes.
2. Após aprovar, você abre cada convênio → **Regras de preço** → clica em **"Reaplicar a todos os serviços"** para preencher os valores nos serviços já cadastrados.

## Pergunta antes de executar

Preciso saber **para qual clínica** cadastrar (o sistema é multi-clínica). Se você confirmar "a clínica atual do meu login", eu detecto pelo `clinicaId` da sessão e sigo. Também: os nomes das especialidades no seu cadastro batem exatamente com "Psicologia / Fonoaudiologia / Terapia Ocupacional / Psicopedagogia / Pediatria / Neurologia / Ortopedia / Nutrição"? Se houver variação (ex.: "Nutricionista"), me diga o nome exato para eu casar corretamente.
