## Problema

Na GR do "FRANCISCO NOE" (Foto 1) o exame foi lançado como **gratuidade** (paciente não pagou nada). Hoje, quando `valor pago = 0`, o `src/lib/print-gr.ts` **oculta o bloco inteiro** de "VALOR RECEBIDO" + "CLINICA" + "PRESTADOR" (linhas 832 e 1275 do arquivo, controladas pelo `${valor > 0 ? ... : ""}`).

Consequência: a GR sai sem valor de clínica nem de prestador — mas a clínica e o médico têm direito a receber normalmente na gratuidade. Só o paciente é isento.

## Escopo

- Aplica-se a **todas as clínicas** (regra 1.10: correção puramente técnica, sem regra de negócio nova). Só ajusta a impressão da GR — não altera cálculo de repasse, caixa, financeiro nem lançamentos.
- Afeta apenas `src/lib/print-gr.ts`, nas duas funções que imprimem GR de atendimento:
  - `printGuiaAtendimentoCore` (GR individual — linhas ~520–856)
  - `printGuiaAtendimentoAgrupada` (GR agrupada por médico — linhas ~1080–1300)
- **Não** mexe na GR de mensalidade (`printGRMensalidade`), pois mensalidade sem valor não existe nesse fluxo.

## Solução

1. Detectar gratuidade: `valorPago === 0` (nenhum `fin_lancamentos` confirmado para o agendamento).
2. Quando for gratuidade, usar como **valor base** o `procedimentos.valor_dinheiro_pix` (já lido em `procData`) para calcular **clínica** e **prestador** com as mesmas regras atuais (convênio do médico → convênio do paciente → padrão do médico). Nada de novo no motor de cálculo — só troca a entrada.
3. Renderizar o bloco inferior da GR mesmo com `valor pago = 0`, com este layout:
   - Substituir "VALOR RECEBIDO (FORMA)" por um selo **"GRATUIDADE"** em destaque (bold, mesma tipografia grande).
   - Manter as linhas **CLINICA: R$ x,xx** e **PRESTADOR: R$ y,yy** com os valores calculados a partir do valor de tabela.
   - Não mostrar bandeira/parcelamento (não há pagamento).
4. Espelhar o mesmo comportamento na variante agrupada: se `g.subtotal === 0`, imprimir "GRATUIDADE" e manter `CLINICA` / `PRESTADOR` calculados pela soma dos valores de tabela dos itens do grupo.
5. Preservar comportamento atual quando houver pagamento (nada muda).

## Detalhes técnicos

- Em `printGuiaAtendimentoCore` (após linha ~580):
  - Guardar `valorPago` como está.
  - Introduzir `const isGratuidade = valorPago === 0 && !pagamento;`
  - Definir `const valorBase = isGratuidade ? Number(procData?.valor_dinheiro_pix ?? 0) : valor;` e usar `valorBase` no bloco de cálculo de `prestador`/`clinica` (linhas ~700–758) **apenas** quando `isGratuidade` — caso contrário mantém `valor` como hoje.
  - No template (linha 832), trocar `${valor > 0 ? ... : ""}` por lógica que:
    - se `pago`, imprime o bloco atual;
    - se `gratuidade` e (`clinica > 0 || prestador > 0`), imprime `<div class="bold lg center">GRATUIDADE</div>` + tabela CLINICA/PRESTADOR.
- Em `printGuiaAtendimentoAgrupada`, replicar: para cada item, se `valorPago == null`, usa `proc.valor_dinheiro_pix` como `valorBase` para calcular prestador/clínica; e no render (linha 1275) trocar `g.subtotal > 0` pela mesma lógica de gratuidade quando `g.subtotal === 0 && (g.clinica > 0 || g.prestador > 0)`.
- Nenhuma nova consulta ao banco — os campos já são lidos.
- Não altera `numViasGR`, registros em `gr_impressoes` nem regras de repasse.

## Validação

1. Reimprimir a GR do Francisco Noe (ECG 23/07 11:15 — Menino Jesus) e conferir se sai "GRATUIDADE" + CLINICA e PRESTADOR corretos.
2. Reimprimir uma GR paga comum (qualquer clínica) para garantir que o layout com "VALOR RECEBIDO" continua idêntico.
3. Reimprimir uma GR agrupada (paciente com múltiplos exames no mesmo médico) tanto paga quanto gratuita.

## Fora de escopo

- Não altera regras de cálculo de repasse, caixa, NFS-e, contratos ou financeiro.
- Não introduz botão/menu novo — a mudança é apenas no HTML impresso.
- Não altera GR de mensalidade.