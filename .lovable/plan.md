## Mudanças em `src/routes/_authenticated/app.atendimento-ia.tsx`

### 1. Remover "Triados pela enfermagem hoje"
- Apagar o bloco JSX das linhas ~512–546 (caixinha rose com os botões dos triados).
- Remover o estado `triados`, a função `carregarTriados`, o `useEffect` que a chama e o canal realtime que a recarrega (linhas ~101, 194–229, 238).
- Remover imports não usados depois (ex.: `HeartPulse` se só era usado aqui — manter se ainda for usado no bloco de Triagem).

### 2. Fila de atendimento em formato de tabela
Substituir o grid de cards (linhas 558–588) por uma `Table` (`@/components/ui/table`) com colunas:

| # | Hora | Paciente | Procedimento | Prioridade | Ação |

- Cada linha mostra `#idx`, hora, nome do paciente (uppercase), procedimento/etapa, badge de prioridade (quando ≠ normal).
- Coluna "Ação" contém um botão **"Atender"** (`size="sm"`) por linha. Linha ativa (`it.id === agendamentoId`) fica com `bg-primary/5` e o botão vira "Em atendimento" desabilitado (ou variant `secondary`).
- Container com `max-h-80 overflow-auto` para manter rolagem.

### 3. Atender só abre o atendimento depois do clique
Hoje o restante da tela (triagem, transcrição, SOAP, botão Salvar) já aparece sozinho sempre que há um `agendamentoId`/paciente — mas o paciente vinha sendo setado por clique direto no card. Mudanças:

- O clique na linha da tabela **não** seleciona mais o paciente — só o botão **"Atender"** chama `selecionar(item)`.
- Envolver as seções abaixo da Card da fila (Triagem, gravação/transcrição, SOAP, ações de salvar — aproximadamente linhas 613 em diante) em uma condicional: renderizar somente quando `agendamentoId` estiver setado. Quando não houver atendimento iniciado, mostrar um aviso curto: "Selecione um paciente da fila e clique em Atender para iniciar."
- A função `selecionar` permanece igual (continua marcando `fluxo_etapa = "atendimento"`).

### Sem alterações
- Lógica de IA, SOAP, salvar, triagem, transcrição: nada muda.
- Banco de dados, RLS, rotas, permissões: nenhuma alteração.
- Outras telas (Agenda, Financeiro): não tocadas.