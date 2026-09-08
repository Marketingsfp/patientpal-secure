# Telefonia — relatório final (perfil oficial)

Regra definitiva: **TELEFONIA é um perfil** em Cadastros › Perfis. Só quem tem
esse perfil, está Online e continua elegível pode receber automaticamente as
conversas que a Nina repassa para atendimento humano.

## 1. Implementação incorreta removida

- A linha "Telefonia — Sem / Leitura / Edição" saiu da matriz de permissões
  (tela, preset e lista de módulos).
- No banco não resta nenhuma linha de permissão `telefonia`
  (`perfil_permissoes` → 0 registros).
- Não existe mais dois conceitos com o mesmo nome.

## 2. Estrutura final do perfil

- Perfis oficiais na tela: ADMIN, GESTOR, MÉDICO, RECEPÇÃO, CAIXA, FINANCEIRO,
  ENFERMEIRO e TELEFONIA.
- Chave: `telefonia` (mesma lista de perfis do sistema).
- Perfil TELEFONIA existente nas 3 clínicas.
- O cadastro de funcionários permite escolher Telefonia como perfil.

## 3. Referências migradas

- A verificação de quem pode receber usa o perfil real da pessoa na clínica
  (`clinica_memberships.role = 'telefonia'`), através de uma única função de
  banco reutilizada por todas as rotinas.
- Tela, distribuição, fila e testes leem a mesma fonte.

## 4. Regra de distribuição

Candidato entra no sorteio somente com: perfil Telefonia + Online + aceitando
novas + presença recente (5 min) + sem pausa aberta + não administrador +
setor/fila compatível + abaixo do limite de conversas simultâneas.
Escolhe-se quem tem menor carga; empate vai para quem está há mais tempo sem
receber. Antes de gravar, tudo é reconferido; quem entrou em pausa ou saiu no
meio é descartado e a vez passa adiante. Travas por clínica e por conversa
impedem dois responsáveis.

## 5. Integração com presença

Online, Pausa e Offline vêm da presença real (batimento a cada poucos
segundos, expiração automática), não de "estar logado". Quando alguém do
perfil Telefonia fica Online, ou encerra uma pausa, a fila é reavaliada
automaticamente pelo servidor. Recepção, Caixa, Financeiro e afins ficando
Online não disparam nada e não recebem.

## 6. Não atribuídas

A fila representa apenas: repasse da Nina + nenhum Telefonia Online elegível.
Ausência genérica de responsável não conta. A Central de Atenção e a rotina do
servidor usam exatamente a mesma regra, e o contador cai em tempo real
conforme as conversas são distribuídas; ao ser atribuída, a conversa sai da
Central e aparece em "Minhas conversas" da pessoa.

## 7. Mudança de perfil

- Perdeu Telefonia: para de receber novas; conversas já atribuídas continuam
  com ela (não são retiradas nesta etapa).
- Ganhou Telefonia e está Online: entra no sorteio das próximas.

## 8. Homologação

Os leads de teste usam o mesmo critério. Conversas de teste nunca entram na
distribuição real, e nenhum usuário sintético recebe só por ser teste. Nos
cenários que terminam em repasse, o ciclo é encerrado e a memória da Nina é
reiniciada, preservando histórico e auditoria.

## 9. Auditoria

Cada atribuição automática grava: conversa, evento de repasse, usuário
escolhido, perfil, perfil Telefonia, situação de presença, carga no momento,
setor/fila, método "distribuição automática", origem "handoff_nina", data/hora
e a lista de candidatos avaliados com o motivo de exclusão de cada um
(`sem_perfil_telefonia`, `admin_excluido`, `status_offline`, `em_pausa`,
`nao_aceita_novas`, `presenca_desatualizada`, `capacidade_lotada`,
`setor_incompativel`).

## 10. Testes e resultado

Cenários conferidos de forma determinística: um Telefonia Online recebe;
Recepção Online não recebe; Telefonia em pausa não recebe; Telefonia offline
não recebe; Admin com Telefonia não recebe; ninguém elegível → Não atribuídas;
volta a ficar Online → fila reavaliada; vários Telefonia → carga equilibrada;
mudou para pausa durante a escolha → vai para outra pessoa; perda de perfil
não retira conversa em andamento. 1.352 testes passando e verificação de
código sem erros.

## Pendências

- Nenhum funcionário está no perfil TELEFONIA ainda: enquanto isso, todo
  repasse da Nina fica em "Não atribuídas".
- Nenhum atendimento, repasse ou atribuição real foi executado nesta entrega.
- É preciso publicar para valer também na versão publicada.
