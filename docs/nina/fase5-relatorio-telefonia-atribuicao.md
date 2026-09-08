# FASE 5 — Relatório final: status Telefonia e atribuição automática

## 1. Causa raiz encontrada

Três problemas somados explicavam "quem não devia recebia, e quem devia não recebia":

1. **Pool paralelo sem regra.** Existia um caminho alternativo de atribuição
   (`autoAtribuirRoundRobin`) que ignorava Telefonia, presença e administrador.
2. **Presença não confiável.** O status podia ficar "Online" indefinidamente
   depois de fechar o navegador, e o que a tela mostrava podia divergir do que o
   servidor usava para decidir.
3. **Fila dependente da tela aberta.** "Não atribuídas" só era reavaliada quando
   alguém interagia com o aplicativo, e uma conversa sem atendente compatível
   travava o resto da fila.

Some-se a isso o fato de que, hoje, **nenhum perfil em Cadastros › Perfis tem a
permissão Telefonia marcada** — enquanto isso não for feito, o pool automático
fica legitimamente vazio.

## 2. Arquitetura de presença

- Fonte única no servidor: tabela de presença por clínica (status, "aceita
  novas" e último sinal de vida).
- O aplicativo envia um sinal de vida periódico; sinal com mais de 5 minutos é
  tratado como offline, mesmo que o registro diga "Online".
- Várias abas do mesmo usuário contam como uma só pessoa: fechar uma aba não
  derruba a outra, e fechar a última marca Offline.
- Sair da conta encerra a presença imediatamente.
- Pausa grava na hora "não aceita novas"; encerrar a pausa devolve a pessoa ao
  pool e reavalia a fila.
- Mudanças de presença são publicadas em tempo real para as telas autorizadas.

## 3. Critério de elegibilidade (avaliado no servidor, no instante da entrega)

Permissão Telefonia + Online + aceitando novas + sinal de presença recente +
sem pausa aberta + não administrador + fila não travada + setor/unidade
compatível + abaixo do limite de conversas simultâneas.

## 4. Algoritmo de atribuição

1. Lê os candidatos direto do banco (a tela nunca envia lista pronta).
2. Filtra pelo setor da conversa, quando há alguém elegível daquele setor.
3. Ordena por menor carga (conversas reais em andamento), depois por quem está
   há mais tempo sem receber e, por fim, pelo identificador — resultado justo e
   determinístico, sem premiar sempre o primeiro da consulta.
4. Revalida o escolhido imediatamente antes de gravar; se ele saiu, entrou em
   pausa ou perdeu a permissão, passa para o próximo.
5. Sem ninguém elegível, a conversa fica em "Não atribuídas".

## 5. Concorrência

- Trava por clínica: dois handoffs simultâneos, dois processos, webhook repetido
  ou nova tentativa entram em fila e nunca escolhem ao mesmo tempo.
- Trava da conversa + gravação condicional ("só grava se ainda estiver sem
  dono"): uma conversa nunca recebe duas atribuições automáticas.

## 6. Redistribuição de "Não atribuídas"

- Disparada pelo próprio banco quando alguém com Telefonia fica Online ou
  encerra a pausa — funciona sem ninguém com a tela aberta.
- Ordem: maior prioridade primeiro; dentro da prioridade, quem espera há mais
  tempo.
- Conversa sem atendente compatível não trava a fila; a rotina segue para as
  próximas.
- O contador da Central de Atenção cai em tempo real até desaparecer.

## 7. Auditoria por atribuição

Cada atribuição automática grava: conversa, evento de handoff de origem,
candidatos avaliados com o motivo de exclusão de cada um, atendente escolhido,
permissão Telefonia, status de presença, carga no momento, setor/fila, método e
horário. Isso é suficiente para responder "por que esta conversa foi para esta
pessoa" sem log temporário.

Motivos de exclusão exibidos em diagnóstico/homologação, por exemplo:

```text
Jean   → elegível
Maria  → excluída: Pausa
Carlos → excluído: sem Telefonia
Admin X→ excluído: Admin
```

## 8. Performance

- A decisão inteira acontece em uma transação no banco: leitura do pool,
  balanceamento, revalidação e gravação — sem ida e volta por candidato.
- A tela de diagnóstico passou a usar uma única consulta (antes fazia várias
  consultas por atendente).
- Sem varredura periódica agressiva: a redistribuição é acionada por evento
  (presença/pausa) e as telas usam tempo real.
- Números de tempo em produção ainda não foram medidos (ver pendências).

## 9. Testes executados

- Verificação de tipos: sem erros.
- Suíte da Nina: **972 testes / 6.600 verificações**, todas passando.
- Cobrem: Telefonia + Online; sem Telefonia; pausa; offline; administrador;
  empate de carga; capacidade lotada; troca de status durante a seleção;
  ausência total de elegíveis; 10 conversas na fila com 1 e com 3 atendentes;
  duas pessoas entrando Online juntas; unidade incompatível; auditoria
  incompleta; atribuição duplicada.

## 10. Resultados e pendências

Atendidos: presença confiável e alinhada entre tela e servidor; somente
Telefonia Online recebe; administrador continua fora; revalidação antes de
gravar; atribuição atômica; fila redistribuída; balanceamento entre várias
atendentes; nenhuma atribuição duplicada; atualização em tempo real.

Pendências honestas:

- Nenhum atendimento, handoff, envio ou distribuição **real** foi executado —
  toda a validação é de código, banco e testes automatizados.
- Tempos reais (handoff → atribuição, duração da redistribuição) não foram
  cronometrados em produção.
- O pool só sai do zero depois que algum perfil receber a permissão Telefonia
  em Cadastros › Perfis.
- As mudanças de banco valem no ambiente publicado após a publicação.
