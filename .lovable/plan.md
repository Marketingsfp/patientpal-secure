## Objetivo

1. Trocar o checkbox **"Regerar 12 parcelas futuras com este valor e dia"** por um **botão** que já executa a regeneração ao clicar (sem depender de "Salvar valor e vencimento").
2. Corrigir a regra de geração: a **1ª parcela** sempre deve cair no **mês da Data início** (com o dia de vencimento configurado), e a partir daí seguem as 11 seguintes, mês a mês.
   - Exemplo: início 12/01/2026, vencimento dia 15 → parcelas em 15/01, 15/02, …, 15/12/2026.

## Escopo (Regra 1.10 — clínica-alvo)

Alteração puramente técnica/UX no fluxo do cartão de benefícios. Aplicar **global (todas as 3 clínicas)**, já que a lógica de mensalidade deve ser consistente. Se você quiser restringir a uma clínica só, me avisa antes que eu limito por `clinica_id`.

## Impacto (4 eixos)

- 💰 **Financeiro**: elimina risco de perder um mês de mensalidade quando o contrato inicia no meio do mês (hoje o sistema pula para o mês seguinte na regeração).
- ⏱️ **Operacional**: 1 clique só (botão) em vez de marcar checkbox + salvar. Menos etapa, menos erro.
- 😊 **Experiência**: mensalidade cai no mês que o cliente contratou — expectativa natural do paciente.
- 🛡️ **Segurança**: sem mudança em RLS. Mantém a proteção atual de não apagar parcelas pagas (só `pendente` e futuras).

## O que muda (frontend)

Arquivo: `src/components/pages/contratos-page.tsx`

1. **UI** (aba "Dados", bloco de valor/vencimento, ~linhas 4500-4517):
   - Remover o `<label><input type="checkbox">…</label>` "Regerar 12 parcelas futuras".
   - Manter o botão **"Salvar valor e vencimento"** (só salva valor + dia, sem regerar).
   - Adicionar um novo botão **"Regerar 12 parcelas"** ao lado, com `variant="outline"`, que:
     - Pede confirmação: *"Isso apaga as parcelas pendentes futuras e recria 12 parcelas a partir do mês da data de início. Continuar?"*
     - Executa a lógica de regeração diretamente (usa valor mensal e dia de vencimento já salvos no contrato).
   - Remover estado `regerarFuturas` e `setRegerarFuturas` (não é mais usado).

2. **Lógica de geração** (função `salvarDadosFinanceiros`, ~linhas 2601-2652): extrair para uma função nova `regerarParcelasFuturas()` chamada pelo novo botão, com esta regra de datas:
   - Base = **mês da `data_inicio` do contrato** (não mais `new Date()`).
   - Para `i = 0..11`: `ref = data_inicio_mes + i meses`; `dia = min(dia_vencimento, últimoDiaDoMês(ref))`.
   - Ao contar quantas parcelas ainda faltam gerar, continuar respeitando parcelas já existentes (pagas ou pendentes antigas) — regenera só o que falta até completar 12.
   - Mantém `numero_parcela > 0` (não toca taxa de adesão com número negativo).
   - Continua apagando somente parcelas com `status = 'pendente'` e `vencimento > hoje`.

3. `salvarDadosFinanceiros` passa a fazer **apenas** o update de `valor_mensal` + `dia_vencimento` (sem bloco de regeração). Toast: "Dados salvos."

## Fora do escopo

- Não muda RPCs de criação inicial do contrato nem contratos já existentes retroativamente. A regeração continua sendo ação manual do admin/gestor no botão. Se quiser que a regra "1ª parcela no mês da data início" valha também na criação inicial (novo contrato) e em renovações, me confirma e eu abro uma segunda frente tocando as funções em `supabase/migrations/*` (`_criar_contrato`, renovação, troca de convênio).
- Não altera visual da aba Mensalidades nem a lógica de "Regerar com N parcelas pagas" do dialog retroativo.

## Validação

- Testar com o contrato da imagem (ANDRE SOUZA FAGUNDES, data início 13/06/2026, dia 10): após clicar em "Regerar 12 parcelas", esperar parcelas em 10/06/2026, 10/07/2026, …, 10/05/2027.
- Testar com contrato que tenha parcelas pagas: elas devem permanecer intactas; só as pendentes futuras são recriadas.
- Testar com dia 31 caindo em Fevereiro: deve ajustar para 28/29.

## Pendências para você confirmar

1. Escopo de clínicas: aplicar global nas 3? (default sim)
2. A regra "1ª parcela no mês da data início" deve valer **também na criação inicial do contrato e nas renovações**, ou por ora só nesse botão de regeração manual?
