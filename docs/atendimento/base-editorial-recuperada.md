# Base de conhecimento recuperada e independente da Maria

## Referência e recuperação

Pedido de JEAN: recuperar a base antiga, sem vinculá-la à Maria. Referência temporal indicada: 27/09/2026.

- Main analisada: `6a6b49b01`.
- Componentes e serviços recuperados de `7f05d6c9164f0000b08bfe8215383b1d578f38e7` (última revisão anterior a 28/09). Os arquivos da tela não mudaram entre essa revisão e a exclusão em `2fda444cb`.
- Prévia conferida pelo navegador: `https://id-preview-bd2cfefd--9cab2db5-e9b1-4209-b352-fc7a438da482.lovable.app/app/nina#base-conhecimento`.
- Em 04/10/2026, a prévia mostrou 208 exames/procedimentos e 41 profissionais na Menino Jesus. A São Francisco apareceu sem itens. Isso comprova acesso aos registros nessa prévia, não a existência das mesmas tabelas no ambiente publicado atual.
- Um formulário exibiu nota de atualização em 29/09: o conteúdo consultado não deve ser descrito como snapshot imutável de 27/09.

## Comportamento recuperado

Menu Base de conhecimento, busca, cadastros de exames/procedimentos e profissionais, formulários estruturados, preços por pagamento, horários habituais, notas internas, rascunho/publicação/arquivamento e criação/edição com IA (incluindo lote e revisão humana).

As operações administrativas usam apenas `nina_cat_servicos` e `nina_cat_profissionais`, com as verificações originais de vínculo ativo, perfil admin/gestor para escrita e clínica em todos os registros. Os vínculos opcionais apenas leem os cadastros existentes; não os alteram. A restrição do menu e dos links diretos para telefonia continua valendo.

## Isolamento obrigatório

- Publicar aprova conteúdo somente nesta base. Não altera flag, prompt, ferramenta, confiança, fluxo, memória ou fonte da Maria.
- `fonte-operacional.server.ts`, os adaptadores real/homologação e as buscas da assistente de escrita/consulta dentro do chat não foram alterados.
- O horário de funcionamento oficial já é compartilhado com o atendimento. A subaba Informações da clínica reutiliza sua visualização com `podeEditar={false}`. Editá-lo de forma independente requer desenho próprio de armazenamento, não reativação dos salvamentos operacionais antigos.
- O topo da página e os diálogos de publicação explicam a desvinculação.

## Dados e banco

Nenhuma migration foi adicionada ou executada; nenhum registro real foi editado, apagado ou importado. A restauração reutiliza as tabelas editoriais caso existam no ambiente atual. Falta de tabela aparece como erro explícito, nunca como catálogo vazio ou convite para recriar dados às cegas.

A migration histórica `20261001100000_remove_base_conhecimento_nina.sql` previa cópia em `arquivo_base_conhecimento` antes de remover as tabelas públicas. A existência desse arquivo no banco atual ainda não foi confirmada. Se o ambiente atual já aplicou a exclusão, a recuperação dos dados exige inspeção autorizada do banco e aprovação de uma restauração aditiva. Não executar novamente as migrations antigas de conversão/normalização: elas podem reescrever conteúdo e metadados.

## Validação

- 60 testes externos de edição, autorização, concorrência, esquemas da IA, fonte operacional, permissões da telefonia e isolamento. O teste de handlers também executa 13 casos em subprocesso.
- Teste de isolamento executa os serviços reais com banco simulado: publica preço editorial 999, limpa cache e confirma que a fonte operacional permanece idêntica à anterior (preço oficial 100); nenhuma leitura do atendimento acessa as tabelas editoriais.
- TypeScript e build de produção sem erros.
- `scripts/preview-base-editorial.mjs` gera uma prévia local da tela real com dados fictícios. O navegador recusou a navegação `file:`; essa prévia não foi validada visualmente.
- Não houve chamada ao modelo real nem validação de escrita/publicação em banco real. A publicação no Lovable e a presença dos dados no ambiente atual precisam ser conferidas após sincronização.

## Reversão

Reverter apenas o commit de recuperação da interface e serviços. Não remover tabelas nem registros. Como a fonte operacional não mudou, não é necessário alterar o atendimento para desativar esta tela.
