# Architecture Diff — versão 4 (2026-09-08)

Fase 10 da reformulação da Homologação. Registro da sincronização entre o
backend real e o Architecture Manifest (`src/lib/nina/arquitetura/manifesto.ts`).

## O que entrou no mapa (componentes reais)

| Componente | Arquivo | Função |
| --- | --- | --- |
| Ciclo do lead de teste | `src/lib/nina/teste-console.server.ts` | `garantirCiclo` |
| Entrada da homologação | `src/lib/nina/teste-console.server.ts` | `processarMensagemTeste` |
| Paciente simulado (Terra) | `src/lib/nina/simulador-terra.functions.ts` | `proximaMensagemTerra` |
| Execução de cenários | `src/lib/nina/cenarios.functions.ts` | `iniciarItemExecucao` |
| Teste de carga (Luna) | `src/lib/nina/carga.functions.ts` | `executarLoteCarga` |
| Avaliação posterior (Sol) | `src/lib/nina/avaliador-sol.functions.ts` | `avaliarComSol` |
| Relatório da homologação | `src/lib/nina/relatorio-teste.functions.ts` | `detalheRelatorioTeste` |
| Envio para Revisão de Aprendizados | `src/lib/nina/revisao-teste.functions.ts` | `enviarAchadoParaRevisao` |
| Teste de regressão | `src/lib/nina/revisao-teste.functions.ts` | `criarTesteRegressaoDeAchado` |

## Ligações ajustadas

- `test.inbound → context.load`: a homologação usa o mesmo núcleo do
  atendimento real, sem passar pelo webhook da Meta.
- `message.outbound → test.evaluate.sol` e `trace.record → test.evaluate.sol`:
  o Sol lê a conversa e o rastro **depois** da resposta; ele não participa da
  geração.
- `test.regression → test.scenario.run`: um erro confirmado vira cenário
  reexecutável.

## Representação

- Sol aparece como etapa posterior, fora do caminho de geração.
- Carga (Luna) é mostrada agregada: execução → leads → mensagens, com detalhe
  sob demanda. Nenhum componente por mensagem é desenhado.

## Nada mudou no atendimento

Manifesto e visualização são descrição. Nenhuma regra, prompt, ferramenta ou
fluxo de atendimento foi alterado nesta fase.
