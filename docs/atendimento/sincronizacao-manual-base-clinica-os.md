# Sincronização manual da base com apoio do Jev

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
