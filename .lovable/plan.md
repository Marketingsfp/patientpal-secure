## O que está acontecendo

**1. Nome do laudador não aparece.** Na coluna "Laudo" da tela de Atendimentos, quando o laudo já foi vinculado, aparece apenas o selo azul "Vinculado" — o nome do médico que ficou com o laudo não é exibido em lugar nenhum da linha.

**2. Repasse do Dr. Sandro não mostra o laudo da Maria.**
Verifiquei o banco:
- Maria Coelho de Moura (ELETROCARDIOGRAMA de **20/07**) foi vinculada ao Dr. Sandro em **21/07**.
- O sistema criou corretamente o lançamento "[LAUDO] ELETROCARDIOGRAMA (ECG)" para o Dr. Sandro no valor de R$ 18,00.
- **Porém, esse lançamento ficou com data = 21/07 (dia em que o laudo foi vinculado), e não 20/07 (dia do atendimento).**

Como a tela filtra por período do atendimento (De 20/07 até 20/07), o repasse do laudo da Maria fica fora do intervalo e "some". O mesmo aconteceria com qualquer laudo vinculado em data diferente da realização do exame. O caso do Antonio Jose de Almeida aparece só porque a vinculação foi feita no mesmo dia do exame.

A causa está na trigger do banco `gerar_repasse_laudador_lanc` (e sua irmã `gerar_repasse_laudador`), que grava `data = COALESCE(laudo_emitido_em::date, CURRENT_DATE)` no repasse "[LAUDO]".

## O que vai ser alterado

Aplicado nas duas clínicas (Menino Jesus e SFP) — é uma correção puramente técnica.

### Frontend — coluna Laudo

- Na coluna **Laudo** da tela de Atendimentos, quando o status for "emitido", exibir o nome do médico laudador logo abaixo do selo "Vinculado" (usa o `medico_laudador_id` já disponível no item + o mapa de médicos já carregado na página). Tooltip continua explicando que clicar desvincula.

### Banco — corrigir data do repasse "[LAUDO]"

- Ajustar as duas triggers `gerar_repasse_laudador` (em `fin_atendimentos`) e `gerar_repasse_laudador_lanc` (em `fin_lancamentos`) para gravar o repasse do laudo com a **data do atendimento original** (`NEW.data`) em vez da data em que o laudo foi vinculado. Assim o repasse acompanha o dia da realização do exame, que é o campo pelo qual a tela filtra.
- Backfill dos repasses "[LAUDO]" já existentes que ficaram com data descolada: ajustar `fin_atendimentos.data` do "[LAUDO]" para bater com a data do atendimento/lançamento de origem (usando `laudo_lancamento_id`).

### Validação

- Após a correção, o "[LAUDO] ELETROCARDIOGRAMA (ECG)" da Maria passará a aparecer na lista do Dr. Sandro no dia 20/07/2026.
- Novas vinculações de laudo (individual ou em lote) já entram com a data correta.

### Fora do escopo

- Regras de cálculo de valor de laudo, cadastro de laudadores, layout do comprovante — nada disso muda.
- Fluxo de estorno/desvinculação continua igual.

## Pendências para confirmar

- Confirma que quer a alteração aplicada nas **duas clínicas** (Menino Jesus e SFP)? A regra da trigger é compartilhada, então é global por natureza; só quero registrar sua confirmação conforme a Regra 1.10 do AGENTS.md.
