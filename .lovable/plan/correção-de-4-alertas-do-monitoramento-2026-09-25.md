# Correção de 4 alertas do monitoramento

## Situação confirmada
1 e 2. **Coach: prova e treino não são salvos.** Confirmado. O banco hoje só aceita leitura e exclusão feitas pela tela nessas duas tabelas. As permissões de gravar e atualizar foram retiradas em 19/09, mas as telas de prova e de treino continuam gravando direto. Resultado: a prova mostra erro ao salvar e o treino some sem aviso.
3. **"Permissão negada" ao ler os vínculos do usuário.** Não foi possível confirmar com segurança. As 19 ocorrências batem com momentos de sessão vencida ("Invalid Refresh Token"). A tela ignora o erro sem avisar.
4. **Horários médicos: "TODAS AS AGENDAS" ignora as outras agendas.** Confirmado. Quando o médico tem uma agenda por ordem de chegada, a escolha "TODAS AS AGENDAS" gera fichas só nessa agenda. A agenda de EXAMES, por exemplo, fica sem horários e ninguém é avisado.

## O que será feito
**A. Coach (1 e 2), só no módulo Coach.** A prova e o treino passam a gravar pelas funções do servidor que já existem (`iniciarTreino`/`encerrarTreino` e `finalizarProva`). A nota continua sendo calculada no servidor. As permissões do banco não voltam a ser abertas. Isso fecha a pendência "conectar telas" da Etapa 2b.

**B. Vínculos (3).** Quando a leitura falhar, a tela mantém a lista que já estava carregada. Ela renova a sessão e tenta mais uma vez. Se falhar de novo, mostra um aviso para sair e entrar outra vez, em vez de deixar o menu vazio. O banco não muda.

**C. Horários médicos (4).** Possível regra de negócio — validar com a equipe da clínica. Proposta: com "TODAS AS AGENDAS", a agenda por ordem de chegada recebe as fichas e as outras agendas do médico recebem os horários da grade normal, juntos na mesma prévia. Se a equipe preferir outro jeito, a alternativa é bloquear essa opção e pedir que o usuário escolha uma agenda por vez, com um aviso claro.

## Fora do escopo
Agenda, Financeiro, Nina e as permissões do banco para outras tabelas.

## Validação
Verificação de tipos, testes do Coach e da Agenda, e um teste na tela da prova e do treino.
