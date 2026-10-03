# Central de conversas do OS ZAP

## Antes e depois

A aba exigia um termo de pesquisa e levava a conversa escolhida para a Inbox.
Agora lista as conversas reais da clínica atual, abertas e encerradas, e abre
o chat compartilhado na própria aba. O menu passa a chamar-se Central de conversas.

A listagem começa com 50 registros e permite carregar as páginas seguintes,
sem o limite de 100 conversas da fila operacional. Há filtros Todas,
Ativas / abertas e Encerradas. A busca existente por identificação, nome,
telefone, protocolo ou texto de mensagem continua disponível; a busca mantém
seu limite de até 150 resultados e pede que o termo seja refinado ao atingi-lo.

No celular, a seleção abre o chat na mesma aba e o botão Voltar à lista
retorna aos resultados. No computador, lista e chat ficam lado a lado.

## Integração e acesso

- A autorização da pesquisa anterior é compartilhada com a nova listagem:
  vínculo à clínica e acesso de administração, gestão ou supervisão.
- A consulta sempre filtra a clínica atual e `is_teste=false`.
  Conversas de homologação continuam no seu ambiente específico.
- Abrir uma conversa usa `obterConversa`, com a verificação de acesso existente.
  Não altera atribuição, responsável ou situação apenas por selecionar o registro.
- O componente `AtendInbox` é reutilizado com a fila lateral omitida. Histórico,
  mídias, detalhes técnicos, reporte, encerramento e envio usam os mesmos
  caminhos e permissões da Inbox. Não existe uma segunda implementação da Nina.
- Requisições atrasadas da listagem não substituem o filtro/busca mais recente.
- A alteração não requer migrations nem modifica registros históricos.

## Validação e limites

- TypeScript: `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit`.
- Testes de paginação e isolamento: `bun test src/lib/atendimento/__tests__/central-conversas.test.ts src/lib/atendimento/__tests__/escopo-inbox.test.ts`.
- Interface: `node scripts/check-central-conversas.mjs` compila o componente
  real da Central com transporte e painel de chat simulados, sem acessar
  pacientes ou serviços. Verifica paginação, filtros, abertura sem navegação,
  sincronização de seleção, pesquisa, resposta atrasada, celular e falha de acesso.
  Gera a prévia `../oszap-design-preview/central.html` e capturas locais.

Essas verificações não comprovam a publicação no Lovable nem o funcionamento
de serviços reais. Após a publicação, validar com usuário autorizado:
abrir conversa ativa e encerrada, conferir histórico, mudar de seleção,
filtrar/pesquisar, verificar acesso negado e testar no celular.

Reversão: reverter o commit da interface e da listagem, sem alteração do banco.
