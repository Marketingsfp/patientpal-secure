# Organização conservadora da Base de Conhecimentos

Pedido autorizado: padronizar SPF como SFP e aplicar melhorias de organização sem decidir ambiguidades que dependem da equipe da clínica.

## Antes e depois

- Antes: descrições longas separadas por barras, preços/horários repetidos, marcador SPF incompatível com a regra SFP, modalidade em texto livre e ausência de campos para siglas e complementos por atendimento.
- Depois: descrições em linhas, leitura dos blocos publicados mantendo profissional, atendimento, preços e critérios juntos; siglas por cadastro; classificação de item/grupo; encaminhamento humano explícito; estados de preparo/convênios; complementos confirmados por atendimento. As cópias de pagamentos só são omitidas do texto de resposta quando os valores e condições são comprovadamente idênticos.
- A fonte dos preços continua a existente. Complementos não criam outra tabela de preços. Grupos não propagam preços ou regras automaticamente. As equivalências não alteram a separação entre consultas e exames.
- O formulário mantém a edição habitual e coloca a organização em uma seção recolhível. A nota interna continua fora da leitura da Nina.

## Preservação e decisões pendentes

Não foram alterados preços, horários, critérios, vínculos da agenda ou condições comerciais. Continuam pendentes de confirmação: significado de “40 kg”, diferenças de limites de chegada, alcance da cobrança de anestesia, referência de atendimento quinzenal e modalidade exata dos cadastros que dizem apenas “Agendado” ou “Ordem de chegada”.

Os complementos são vinculados pela identificação completa do atendimento e profissional. Se a identificação mudar, o complemento anterior permanece guardado e não é aplicado a outro atendimento. Regras de modalidades diferentes, incompletas ou conflitantes não viram uma modalidade geral na agenda. Ausência de preparo/convênio permanece desconhecida.

Os 37 profissionais sem vínculo explícito não foram associados por aproximação. A resolução já existente por nome inequívoco e o campo de vínculo continuam disponíveis. Não houve inferência de identidade, preenchimento de preparo ou escolha de horários em nome da equipe.

## Banco e implantação

Migration: `20260920170000_nina_catalogo_estrutura_editorial.sql`.

- Coluna pública JSONB `estrutura` adicionada às duas tabelas do catálogo, com restrição de objeto. Categorias iniciais derivam apenas da seção já existente.
- Triggers de auditoria reutilizam `fn_audit_trigger`; sem nova RPC, índice ou ampliação de RLS/permissões. Histórico anterior não é reescrito.
- Cadastros atuais são padronizados e organizados; arquivados permanecem históricos. O marcador de encaminhamento é preenchido somente quando o profissional já é SFP/SPF.
- Aplicação executada pelo editor SQL em 20/09/2026. Conferência da clínica analisada: 207 serviços + 41 profissionais; 22 serviços passaram de SPF a SFP; nenhuma ocorrência SPF restante nos serviços publicados.
- Comparação integral dos campos públicos antes/depois: nenhuma diferença inesperada. Auditoria: 207 serviços + 41 profissionais, nenhuma alteração de formas de pagamento ou datas de criação.
- Clientes antigos permanecem compatíveis. Os novos campos e a nova interpretação exigem publicação da versão do aplicativo; não foi acionada a publicação conjunta do projeto Lovable.

## Validação e reversão

O teste `scripts/test-nina-catalogo-estrutura.mjs` usa PostgreSQL em memória com PGlite, sem conexão com a clínica. Verifica execução da migration, preservação de valores, IDs, notas internas, datas, registros arquivados, ambiguidades, auditoria e idempotência.

Testes de aplicação cobrem associação adulto/infantil, preservação de critérios ambíguos, nomes genéricos/SFP, aliases publicados versus rascunhos, modalidade, dados ausentes, pagamentos repetidos e edição assistida. Os testes de UI usam dados simulados e não enviam mensagens nem criam agendamentos.

Reversão: a versão anterior do aplicativo aceita a coluna adicional. Para desfazer a organização dos textos, recuperar somente os campos editoriais dos registros de auditoria desta atualização e comparar o `updated_at` atual antes de gravar, preservando alterações posteriores. Não remover colunas, triggers ou registros de auditoria para reverter a apresentação.

Resultados: 1.625 testes de aplicação aprovados, 25 testes de integrações não configuradas ignorados, nenhuma falha; typecheck aprovado. Teste adicional de compatibilidade do estado de preparo aprovado. PostgreSQL descartável e preenchimento/salvamento dos campos novos no formulário simulado verificados.
