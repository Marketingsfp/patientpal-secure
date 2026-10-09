# Sincronização manual da Base com Clínica OS

## Ampliação de 05/10/2026: sincronizar toda a base

Solicitação de JEAN: incluir todos os médicos (82 informados no Clínica OS, contra 66 na base), consultas, exames e informações administrativas do atendimento, adaptadas à estrutura existente. Confirmação explícita: médicos inativos ou ocultos também entram, como rascunho, sem oferta pela Nina.

O cabeçalho da Base de conhecimentos agora oferece **Sincronizar toda a base com Clínica OS** para administradores e gestores. O botão individual descrito abaixo continua disponível. A ampliação cria registros ausentes, além de atualizar os existentes; não depende do Jev.

1. Abrir a prévia: quantidades efetivamente lidas, novos registros, atualizações, rascunhos e conflitos, com diferenças antes/depois.
2. Conferir e confirmar. Novos médicos ativos/visíveis e exames/procedimentos ativos são publicados; rascunhos existentes continuam rascunhos. Inativos/ocultos ficam rascunhos. Consultas sem médico vinculado e consultas inativas são preservadas como registros de consulta em rascunho.
3. Conferir o resultado. Falha interrompe a execução e informa o que já foi gravado. Uma nova prévia permite retomar; não há transação global ou promessa de reversão automática.

### Adaptação e limites

- Todos os médicos são lidos, inclusive inativos e ocultos. Especialidades usam `medico_especialidades`, o mesmo cadastro de Editar médico. Horários habituais vigentes, modalidade e consultas vinculadas usam os campos existentes da base. Consultas sem preço permanecem sem preço confirmado.
- Exames/procedimentos incluem nomes, vínculos, executantes ativos/visíveis, horários vigentes, preços/pagamentos conforme conversor existente, preparo, observações, grupo e exigências explícitas de autorização/termo. Consultas preservam preparo, observações e exigências qualificadas pelo nome da consulta no texto público. Horários habituais não comprovam vagas: a consulta e a gravação da agenda continuam no Clínica OS.
- A aba da clínica mostra dados públicos de contato/endereço, unidades e convênios cadastrados, lendo a fonte compartilhada. O cadastro de um convênio não atesta cobertura de qualquer atendimento. Não copia pacientes, prontuários, dados pessoais privados ou bancários dos médicos.
- Correspondência por vínculo/ID; sem vínculo, somente nome normalizado exato e único. Homônimos, grupos, registros arquivados e revisões pendentes são sinalizados, sem sobrescrita. Exceção: se um médico publicado ficou inativo/oculto e tem revisão pendente, somente o status passa a rascunho; a revisão é preservada.
- Aliases e nota interna são preservados. Fatos públicos são recompostos da origem, com campos ausentes explícitos na prévia. Limites da estrutura existente são validados, sem truncamento; itens incompatíveis ficam para revisão.
- Todas as listas são paginadas, inclusive acima de mil registros. A origem é guardada no JSON existente; nenhuma migration. IDs estáveis impedem criações duplicadas no reenvio. Prévia assinada por item permite lotes de até 50, com releitura, controle de versão e revalidação de permissão. As escritas usam o cliente autenticado e as políticas/auditorias existentes.
- Não muda a fonte selecionada para a Nina, o prompt, o Jev, o transporte de WhatsApp ou a agenda. Nenhuma chamada adicional de IA na sincronização completa. Rascunhos não são consumidos pelo catálogo publicado.

Validação local: 52 testes em cinco arquivos cobrem adaptação, especialidades, cenário simulado de 66 para 82 médicos, exclusão de executantes inativos/ocultos, revisão preservada, repetição sem novas gravações, lotes, paginação, falha parcial, concorrência, mudança na origem e permissões. TypeScript e compilação local passaram. As quantidades reais e a implantação não foram comprovadas: o painel do Lovable apresentou prévia desatualizada/build malsucedido e depois deixou de responder à navegação automatizada. Nenhuma importação em produção foi realizada nesta etapa. Os números 82/66 dos testes são dados simulados baseados no relato, não uma auditoria da base real.

## Sincronização individual existente

Decisão de JEAN em 04/10/2026: usar o Jev para mapear e sincronizar apenas manualmente. Substitui a proposta anterior de atualização automática. Não cria agendamento, job, cron, migration ou ativação da base no atendimento.

## Como usar

Nas seções **Exames e procedimentos** e **Consultas e profissionais**, administradores e gestores encontram **Sincronizar com Clínica OS**.

1. Escolher um registro existente da base. Se ainda não existir, criar um rascunho pelo botão Novo.
2. Pedir **Sugerir vínculo com Jev**, ou escolher a origem manualmente. Um vínculo já salvo aparece selecionado para a próxima sincronização.
3. O Jev compara até 40 candidatos ordenados por nome/aliases; a tela informa quantos foram avaliados em relação ao total. Os demais cadastros continuam disponíveis na pesquisa manual. Nomes iguais não eliminam registros: IDs e contexto distinguem as opções.
4. A sugestão só aparece com confiança finita entre 0,8 e 1 e ID pertencente às opções. A confiança é um sinal do modelo, não prova de equivalência. Nenhuma escolha do Jev grava dados.
5. Clicar **Conferir antes de sincronizar**. Conferir nome, vínculo, valores, horários e campos que ficarão ausentes. Confirmar que é o mesmo atendimento e que os aliases mantidos continuam adequados.
6. Clicar **Confirmar e sincronizar este registro**. A alteração é manual e individual. Um registro publicado continua publicado; um rascunho continua rascunho. Nenhuma execução inicia automaticamente outra sincronização.

## Origem e preservação

- Reutiliza a conversão operacional já empregada pela Nina: médicos, especialidades, procedimentos, vínculos, agendas e horários habituais. A nova leitura editorial é fresca, sem cache, e não depende da flag que habilita o atendimento.
- No botão de **Consultas e profissionais**, a lista **Especialidades** vem de **Cadastros → Médicos → médico correspondente → Editar médico → Especialidade** (`medico_especialidades` com os nomes de `especialidades`). Copia todas as especialidades desse médico, pelo ID e no escopo da clínica, inclusive quando o campo legado `medicos.especialidade_id` está vazio ou desatualizado. Não infere essa lista pelos procedimentos. Lista vazia na origem aparece na prévia e limpa a lista do destino quando confirmada. Falha de leitura bloqueia a sincronização; mudança desde a prévia exige nova conferência. Correção de 05/10/2026 restrita à leitura editorial do botão, preservando a conversão dos demais campos e a fonte direta do atendimento.
- Mantém o recorte do conversor: cadastros ativos, médicos visíveis ao paciente, horários vigentes; procedimentos de consulta entram nas informações dos profissionais, com as regras de preço já existentes. Não transforma horários habituais em vagas disponíveis.
- Não é uma cópia de todas as colunas de todos os módulos. Somente os campos fornecidos pela fonte operacional são copiados. Requisitos sem campo correspondente (como pedido médico), restrições e outros fatos ausentes ficam **não informados**, com a mudança exibida na prévia; não são completados com texto antigo.
- Preços/pagamentos seguem a conversão operacional existente. Esta mudança não redefine regras de pagamento.
- Preserva aliases revisados e nota interna. Não preserva fatos públicos antigos que contradigam ou completem a origem. Os registros restantes não são apagados, arquivados ou alterados.
- Registros com alterações em revisão ou arquivados são bloqueados. Grupos são bloqueados porque o vínculo disponível é de um registro para um médico/procedimento; não se reduz uma categoria a um exame específico. Grupos exigem modelagem própria ou registros individuais.
- Valida os limites dos campos existentes sem truncar textos. Se uma origem não couber, informa o erro e não grava.

## Consistência e acesso

- Quatro endpoints autenticados validam membership ativo admin/gestor na clínica antes de ler a fonte e novamente após operações demoradas.
- A confirmação recebe somente IDs, versão e assinatura SHA-256 da prévia. O servidor relê a origem e recompõe os fatos; não aceita preços ou textos enviados pelo navegador como dados da sincronização.
- Alteração da fonte desde a prévia invalida a confirmação. `updated_at` protege o destino contra edição concorrente/reenvio; a escrita usa o mesmo filtro de clínica/ID/versão.
- Uma escrita atômica por registro, usando o cliente autenticado e as políticas RLS existentes. Mantém `criado_por` e `created_at`. Registros publicados atualizam `publicado_por` com o executor.
- A auditoria de antes/depois depende dos triggers editoriais existentes (`trg_audit_nina_cat_*`); não cria nem reescreve histórico. Sugestões não confirmadas do Jev são exibidas na sessão, sem registro novo na tabela de decisões do atendimento.
- Há uma janela entre a leitura da origem e a gravação editorial: sem transação entre as tabelas de origem, uma alteração nesse intervalo só será capturada na próxima sincronização manual. Não se declara consistência instantânea com o cadastro.

## Impactos e implantação

Financeiro: o botão de mapeamento faz uma chamada ao Jev, sem retries. Conferência e cópia não chamam IA. Operacional: elimina a redigitação por registro, exige clique a cada atualização. Experiência: prévia antes/depois mostra o resultado. Risco: vínculo humano incorreto ou informação desatualizada até nova sincronização. Reversão: reverter o código e recuperar campos editoriais pela auditoria, conferindo versão; não excluir histórico.

Sem alteração no leitor de atendimento: `catalogo-turno.server.ts` continua usando a fonte operacional nos ambientes real e de homologação. A ativação da base estruturada na Nina permanece uma etapa separada.

Testes locais cobrem cópia e ausência de fatos, preservação do dicionário, profissionais, grupos, rascunhos, schema, sugestão inválida, controle de acesso, prévia sem escrita, concorrência, alteração da origem e repetição. São testes com serviços simulados, não comprovação do Jev real ou da publicação. Validar o botão no ambiente implantado e a auditoria efetiva antes de declarar a integração operacional concluída.

Validação da correção de especialidades (05/10/2026): 32 testes passaram nos arquivos `sincronizacao-especialidades.test.ts`, `catalogo-sincronizacao.test.ts` e `fonte-operacional.test.ts`. O novo teste percorre leitura real do módulo, opções, prévia e aplicação com banco simulado; cobre múltiplas especialidades, campo legado vazio/desatualizado, isolamento por médico/clínica, lista vazia, paginação, mudança após prévia e falha de leitura. TypeScript e `git diff --check` passaram. A suíte operacional tinha uma expectativa antiga que confundia Cartão com Pix/cartão; somente essa asserção foi alinhada aos campos já separados pelo parser, sem mudança em preços ou pagamentos. A publicação no Lovable e o clique no botão implantado não foram confirmados nessa validação.
