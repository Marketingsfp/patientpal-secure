# Horário oficial da Nina — 17/09/2026

## Antes e depois

- O contexto já trazia data/hora em São Paulo, mas a v25 publicada não orientava a saudação pelo período. Em Arquitetura foi publicada a **v26**, às 15:21, com o bloco de `src/lib/nina/prompt/regras-temporais.ts`, preservando o restante da v25.
- O contexto agora acrescenta instante UTC de referência, período, saudação, hoje/amanhã/depois de amanhã, semana atual/próxima e os próximos 14 dias. Cada novo turno recalcula os fatos; produção, homologação e prévia usam o mesmo helper.
- Os avisos do catálogo usavam a data UTC. Agora usam o dia civil da clínica, com o mesmo fuso da agenda: `America/Sao_Paulo`.
- Consultas de vagas por data restringem o dia civil no banco antes do limite de linhas; horários já passados continuam excluídos. Datas e horas dos slots continuam vindo da agenda real.
- O dia da semana da escala deixou de depender do fuso do processo. A exibição de meia-noite usa 00:00.

As regras de conversa permanecem no prompt publicado. O código fornece fatos temporais, sem inserir regras ocultas na versão publicada nem substituir automaticamente a resposta do modelo. O fallback de código recebeu o mesmo bloco para falhas de leitura da publicação.

## Verificação

140 testes passaram, em execuções separadas para isolar mocks de banco:

- 44: referência temporal, saudação e geração compartilhada entre produção/homologação.
- 10: recuperação do catálogo, incluindo início e fim da vigência à meia-noite em São Paulo.
- 86: executor da agenda e regressões de consentimento/horário escolhido, incluindo limites locais de dia e filtragem antes do limite.

`bun run typecheck` e `git diff --check` passaram.

O build local com Vite parou no plugin `@lovable.dev/mcp-js`: `routesDir "src/routes" must resolve under ...`. O plugin compara um caminho com barras normais e outro com barras do Windows. Não foi possível confirmar com segurança o build completo neste ambiente; a falha ocorre na resolução da configuração, antes da compilação da aplicação.

Os testes usam relógios, banco e modelo simulados; não criam agendamentos nem enviam mensagens a pacientes. Não constituem teste de aderência do modelo real ao novo prompt.

## Publicação

A v26 do prompt já está publicada no banco pelo fluxo normal da Arquitetura e preserva a versão anterior no histórico. Ela também funciona com os campos antigos `iso`, `hora`, `diaSemana` e `fuso`, enquanto o novo código ainda não foi implantado.

As alterações do servidor precisam ser enviadas ao GitHub/Lovable e publicadas para disponibilizar os campos adicionais e corrigir as consultas. Nenhuma migration foi criada ou aplicada nesta correção.
