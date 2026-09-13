# Reset da homologação só pelo botão "Resolver / Reiniciar teste"

Tipo do pedido: regra de negócio (comportamento do ambiente de homologação), sem alteração do motor de confiança, do prompt publicado nem do comportamento de produção.

## 1. Diagnóstico — quem reinicia a sessão hoje

Reiniciar = encerrar o ciclo, apagar a memória ativa da Nina (`nina_fluxo_estado`, identidade, prazos), somar +1 na sessão e trocar o telefone virtual, deixando o lead sem conversa.

| # | Onde | Função | Gatilho atual |
|---|------|--------|----------------|
| 1 | `src/lib/nina/teste-console.server.ts:759` | `resetarLeadTeste` | Botão manual (rotina canônica). Correto. |
| 2 | `src/lib/nina/handoff-ciclo.server.ts:30` | `encerrarCicloTestePorHandoff`, chamada de `src/lib/atendimento/handoff.server.ts:355` | **Automático**: qualquer encaminhamento para humano numa conversa `is_teste` — inclusive quando a própria Nina chama a ferramenta de atendente e no timeout de espera. É a origem do "Memória da Nina foi resetada" relatado. |
| 3 | `src/lib/nina/cenarios.functions.ts:331-370` | `iniciarItemExecucao` | **Automático**: ao iniciar cada item de cenário. |
| 4 | `src/lib/nina/cenarios.functions.ts:699-740` | encerramento do item | **Automático**: ao concluir cada item de cenário. |
| 5 | `src/lib/nina/carga-preflight.server.ts:22` | `prepararLeadsCarga` | **Automático**: preparação do teste de carga. |
| 6 | `src/lib/nina/correcao-ferramentas.server.ts:241` | `testarEmHomologacao` | **Automático**: reteste da correção assistida. |

Não há reset ao abrir a tela, selecionar lead ou recarregar a página (`HomologacaoInbox.tsx` só relê histórico e estado). O modo Terra não reseta: em transferência/erro ele apenas encerra a simulação.

"Conversa resolvida durante o processamento." (`teste-console.server.ts:550`) não é um reset: é a resposta sendo descartada porque o lead trocou de conversa/ciclo enquanto a Nina pensava — ou seja, é consequência do reset automático nº 2 disparando no meio de um turno.

Rotinas compartilhadas com produção: `registrarEvento`/`registrarMarcadorSistema`, `incrementarRevisaoConversa`, `encaminharParaHumano`, `gerarRespostaNina`, `finalizarResposta`. O timeout de espera (`espera-timeout.server.ts`) roda em lote e não filtra `is_teste`, então também alcança conversas de teste pelo caminho nº 2.

## 2. Alterações propostas

Princípio: encerrar ciclo/memória/sessão passa a ser exclusividade do botão. Os demais caminhos continuam registrando o desfecho (transferência, cenário concluído, falha), mas **sem** apagar memória nem avançar sessão.

1. **Handoff (nº 2)** — em `handoff.server.ts`, deixar de chamar `encerrarCicloTestePorHandoff`. A conversa de teste continua marcada como transferida, com marcador e evento de fila; a memória e o telefone virtual permanecem até o operador clicar no botão. `encerrarCicloTestePorHandoff` deixa de ter chamador automático.
2. **Cenários (nº 3 e nº 4)** — trocar o reset embutido por uma chamada à rotina canônica `resetarLeadTeste`, **condicionada** a uma opção explícita do cenário (padrão: não reiniciar). Sem a opção, o item só grava resultado e encerra o ciclo lógico do cenário, sem zerar memória.
3. **Carga (nº 5)** e **correção assistida (nº 6)** — mantidos, por serem preparo explícito de execução automatizada, mas passando `origem` própria e ficando declarados na tela. Se você preferir, também podem exigir reset manual prévio.
4. **Aviso na tela** — quando houver transferência simulada, o painel mostra que a sessão continua aberta e que o reinício depende do botão (o texto de ajuda já existe em `HomologacaoInbox.tsx:734`).
5. **Testes** — teste novo garantindo que um encaminhamento simulado não cria sessão nova (`sessao_seq` e `telefone_sessao` inalterados, `conversa_id` preservado) e que o botão continua resetando. Rodar tipos e a suíte da Nina.

## 3. Fora do escopo

Motor de confiança, prompt publicado, fila, Tool Broker, catálogo, telas do OS ZAP e qualquer comportamento de conversa real de produção. Nada aqui muda produção: todos os pontos alterados já são exclusivos de `is_teste`.

## 4. Riscos

- Conversa de teste transferida permanece "aberta" com a Nina silenciada até o reset manual — é exatamente o comportamento pedido, mas muda a rotina de quem testa em sequência.
- O timeout de espera continuará transferindo conversas de teste; ele só deixará de reiniciá-las.
