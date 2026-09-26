# Simulações de pacientes — 41 profissionais — Nina (Policlínica Menino Jesus)

Ambiente: Homologação (console no navegador embutido). Início: 26/09/2026.
Versão alvo: `5a512c969` (horários por período) — conferida pela impressão digital
em `/api/public/nina-runtime` antes do 1º teste.

Mesmo formato das simulações de 24/09 (`simulacoes-pacientes-consultas.md`):
reset do lead → espera de ~15 s → conversa com perfil próprio → fim (agendamento,
orientação de comparecimento ou encaminhamento). Um teste por profissional. Nomes
"Simulação Teste NN" para rastreio. **Vagas ocupadas pelos testes são devolvidas no
final** (SQL entregue ao usuário, `paciente_nome` volta a `DISPONIVEL`).

Focos espalhados pelos perfis: regra por período (mais de 10 horários, "de
manhã", "tanto faz", "depois das 14h", "mostra os outros"); preferência já dita;
horário + nome + nascimento na mesma mensagem; escolha junto com pergunta de
preço; consulta para familiar; nome leigo da especialidade; dia da semana fixo.

## Roteiro

| # | Profissional | Consulta | Perfil / foco |
|---|---|---|---|
| 01 | Alex Louza | Cardiologia Infantil | Mãe, filho de 8 anos com sopro; pede a primeira data (sem vagas em 25/09 — conferir encaminhamento correto) |
| 02 | Anderson Eloy | Neurologia | Enxaqueca; "tanto faz" o período (pré-agendamento) |
| 03 | André Luis | Angiologia | "Médico de varizes" (nome leigo); manda horário, nome e nascimento juntos |
| 04 | Antonio Cobucci | Cardiologia | Hipertenso; escolhe horário e pergunta o valor na mesma mensagem |
| 05 | Armando Jose | Ortopedia | Dor no ombro; "depois das 14h" / pede outro período |
| 06 | Barbara de Oliveira Soriano | Psicologia | Ansiedade; pede "mostra os outros" |
| 07 | Carlos Alberto Varillas | Clínico Geral | Febre; ficha (numeração) |
| 08 | Carlos Eduardo | Neurologia | Filho de 4 anos; mais de 10 horários → escolhe "à tarde" e depois "mostra os outros" |
| 09 | Claudia Maria | Ginecologia | Quer médica mulher; dúvida sobre preventivo |
| 10 | Conceição Martins | Ginecologia | Consulta + preventivo de rotina |
| 11 | Diogo Del Cima | Gastroenterologia | Azia; prefere terça |
| 12 | Elair Magalhães | Clínico Geral | Só pode sábado (conferir escala) |
| 13 | Eliane Cristina | Psicologia | Luto; marca para a irmã (familiar) |
| 14 | Eneida Rodrigues | Otorrinolaringologia | Sinusite; "de manhã" |
| 15 | Eugenio Cesar | Ortopedia | Joelho, prefere quarta; horário + nome + nascimento juntos |
| 16 | Felipe Moura | Endocrinologia | Tireoide; pergunta preço antes de marcar |
| 17 | Iara Camello | Nutrição | Ganhar massa; "tanto faz" |
| 18 | Iarmila Ruzena | Clínico Geral | Diabética; prefere quinta |
| 19 | Jean Ferreira | Odontologia | Dor de dente (escala vazia no catálogo — conferir) |
| 20 | João Hélio | Oftalmologia | Vista embaçada; horário sem início no catálogo |
| 21 | Jorge Ribeiro | Ortopedia | Coluna; ficha |
| 22 | Jose Roberto | Ortopedia | Torção de tornozelo; apressado |
| 23 | Karen | Odontologia | Avaliação odontológica (pré-agendamento) |
| 24 | Ketlen Pereira | Pediatria | Bebê de 1 ano; só sábado |
| 25 | Marcilio Quintão | Ginecologia | Cólica; consulta simples (sem preventivo) |
| 26 | Maria da Penha | Psicologia | Estresse no trabalho; "depois das 14h" |
| 27 | Mariana Portugal | Nutrição | Emagrecer; pede outra data |
| 28 | Marina Almeida | Oftalmologia | Óculos; pré-agendamento |
| 29 | Mauricio Albuquerque | Otorrinolaringologia | Ouvido entupido; ficha |
| 30 | Milton Guimarães | Dermatologia | Manchas na pele |
| 31 | Paulo Guilherme | Angiologia | Pernas inchadas; sexta |
| 32 | Rafael Barros | Mastologia | Nódulo na mama; mulher assustada |
| 33 | Raiani | Odontologia | Avaliação; pré-agendamento, prefere quarta |
| 34 | Raisa Moura | Dermatologia | Acne; manda horário, nome e nascimento juntos |
| 35 | Rosângela Riolino | Cardiologia | Primeiro disponível de cardiologia (entre vários) |
| 36 | Sandro da Silva Prinsceswal | Clínico Geral | Check-up; ficha |
| 37 | Sergio Mendes | Pediatria | Criança com tosse; marca para o filho |
| 38 | Sérgio Palermo | Pediatria | Criança de 6 anos; "de manhã" |
| 39 | Sérgio Satoshi | Obstetrícia | Gestante de 12 semanas |
| 40 | Suely Martins | Psicologia | Só sábado |
| 41 | Valeria Silveira | Ortopedia | Sábado; ficha; "mostra os outros" |

## Resultados

| # | Perfil | Consulta / profissional | Resultado | Observações |
|---|---|---|---|---|
| 01 | Mãe, filho de 8 anos com sopro (Lead 01, ciclo 474) | Cardiologia Infantil / Alex Louza | AGENDADO 03/10 08:10 (hora marcada), ~4 min | Ofereceu Alex Louza e Antonio Cobucci (a partir de 6 anos), com valores e critérios. Alex tinha só 3 horários no sábado → mostrou todos. Pediu "seu nome e nascimento" (a consulta é do filho). **Defeito grave: o cadastro foi gravado com o nome "CONSULTA DO MEU FILHO SIMULACAO TESTE NASCIDO EM"** — a frase inteira virou nome. O resumo final não mostra o nome do paciente. Aviso de ciclo já cai na conversa de teste (correção 0c92d3cfc no ar) |
| 02 | Enxaqueca; "tanto faz"; "mostra os outros" (ciclo 475) | Neurologia / Anderson Eloy | ESCALOU (MJ-487) — falha operacional ao escolher 10:20 | **Regra por período funcionou**: sexta 02/10 com mais de 10 → "manhã ou tarde?"; "tanto faz" → 10 primeiros com aviso; "mostra os outros" → 11:10–12:40 sem repetir. **Defeito da regra nova:** o modelo pediu "mais" com a_partir_da_hora, a lista recomeçou e 10:20 (1ª página) saiu das opções → recusa → encaminhamento. Corrigido em 6b2ea1f26 (a publicar). Também: repetiu "Esses são os primeiros" na 2ª página; agenda com vagas até 16:10 com limite de chegada 15:30 |

*Testes pausados após o 02 para corrigir o defeito da paginação e publicar (6b2ea1f26).*
| 02 (reteste 1) | Mesmo perfil, sessão 476 | Neurologia / Anderson Eloy | Perdido — página recarregada no meio do turno | Resposta gerada mas não entregue (`lacunas: mensagem_entregue`); o console reenviou a mensagem após recarregar e a sessão ficou "encerrada". Lição: não recarregar/redimensionar o console durante um turno |
| 02 (reteste 2) | Mesmo perfil, sessão 477 | Neurologia / Anderson Eloy | ESCALOU (MJ-488) — mesmo defeito | Pergunta de período e "tanto faz" corretos ("nesse dia"); "mostra os outros" trouxe 11:20–12:50 sem repetir. Escolha de 10:20 (1ª página) recusada de novo. **Causa real:** a chave da lista usava o termo da pesquisa do catálogo, refeito a cada mensagem, e o procedimento das opções vinha da pesquisa do turno ("mostra os outros" não acha nada) → opções sem procedimento. Corrigido em 06344ebd5 (a publicar) |
| 02 (reteste 3) | Enxaqueca; "tanto faz"; "mostra os outros"; volta à 1ª página (sessão 478, versão 06344ebd5) | Neurologia / Anderson Eloy | **PRÉ-AGENDADO 02/10 10:20** | Correção confirmada no ar: período → "tanto faz" ("nesse dia") → "mostra os outros" ("Esses são os próximos… nesse dia") → escolha de 10:20 da 1ª página aceita → nome gravado certo ("SIMULACAO TESTE DOIS"). Instabilidade: 1ª mensagem levou ~80 s e um turno caiu (`GENERATION_OUTCOME_UNKNOWN`, "Internal server error"); o botão "Tentar novamente" recuperou |
| 03 | "Médico de varizes"; período + horário + nome + nascimento na mesma mensagem (ciclo 479) | Angiologia / André Luis | ESCALOU (MJ-490) — falha operacional | Reconheceu "varizes" → Angiologia (em 24/09 falhou) e listou André Luis e Paulo Guilherme. 1ª data 28/09 com >10 → perguntou o período. **Defeito conhecido reproduzido:** mensagem com "nasci" faz a leitura da escolha ser descartada → seleção recusada → encaminhamento. Catálogo diz "chegada até 08:00" mas a agenda tem vagas à tarde |
| 04 | Hipertenso; escolhe horário e pergunta o valor na mesma mensagem (ciclo 480) | Cardiologia / Antonio Cobucci | AGENDADO 01/10 12:20 (após "tente de novo") | Consultou a agenda direto e mostrou os 7 horários (≤10). **Defeito:** "Prefiro 12:20. E em dinheiro fica quanto?" → seleção OK, mas a coleta de cadastro não respondeu e caiu no aviso falso "Não consegui concluir a consulta ao cadastro"; o preço não foi respondido. Com "Pode tentar de novo?" seguiu normal |
| 05 | Motoboy, dor no ombro, "só depois das 14h" (ciclo 481) | Ortopedia / Armando Jose | FALHOU — turno caiu (`GENERATION_OUTCOME_UNKNOWN`, "Internal server error") | A Nina encadeou 6 chamadas (base, buscar_medicos, proxima_vaga ×2, buscar_medicos) e o contexto chegou a 218 mil caracteres; o processo caiu na chamada seguinte ao modelo. 2ª queda do dia (a 1ª em 13:29, contexto 192 mil) |

**Testes interrompidos após o 05 (26/09 ~13:50).** O reset do lead ("Resolver / Reiniciar teste", com limpeza da agenda ligada por padrão) **apagou as vagas usadas pelos testes 01, 02 e 04** (Alex Louza 03/10 08:10, Anderson Eloy 02/10 10:20, Antonio Cobucci 01/10 12:20): as linhas sumiram da agenda em vez de voltar a DISPONIVEL. Defeito já registrado em 25/09 (memória "limpeza da homologação apaga a vaga"). SQL de recriação entregue ao usuário. Continuar só depois de corrigir a limpeza.
