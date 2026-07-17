## Objetivo

1. Garantir que **contratos de renovação nunca cobrem taxa de adesão e nunca tenham carência** — em qualquer cenário (extensão do mesmo convênio ou troca de plano).
2. No fluxo de **Novo contrato** (botão "Novo contrato" da tela de Contratos), abrir **primeiro um pop-up** perguntando "Este contrato é uma renovação?" antes de qualquer coisa. Fluxo depende da resposta.

---

## Verificação da situação atual

- **Carência (Agenda):** Confirmei em `src/routes/_authenticated/app.agenda.tsx` (linhas 348–505) que a lógica já detecta renovação via `numero_renovacoes > 0` ou `contrato_origem_id` e pula a carência (`carenciaCumprida`).
- **Caixa/PDV:** `carenciaCumprida` só é usada em `app.agenda.tsx` e `cb-regras.ts`. Não há outra tela reaplicando carência — o Caixa consome os valores já calculados pela Agenda. Não precisa de outro ajuste.
- **Taxa de adesão na renovação:** Em `src/components/contratos/renovar-contrato-dialog.tsx` (linha 219), a taxa é cobrada quando `mode === "troca_plano" && cobrarTaxa`. Existe um checkbox opcional. **Precisa ser removida** por regra fixa: renovação nunca cobra adesão.
- **Fluxo de nova venda:** `src/components/pages/contratos-page.tsx` linha 528 dispara `setView("new")` que renderiza `NovoContratoForm`. Hoje não há nenhuma pergunta prévia sobre renovação.

---

## Mudanças propostas

### A. Renovação sempre sem taxa de adesão

Em `src/components/contratos/renovar-contrato-dialog.tsx`:

- Remover o estado `cobrarTaxa` e o checkbox "Cobrar taxa de adesão do novo convênio".
- Fixar `taxaAdesaoCobrada = 0` em toda renovação (extensão e troca de plano).
- Passar `_cobrar_taxa_adesao: false` para o RPC.
- No resumo (bloco de totais), remover a linha da taxa de adesão quando ela ficar zero.

Carência já está tratada — sem alteração adicional.

### B. Pop-up "É renovação?" antes de abrir a nova venda

Em `src/components/pages/contratos-page.tsx`:

1. Novo estado local `perguntaRenovacaoAberta` na `ContratosPage`.
2. Alterar o `onClick` do botão "Novo contrato" (linha 528): em vez de `setView("new")`, abrir o dialog de pergunta.
3. Criar um `AlertDialog` simples com o texto **"Este contrato é uma renovação de um contrato anterior?"** e dois botões:
   - **Sim, é renovação:** abre um segundo passo pedindo para **buscar o paciente titular** e escolher qual dos contratos anteriores dele será renovado (lista de contratos do paciente, ordenados por mais recente). Ao confirmar, abre o `RenovarContratoDialog` já existente com aquele contrato — que agora nunca cobra adesão e cuja carência já é ignorada.
   - **Não, é uma venda nova:** segue o comportamento atual (`setView("new")`, `NovoContratoForm`, com taxa de adesão normal e carência normal).
4. Se o titular selecionado não tiver contrato anterior elegível, mostrar aviso ("Este paciente não tem contrato anterior — a venda seguirá como contrato novo") e prosseguir para o fluxo de nova venda.

### C. Registro/observabilidade

- Renovações continuam gravadas em `contrato_renovacoes` como hoje (o RPC atual já registra).
- Não há mudança de schema.

---

## Fora do escopo

- Nenhuma alteração em RPCs SQL (`renovar_contrato_extensao`, `renovar_contrato_troca_plano`) — o parâmetro `_cobrar_taxa_adesao` continua existindo, apenas será sempre enviado como `false` pelo cliente. Se você quiser reforçar isso no backend também, posso propor uma migração depois.
- Não mexer no `NovoContratoForm` — a venda "não renovação" mantém carência e taxa de adesão como estão.
- Não mexer em contratos já criados.

---

## Validação prevista

- Abrir "Novo contrato" → pop-up aparece.
- Escolher "Não" → fluxo antigo, com taxa e carência.
- Escolher "Sim" → seleciona paciente e contrato origem → abre dialog de renovação sem checkbox de taxa e com valor final sem adesão.
- Simular agendamento em contrato renovado → benefício sai imediato (sem carência).

---

## Pendências / suposições

- **Suposição:** por "aparecer um pop-up antes de qualquer coisa" você quer dizer *antes de abrir o formulário de nova venda* (ao clicar no botão "Novo contrato"), e não em toda a tela de listagem. Se for outro momento (ex.: ao abrir o menu "Contratos"), me avise para ajustar.
- **Possível regra de negócio — validar com a equipe:** se um contrato marcado como renovação **também não deve ter fidelidade** (além de não ter taxa e carência), me confirme — hoje o campo `fidelidade_meses` não é alterado.
