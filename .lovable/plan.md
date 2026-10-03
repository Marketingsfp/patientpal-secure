# Etapa E do Jev — Sinais de urgência e remarcação pela Maria

Respostas de 03/10/2026: remarcação até **2 horas antes**; sinais de urgência: **dor forte/falta de ar, sangramento/desmaio, gestante, criança ou idoso**; ação: **só transferir** (sem orientação médica).

Hoje a Maria do WhatsApp **não remarca**: ela transfere para a recepção. A remarcação mexe na agenda (área crítica). Por isso, a etapa vai em duas partes, cada uma entregue, testada e aprovada antes da próxima.

## Parte E1 — Sinais de urgência separados (pequena, sem mexer na agenda)
- O sinal único de urgência vira 4 perguntas ao Jev, uma para cada sinal escolhido.
- Qualquer sinal acima do limite → transfere com urgência alta. A categoria fica "Urgência clínica" e a Central mostra qual sinal foi.
- A Maria só avisa que vai transferir. Ela não dá orientação médica.
- "Gestante" e "criança ou idoso" só contam **quando há uma queixa**. Uma gestante marcando pré-natal de rotina não é urgência.
- Os limites de cada sinal aparecem na tela Decisões do Jev. Padrão: 0,5. Só administradores mudam.
- Fica atrás da chave `nina_jev_fase9`, desligada até você ligar.

## Parte E2 — Remarcação pela Maria (agenda)
- A Maria identifica o paciente e mostra **só os agendamentos futuros dele**.
- Se faltam menos de 2 horas, ou se não dá para confirmar o agendamento, ela transfere para a recepção como hoje.
- Ela consulta a agenda real e oferece só horários livres do mesmo profissional e do mesmo atendimento. O Jev da Etapa B ajuda a entender a escolha.
- Ela mostra um resumo com o horário antigo e o novo e pede um "sim".
- A troca é feita pelo mesmo processo de remarcação que a Agenda já usa, com o motivo "Remarcado pelo paciente via WhatsApp" e registro de auditoria.
- A Maria só diz "remarcado" depois que o sistema confirma. Se a troca falhar, o horário antigo continua valendo e ela avisa.
- Cancelamento continua sempre com a recepção.
- Fica atrás da chave `nina_remarcacao_whatsapp`, desligada até você ligar.

## Fora do escopo
- Cancelar pela Maria.
- Remarcar para outro profissional ou outro atendimento. Esses casos vão para a recepção.
- Publicar (só com a sua autorização).

## Riscos
- E2 altera agendamentos reais. Vou testar só na homologação e com dados rastreáveis.
- Ainda falta definir **o que é "idoso"**. Vou usar 60 anos ou mais, pelo Estatuto da Pessoa Idosa — possível regra de negócio, validar com a equipe da clínica.

## Detalhes técnicos
- E1: `jev-encaminhamento.ts` ganha `urgencia_dor_ar`, `urgencia_sangramento_desmaio`, `urgencia_gestante`, `urgencia_crianca_idoso` (noul, com a queixa exigida no critério); `decidirEncaminhamento` usa o maior deles. `nina_jev_limites` recebe as colunas por sinal (padrão no código, faixa 0,3–0,95).
- E2: nova ferramenta do paciente `remarcar_agendamento` em `paciente-tools.server.ts`, que chama `reagendar-agendamento.core.server`. Ela confere quem é o dono do agendamento, a antecedência de 2 h no fuso America/Sao_Paulo, a vaga livre logo antes de gravar e se o horário novo estava entre os oferecidos. `behavior-v4.ts` e `agenda-flag.server.ts` passam a permitir remarcar, só com a chave ligada.
- Validação por parte: `bun test`, `bunx tsgo --noEmit -p tsconfig.json`, conversa real na homologação e relatório Antes/Depois.
