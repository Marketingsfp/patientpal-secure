# Trocar GPT 5.6 Sol por Claude Opus 5.5

## O que muda
Hoje o GPT 5.6 Sol é usado em 6 recursos internos (nenhum conversa com paciente):

1. Avaliação Sol (nota das execuções de homologação)
2. Analista de métricas da Nina (com consultas somente leitura)
3. Análise de erro da Nina
4. Criar/editar catálogo com IA
5. Planejador de teste de carga
6. Executor de correção assistida

Todos passam a usar `anthropic/claude-opus-5-5`. A conversa da Nina com pacientes (Gemini 3.8), o simulador de paciente (Terra) e a geração de carga (Luna) **não mudam**.

## Por que não é só trocar o nome
O Opus 5.5 usa outro formato de chamada no Gateway. Cada um dos 6 recursos precisa ter a chamada reescrita:
- mudar o endereço e o formato do pedido;
- mudar como o formato fixo de resposta (JSON) é pedido;
- no Analista, adaptar as ferramentas de consulta: o Opus 5.5 só aceita que ele mesmo escolha usar a ferramenta, então é preciso tratar o caso em que ele responde sem consultar;
- ler a resposta em partes no novo formato e tratar recusa/negativa como fim do pedido.

## Riscos e pontos de atenção
- **LGPD / retenção de dados:** o Opus 5.5 **guarda dados no fornecedor** (diferente do GPT, que é sem retenção). O espaço de trabalho de vocês permite, mas Análise de erro, Analista e Executor recebem trechos de conversas e podem conter dados de pacientes. Possível regra de negócio — validar com a equipe da clínica.
- **Custo e velocidade:** o Opus 5.5 costuma ser mais caro e mais lento que o Sol.
- **Rótulos:** telas e registros que mostram "GPT Sol" passam a mostrar "Claude Opus 5.5". O registro de papéis de modelo (que bloqueia modelo errado) será atualizado junto.
- Histórico antigo continua mostrando "gpt-5.6-sol" nas execuções passadas (não será alterado).

## Fora do escopo
Modelo da Nina, voz, transcrição, Terra, Luna, banco de dados e dados históricos.

## Validação
- Testes automáticos dos 6 recursos e checagem de código.
- Uma chamada real simples por recurso (sem gravar nada em produção), conferindo resposta, JSON e, no Analista, uma ida e volta de ferramenta.
- Nada publicado sem sua autorização.

## Detalhes técnicos
- Criar um helper servidor único `claude-messages.server.ts` (POST `/v1/messages`, `stream: true`, `output_config.format` para JSON, `output_config.effort` explícito, leitura SSE até `message_stop`, `stop_reason: "refusal"` e 403 terminais).
- Arquivos: `avaliador-sol*`, `analista-metricas*`, `analise-erro*`, `catalogo-ia*`, `carga-planejamento*`, `correcao-executor*`, `papeis-modelos.ts` e os testes correspondentes.
