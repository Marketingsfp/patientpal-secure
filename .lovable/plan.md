# Tela do médico com as funções da "Agenda do Profissional" (Clínica Total)

O pedido é grande e mistura regra de negócio, tela nova, correção de código e banco. Fazer tudo de uma vez aumenta o risco de erro. A proposta é dividir em **4 etapas**. Cada etapa é entregue, conferida por vocês e só então a próxima começa.

Tipo do pedido: ajuste de tela e fluxo do médico (principal), correção de código (observações apagadas) e, em parte, regra de negócio e banco (itens que ainda não existem).

## O que já existe e será reaproveitado
- Fila do médico e tela da consulta (`/app/atendimento-ia`), com prontuário gravado por agendamento.
- Triagem da enfermagem, prontuários (inclusive os importados do sistema antigo), modelos de prontuário, documentos emitidos e modelos de documento (atestado), orçamentos e itens de orçamento do agendamento, senhas e painel/TV, alertas de enfermagem e Hiperdia.

## O que NÃO existe hoje no sistema
Para esses itens seria preciso criar tabela nova, e isso fica para depois da etapa 3:
- Avaliações corporais (peso, altura, IMC, circunferências ao longo do tempo).
- Anexos e fotos do paciente: não há tabela nem pasta de arquivos própria.
- Alertas do paciente (alergias, avisos): só existem alertas de enfermagem e alertas financeiros.
- Controle Hiperbárico (pré-atendimento, SAE, gestão de mergulhos, escala USP): não há nada. O Hiperdia é outra coisa.
- Consultas avulsas dentro da baixa: é preciso confirmar se equivalem aos "itens do agendamento" que já existem.

---

## Etapa 1: correções e histórico (pequena, segura)
1. **Observações apagadas:** salvar a consulta deixa de gravar observações vazias por cima do que já existia. Só grava quando houver texto novo.
2. **Linha do tempo do prontuário:** componente único que mostra todos os prontuários do paciente, de qualquer médico, incluindo os importados do sistema antigo. Tem filtro por ano e especialidade, opção "Exibir informações extras" e, em cada cartão, data, "Procedimento realizado: SERVIÇO > PROCEDIMENTO", "Realizado por" e a descrição (ou "Prontuário não cadastrado."). O que o médico acabou de salvar aparece na hora.
3. **Ficha do paciente:** nova aba "Prontuário" com essa linha do tempo.
4. **Tela /app/prontuarios:** busca por nome ou número da pasta.
5. Quem vê o histórico: médico, enfermagem e administração, seguindo as permissões que já existem.

## Etapa 2: a fila do médico igual à antiga
1. Cabeçalho com o nome do médico, selo "Certificado digital" (só se já houver o dado no cadastro), contador "Atualiza: XX seg." de 60 s, botão "Visualizar agenda geral" e os 3 cartões do dia: Agendamentos, Aguardando (laranja) e Atendidos (verde).
2. Abas Em Atendimento | Aguardando | Atendidos, com as colunas pedidas: Ficha, Horário, Pasta, Cliente com idade completa, Serviço, Procedimento, Profissional e Espera.
3. Aguardando: ordenar por Chegada ou Prioridade, botão **Chamar** (usa o painel/TV que já existe) e botão **Atender**.
4. Em Atendimento: triagem só para leitura e editor de prontuário com texto rico, direto na fila. Ele grava no mesmo prontuário da tela da consulta.
5. Atendidos: botão **Estornar**, com a confirmação nas palavras pedidas, que devolve o paciente para Aguardando.
6. Cada médico continua vendo só a própria fila.

## Etapa 3: menu "Opções" e "Baixar"
1. Menu Opções com Requisição/Orçamento, Prontuário (a linha do tempo da etapa 1, com "+ Adicionar Prontuário" e tags), Atestado (impressão térmica e A4, pelos modelos de documento), Documentos, Retornos (agenda um retorno com a agenda que já existe) e Triagem.
2. Modal **Baixa de Agendamento**: tabela Filial/Data/Intervalo/Cliente/Profissional/Convênio (convênio editável), campo de prontuário e botões "Fechar" e "Cliente atendido".
3. Itens que dependem da etapa 4 aparecem no menu como "em breve", sem fingir que funcionam.

## Etapa 4: o que precisa de tabela nova (só com aprovação)
Avaliações Corporais, Alertas do paciente, Anexos e Fotos (com pasta de arquivos protegida) e Controle Hiperbárico. Para cada um, apresento os campos antes de criar.

---

## Possíveis regras de negócio para validar com a equipe da clínica
- **Estornar:** devolve para Aguardando e mantém o prontuário já escrito. Não mexe no financeiro. Confirmar.
- **Baixar e convênio:** trocar o convênio na baixa pode mudar o valor cobrado (área do financeiro). Proposta: na etapa 3, o convênio só pode ser mudado se o atendimento ainda não foi pago. Confirmar.
- **"Cliente atendido":** usa o mesmo fim de atendimento que já existe hoje (status realizado). Não cria uma regra nova.
- **Consultas avulsas:** precisam de definição. Hoje não sei com segurança a que isso corresponde no sistema.

## Fora do escopo
Financeiro, faturamento, NFS-e, agenda da recepção e Nina. Nada do que já funciona é removido.

## Detalhes técnicos
- Correção na gravação de `src/routes/_authenticated/app.atendimento-ia.$agendamentoId.tsx` (tirar o `observacoes: null`).
- Novo componente compartilhado da linha do tempo, usado na consulta, na fila, na ficha do paciente e no menu Opções. A lista é atualizada logo após salvar.
- Editor de texto rico: verificar se já existe algum no projeto antes de instalar um novo.
- Etapa 4: novas tabelas com permissões e regras de acesso por clínica, seguindo o padrão do projeto.
