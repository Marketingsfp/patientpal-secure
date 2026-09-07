# Architecture Diff — Nina → Arquitetura (Fase 1 da reorganização)

Data: 07/09/2026 · Escopo: **todas as clínicas** (mapa técnico, sem regra de negócio)
Somente descrição da arquitetura. Nenhum comportamento da Nina, prompt, ferramenta,
agenda, permissão ou dado de atendimento foi alterado. Nada foi publicado.

## O que foi feito

- O manifesto (`src/lib/nina/arquitetura/manifesto.ts`) passou da versão 1 para a **versão 2**.
- Foi criado o **Architecture Sync** (`src/lib/nina/arquitetura/sync.ts`), que guarda a foto
  da versão anterior e calcula o diff estrutural contra a versão atual.
- O canvas continua lendo **exclusivamente** o manifesto; nenhuma informação de arquitetura
  passou a existir só no frontend.
- As posições visuais **não** foram alteradas (isso é a Fase 2).

## Números

| | Antes | Depois |
|---|---|---|
| Nodes | 38 | 51 |
| Conexões | 53 | 76 |
| Tamanho calculado do desenho | 4.836 × 1.020 px | 3.036 × 1.600 px |

Resumo do sync: **+13 adicionado(s), ~13 alterado(s), -0 removido(s), 25 inalterado(s).**

## Diff

### + Adicionados (existiam no backend, não tinham node)

```text
+ flow.state              estado do fluxo entre mensagens (fluxo-estado.server.ts)
+ instructions.greeting   saudação obrigatória por sessão (saudacao-sessao.ts)
+ instructions.phases     fases 1 a 6 do atendimento (atendimento-fase1.ts)
+ identity.gate           trava de identificação do paciente (identificacao-gate.server.ts)
+ patient.link            vínculo paciente ↔ conversa (vinculo-contato.server.ts)
+ offer.complete          oferta completa de horários (oferta-completa.ts)
+ tool.catalog.list       especialidades, médicos, procedimentos, dados da clínica
+ tool.doctor_schedule    verificar_horario e proxima_vaga
+ tool.my_appointments    meus_agendamentos
+ voice.inbound           canal de voz (api/nina-fala.ts)
+ voice.reasoning         nível de raciocínio do canal de voz (reasoning-router.ts)
+ wait.timeout_job        disparo público do tempo de espera
+ trace.record            rastro técnico por etapa (arquitetura/tracing.server.ts)
```

Com isso as 13 ferramentas reais do broker passam a estar representadas (antes eram 7 agrupadas).

### ~ Alterados (mudança arquitetural real, não troca de nome de arquivo)

```text
~ session.resolve            passa a alimentar estado do fluxo e saudação
~ context.load               recebe o estado do fluxo; alimenta fases e trava de identificação
~ prompt.compose             passa a receber saudação, fases e trava de identificação
~ llm.generate               novas ferramentas de origem; telemetria registrada dentro da chamada
~ tool.execute               passa a distribuir para as novas ferramentas
~ tool.catalog.lookup        também é alcançado através da base de conhecimento (caminho real)
~ tool.knowledge.lookup      passa a acionar o catálogo
~ tool.schedule.availability passa a alimentar a oferta completa
~ tool.patient.lookup        agora leva ao vínculo paciente ↔ conversa
~ wait.start                 espera passa pelo disparo público
~ wait.timeout               origem corrigida para o disparo público
~ metrics.record             registro acontece dentro da chamada do modelo, não só após o envio
~ evidence.record            passa a alimentar o rastro técnico
```

### - Removidos

Nenhum. Todos os 38 nodes anteriores continuam apontando para código existente.

### = Inalterados

25 nodes (entrada do webhook, log bruto, validação de assinatura, deduplicação, conversa,
reabertura, roteamento, catálogo/aprendizados no prompt, modelo, horário oficial, agendamento,
handoff, protocolo, validação e envio da resposta, encerramento, métricas por período,
tratamento de erro, entre outros).

## Critério de aceite

Backend = manifesto = nodes do canvas. Os 51 nodes apontam para arquivo e função que existem
(verificado pelos testes do módulo: 85 testes, 996 verificações, 0 falhas), todas as conexões
são recíprocas e não há node isolado.

## Fora do escopo desta fase

Reorganização das posições, faixas por categoria, agrupamentos e estilos de linha — Fase 2.
