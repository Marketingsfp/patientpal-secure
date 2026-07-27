# Repasse de laudo para o exame ITB

Vamos habilitar exatamente o mesmo fluxo que hoje existe para o Eletrocardiograma (ECG), agora também para o exame **ITB**, em todas as clínicas (SFP, Menino Jesus e Consulta Hoje). Os médicos laudadores continuam sendo todos os cardiologistas ativos da clínica — igual ao ECG.

## O que existe hoje (verificado)

- Cada clínica tem um "médico agenda" chamado **ELETROCARDIOGRAMA**. Ao editá-lo, aparece a seção **"REPASSE LAUDO TERCEIRO"**, onde se lista os cardiologistas ativos e o % ou valor fixo que cada um recebe por laudo. Essa seção **só aparece hoje quando o nome do cadastro é exatamente "ELETROCARDIOGRAMA"** (regra fixa no código).
- No procedimento **ELETROCARDIOGRAMA (ECG)** o campo `requer_laudo` está marcado como *true*, o que faz aparecer no menu **Financeiro → Atendimentos** o botão **"Vincular laudo"** (individual e em lote).
- O motor de repasse (`medico_repasse_laudo`) e a aba **Comprovantes / Repasse** já são genéricos e não dependem do nome — funcionam para qualquer agenda de exame.
- Já existe o "médico agenda" **ITB** cadastrado em SFP e Menino Jesus. Em Consulta Hoje ele ainda **não existe**.
- Já existe o **procedimento ITB** nas 3 clínicas, mas hoje ele está com `requer_laudo = false` e sem tipo.

## O que muda

### 1. Frontend — liberar a seção de repasse de laudo para ITB
Arquivo: `src/components/medicos/MedicoFormDialog.tsx`

- Trocar a condição atual que só exibe a seção "REPASSE LAUDO TERCEIRO" para o cadastro chamado `ELETROCARDIOGRAMA`, passando a exibi-la também quando o cadastro se chamar `ITB`.
- Ajustar o texto do bloco para citar os dois exames como exemplo, mantendo a mesma explicação (cardiologistas ativos, % ou valor fixo, sem lançamento automático).
- Nenhuma outra tela é alterada — a aba **Convênio**, o cadastro geral do médico e o fluxo do financeiro continuam iguais.

### 2. Banco — marcar o procedimento ITB como "requer laudo"
Nas 3 clínicas (Consulta Hoje, Menino Jesus, SFP):
- Atualizar o procedimento **ITB** para `requer_laudo = true` e `tipo_procedimento = 'equipamento'` (mesmo padrão do ECG). Isso faz o botão **"Vincular laudo"** aparecer em Financeiro → Atendimentos para atendimentos de ITB.

### 3. Banco — criar o médico agenda "ITB" onde falta
- Criar o cadastro de agenda de exame chamado **ITB** na **CLINICA CONSULTA HOJE** (SFP e Menino Jesus já têm). Sem essa agenda não é possível configurar os laudadores nem vincular o laudo no financeiro.

## Como o time vai usar depois

1. Menu **Médicos** → editar o cadastro **ITB** → aparece a seção **REPASSE LAUDO TERCEIRO** com todos os cardiologistas ativos da clínica → define % ou valor fixo para cada um → **Salvar**.
2. Menu **Financeiro → Atendimentos** → localizar o atendimento de ITB → botão **"Vincular laudo"** (individual ou em lote) → escolher o cardiologista → sistema sugere o valor conforme regra cadastrada.
3. Aba **Comprovantes / Repasse** do cardiologista passa a somar o `valor_laudo` do ITB da mesma forma que já soma o do ECG.

## Fora do escopo

- Não altera o motor de cálculo de repasse (já genérico).
- Não altera Comprovantes/Repasse, Convênios, NF-e nem regras de cartão benefícios.
- Não mexe em outras clínicas nem em outros exames.
- Não cria lançamento automático — o financeiro continua decidindo quando lançar.

## Riscos e validação

- Risco baixo: mudança de front é apenas ampliar uma condição de exibição; mudança de banco é limitada aos registros ITB.
- Validação após aplicar:
  1. Abrir cadastro do médico **ITB** em cada clínica → confirmar que a seção de laudadores aparece e que lista os cardiologistas ativos.
  2. Cadastrar um laudador de teste com % e salvar → reabrir e conferir persistência.
  3. Em um atendimento de ITB no Financeiro → confirmar que o botão "Vincular laudo" aparece e sugere o valor configurado.
  4. Conferir na aba Comprovantes que o valor entra no repasse do cardiologista escolhido.
