## Diagnóstico

Confirmei via banco: os lançamentos de repasse da CLAUDIA MARIA (Menino Jesus, 13/07 e 15/07) estão em `fin_lancamentos` com `valor = 130,00 / 110,00 / 60,00 / 52,00 …` (valor cheio do serviço) e `valor_medico_override = NULL`.

- **Aba Atendimentos** (`src/routes/_authenticated/app.financeiro.atendimentos.tsx`) — chama `calcRepasseFull(medico, valor, procedimento, descricao)` que aplica as regras de convênio/cartão-benefícios do médico e devolve o repasse correto (ex.: R$ 55,00 em consulta de R$ 110). Por isso a coluna **MÉDICO** aparece com o valor certo.
- **Segunda via do comprovante** (`src/components/financeiro/comprovantes-tab.tsx`, linhas 167–170) — usa apenas `valor_medico_override ?? valor`. Como os lançamentos históricos não têm override preenchido, imprime o `valor` cheio (R$ 130 / R$ 110 …) e o total soma R$ 702,00 em vez de R$ 295,80.

**Confirmado:** o bug está apenas na exibição/impressão do comprovante (frontend). Os dados no banco estão corretos e a aba Atendimentos continua certa — nenhuma regra de negócio muda.

## Escopo

- Correção puramente técnica (categoria: erro de código).
- Afeta **todas as clínicas** que usam a aba "Comprovantes" (a lógica é única). Isso é intencional: hoje qualquer clínica com lançamentos sem `valor_medico_override` está imprimindo valor errado.
- Não altera banco, RPCs, permissões, agenda, GR nem impressão original (a primeira via, feita ao pagar o repasse, continua idêntica — ela já usa o valor calculado em memória).

## Plano

1. **Extrair `calcRepasseFull` para módulo compartilhado**
   - Criar `src/lib/repasse-calc.ts` exportando `calcRepasseFull({ medicos, convenios, procTipos, medicoId, totalPago, procNome, descricao })` com a **mesma lógica** da função hoje embutida em `app.financeiro.atendimentos.tsx` (linhas 950–1050): cartão consulta, convênio por nome/variantes, categoria (`__CAT__:TIPO`), fallback pelo padrão do médico.
   - Alterar `app.financeiro.atendimentos.tsx` para importar dessa util (a função vira wrapper fino que injeta o state local). Sem mudança de comportamento.

2. **Usar o cálculo no comprovante**
   - Em `src/components/financeiro/comprovantes-tab.tsx`:
     - Carregar (uma vez, ao montar / mudar clínica) as listas mínimas: `medicos` (campos de repasse), `medico_convenios` e o mapa de tipos de procedimento (mesmas queries usadas na aba Atendimentos).
     - Ao mapear cada `Row` vinda de `fin_lancamentos`, se `valor_medico_override` **não** estiver preenchido, calcular `valor_medico = calcRepasseFull(...)` em vez de cair no `valor` cheio.
     - Para `fin_atendimentos` a lógica continua a mesma (`valor_medico + valor_laudo`), pois lá o campo já é o repasse correto.
   - Isso corrige a **tabela do preview** (linhas Data/Paciente/Serviço/Valor), o **rodapé Total** e o **campo "Total pago ao médico"** no cabeçalho do resumo, todos exibindo agora o repasse (R$ 295,80), igual à aba Atendimentos.

3. **Validação**
   - Reabrir a segunda via do comprovante da CLAUDIA MARIA (13/07 e 15/07): confirmar que cada linha exibe o valor de repasse (R$ 55 / R$ 10,40 …) e que o total bate com o "PAGO R$ 295,80" da aba Atendimentos.
   - Conferir um comprovante de outra clínica (SFP) para garantir que continua correto (lá muitos lançamentos já têm override; o resultado deve ser idêntico ao atual).
   - Conferir um comprovante que use `fin_atendimentos` puro (sem agenda): deve continuar exatamente como está hoje.

## Fora do escopo

- Não vou alterar o banco nem preencher `valor_medico_override` retroativamente.
- Não vou mexer na primeira via de impressão (fluxo "Pagar repasse"), que já usa o valor calculado corretamente.
- Não vou mexer na GR nem em outras telas.

## Riscos

- Baixo. A função `calcRepasseFull` é a mesma já usada em produção pela aba Atendimentos; só está sendo reaproveitada. Se por algum motivo `medicos`/`medico_convenios` demorarem a carregar, o preview do comprovante mostra "—" ou o valor antigo até o fetch terminar; posso adicionar um loading suave se preferir.

## Antes / Depois esperado

- **Antes:** segunda via imprime valores cheios do serviço (R$ 130, R$ 110 …) e total R$ 702,00.
- **Depois:** segunda via imprime valores de repasse do médico (R$ 55, R$ 10,40 …) e total R$ 295,80, iguais aos exibidos na aba Atendimentos e ao efetivamente pago.