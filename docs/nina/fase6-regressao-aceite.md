# Fase 6 — Regressão e aceite (Nina: configuração × execução × resposta)

Data: 10/09/2026 · Ambiente: desenvolvimento (nenhuma publicação, nenhum envio
real de WhatsApp, nenhum dado de paciente real).

## 1. O que foi executado

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Tipos | `bunx tsgo --noEmit` | 0 erros |
| Testes (projeto inteiro) | `bun test` | 2.870 passaram, 0 falharam, 257 arquivos |
| Suíte nova da Fase 6 | `bun test src/lib/nina/homologacao/fase6-regressao-aceite.test.ts` | 32 passaram, 94 verificações |
| Build | `bun run build` | concluído em ~46 s |

### Falhas anteriores × falhas desta fase

Ao iniciar a Fase 6, a regressão apontou **7 falhas já existentes**, todas
herdadas da Fase 5 (o mapa da Arquitetura foi alterado sem atualizar o
histórico e as ligações). Nenhuma foi causada pelas alterações desta fase.
Todas foram corrigidas aqui:

- ligação da geração do modelo apontava para a validação, pulando a nova
  finalização; a finalização declarava um antecessor que não a declarava de
  volta;
- o componente de templates ficou sem antecessor, virando um segundo "ponto de
  entrada" do mapa;
- o histórico da Arquitetura não tinha a versão 5 registrada, e a marca de
  "versão sincronizada" continuava na 4 — o painel mostrava vermelho;
- ao acrescentar um componente novo, o desenho reposicionava componentes que já
  tinham lugar e jogava o novo para longe de quem se relaciona com ele.

## 2. Matriz de cenários

Versão de comportamento: manifesto da Arquitetura **v5** (registrada no
histórico nesta fase). "Hash" abaixo é a impressão digital do texto final
calculada pela finalização (`textoHash`), comparada entre canais.

| # | Cenário | Versão/base | Origem da resposta | Intervenções | Esperado | Observado | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Rascunho de template salvo | template em rascunho | mensagem automática | nenhuma | rascunho não chega ao paciente | texto padrão do sistema entregue | `fase6-regressao-aceite.test.ts` §1 |
| 1.2 | Publicação válida | template publicado | mensagem automática | template publicado | vale no próximo turno | texto publicado entregue | §1 |
| 1.3 | Histórico | v1 → v2 | — | arquivamento | versão anterior preservada e fora de uso | v1 arquivada, v2 em uso | §1 |
| 2.1 | Template com variável inventada | publicado inválido | mensagem automática | recusa + padrão | recusado, com motivo | motivo "variável não permitida"; padrão assumiu | §2 |
| 2.2 | Chave desconhecida / texto vazio | publicado inválido | — | recusa | recusado | recusado nos dois casos | §2 |
| 2.3 | Falha de leitura no banco | — | mensagem automática | origem real registrada | atendimento não cai; motivo real aparece | motivo "leitura falhou"; texto padrão entregue | §2 |
| 2.4 | Duas instâncias (cache frio) | v1 → v2 | — | releitura no início do turno | convergem para a mesma publicação | ambas em v2 no turno seguinte | §2 |
| 3.1 | Marcador original e um segundo marcador | escopo de homologação | modelo | — | tratados do mesmo jeito | regra chega ao envio e é reconhecida nos dois | §3 |
| 3.2 | Par cruzado | — | modelo | — | resposta de um par não passa no outro | reprovado, como esperado | §3 |
| 3.3 | Fonte × aderência × entrega | — | modelo | — | registros separados | campos distintos; escopo da prova explícito | §3 |
| 4.1 | Sessão nova / em andamento | comportamento publicado | modelo | — | apresenta-se só na sessão nova | confirmado | §4 |
| 4.2 | Exceção autorizada de homologação | exceção publicada | modelo | supressão da apresentação | apresentação suprimida | confirmado, com registro da supressão | §4 |
| 4.3 | Mensagens agrupadas | lote do turno | modelo | agrupamento lógico | um turno só, na ordem, sem colar textos | confirmado; janela de 1 s com teto de 2,5 s | §4 |
| 5.1 | Faixas de confiança A/B/C/D | política padrão | — | — | classificação estável por pontuação | alta/média/baixa conforme os limites | §5 |
| 5.2 | Pedido de atendente | — | transferência | handoff | transfere sem depender de confiança | transferido | §5 |
| 5.3 | Erro de ferramenta em ação crítica | — | — | bloqueio | ação nunca executa | bloqueada/transferida | §5 |
| 5.4 | Coleta de dados incompleta | — | mensagem automática | pergunta | resolve perguntando, sem transferir | pergunta mantida | §5 |
| 5.5 | Tentativas esgotadas | 2 tentativas | transferência | handoff | passa para atendente | transferido | §5 |
| 5.6 | Encerramento | template de despedida | mensagem automática | — | texto e origem próprios | confirmado | §5 |
| 6.1 | Confirmação de agendamento sem prova | — | mensagem automática | substituição | não afirma agendamento | trocada por aviso de instabilidade + restrição registrada | §6 |
| 6.2 | Confirmação com prova de gravação | — | mensagem automática | — | confirma normalmente | confirmada, com evidência | §6 |
| 6.3 | Revisão concorrente | revisão 4 vs 5 | — | descarte | resposta obsoleta não sai | descartada como SUPERSEDED | §6 |
| 6.4 | Reprocessamento do mesmo turno | mesma chave | — | reaproveitamento | não finaliza duas vezes | reaproveitada, hash idêntico | §6 |
| 6.5 | Ação registrada em duplicidade | — | — | acusação | apontada como repetida | apontada | §6 |
| 7.1 | Prévia | — | — | — | não é apresentada como execução real | rotulada "Prévia com contexto de exemplo", separada de "Usada nesta resposta" | §7 |
| 7.2 | Isolamento entre clínicas | publicação da clínica A | — | — | não vaza para outra clínica | clínica B não recebeu o texto | §7 |
| 7.3 | Global × clínica | global + clínica | — | sobrescrita | clínica sobrescreve sem alterar o global | confirmado | §7 |
| 8.1 | Paridade WhatsApp × Homologação | mesmo template | mensagem automática | mesma finalização | texto e hash idênticos | idênticos | §8 |
| 8.2 | Modo técnico de teste | — | — | — | explícito e nunca ativo em produção | inativo em produção e sem autorização | §8 |
| 8.3 | Resumo do atendimento completo | registro do turno | modelo | finalização | intervenções visíveis; sem registro, "sem evidência" | confirmado | §8 |

## 3. Arquivos alterados nesta fase

- `src/lib/nina/homologacao/fase6-regressao-aceite.test.ts` (novo) — suíte de
  aceite com os 32 cenários acima.
- `src/lib/nina/arquitetura/manifesto.ts` — ligações corrigidas: geração do
  modelo → finalização → validação; templates passaram a ter antecessor.
- `src/lib/nina/arquitetura/versoes.ts` — versão 5 registrada no histórico, com
  a foto da versão 4 preservada.
- `src/lib/nina/arquitetura/sync.ts` — marca de versão sincronizada na 5.
- `src/lib/nina/arquitetura/layout-incremental.ts` — componente novo passa a
  ficar ao lado de quem se relaciona com ele; componentes que já tinham lugar
  não são mais arrastados sem necessidade.

Nenhum arquivo de atendimento, agenda, financeiro, permissões ou integração foi
alterado.

## 4. Migrações e sequência de publicação

- Migração da Fase 5, já aplicada: tabela `nina_mensagens_templates` (textos
  versionados das mensagens automáticas, com leitura restrita por clínica).
- **A Fase 6 não trouxe migração nova.**
- Sequência: aplicar a migração da Fase 5 (feito) → publicar a aplicação. As
  duas ordens são seguras: sem publicação de template, o sistema usa os textos
  padrão do código, que são exatamente os textos anteriores.
- Compatibilidade: publicações de comportamento anteriores continuam valendo;
  nenhuma conversa, protocolo ou registro histórico foi alterado.

## 5. Reversão (preservando dados)

1. Voltar a aplicação para o commit anterior. Os textos das mensagens
   automáticas voltam a ser os padrões do código, iguais aos de antes.
2. Não é preciso apagar a tabela `nina_mensagens_templates`: sem a aplicação
   nova ela simplesmente não é lida. Reversão sem perda de dados.
3. Nenhuma correção desta fase apaga, reescreve ou reprocessa dado existente.

## 6. Limitações — o que NÃO foi verificado

Estes pontos continuam **pendentes** e não podem ser tratados como aprovados:

1. **Aderência do modelo real (LLM).** Os marcadores foram exercitados com
   dados simulados. A prova exige rodar a verificação de fonte com o modelo
   ligado, pela tela de Homologação. Mock não comprova aderência.
2. **WhatsApp real.** Nenhuma mensagem foi enviada pela Meta; a paridade entre
   canais foi provada pelo texto e pelo hash da finalização, não por entrega.
3. **Regras de acesso do banco (RLS).** Aqui o acesso foi simulado; a política
   está na migração e precisa de conferência com dois usuários reais de
   clínicas diferentes.
4. **Concorrência real entre instâncias.** Convergência de versão e trava foram
   provadas por simulação; falta observação com tráfego simultâneo.
5. **Validação visual autenticada** das telas de Arquitetura, Instruções e
   Homologação após as correções de mapa desta fase.

Enquanto os itens 1 a 5 não forem verificados, a Fase 6 está **concluída na
implementação e na regressão automatizada**, e **pendente na integração com
modelo e canal reais**.
