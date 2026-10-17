# Área do Paciente — anexos clínicos e pedidos de exame (sem publicar)

## Antes / fatos confirmados
- A decisão de quem libera e retira documentos já foi registrada: administrador, gestão, médico, enfermagem, recepção e supervisão, sempre na própria clínica.
- Os anexos da ficha estão em `paciente_arquivos`. Existem apenas os tipos **anexo** e **foto**; nenhum deles distingue arquivo clínico de administrativo. Na consulta realizada, a tabela estava vazia.
- `documentos_emitidos` também estava vazia: não há pedidos antigos nela para migrar neste momento. A impressão de solicitação de exames existente não grava um pedido próprio.
- A fase 2 continua parcialmente no banco, mas suas telas, funções de download e testes estão ausentes do código atual. O commit anterior `279405b5b` contém esse trabalho; será referência, não uma reversão do projeto.

## Depois — escopo proposto

### 1. Recuperar os pré-requisitos da fase 2
- Reintegrar apenas documentos, financeiro somente leitura, resumo inicial, liberação e downloads da fase 2, preservando alterações posteriores.
- Conferir a estrutura existente antes de qualquer mudança: não recriar tabelas nem reaplicar cegamente a migração antiga.
- Manter identidade própria do paciente, termo obrigatório, interruptor da clínica e dados derivados exclusivamente da sessão.
- Não alterar notas fiscais presas/pendentes, pagamentos, prontuários, contratos públicos, Dashboard ou Nina.

### 2. Anexos da ficha
- Manter os tipos atuais **anexo/foto** e acrescentar uma classificação separada de finalidade: **interno** ou **clínico**. Padrão interno; nenhum arquivo antigo será classificado automaticamente pelo nome, extensão ou descrição.
- Arquivos internos, administrativos e contratos não terão liberação manual nem automática; a regra será verificada no servidor e no banco, não apenas ocultada na tela.
- Adicionar `liberado_paciente_em` e `liberado_paciente_por`, inicialmente vazios.
- Na ficha, permitir à equipe classificar arquivos clínicos e usar **Liberar ao paciente / Retirar liberação**, com responsável, data e auditoria. Tornar um arquivo interno também retira sua liberação.
- Em Configurações → Área do Paciente, opções por tipo clínico (**anexo clínico** e **foto clínica**) para liberação automática ao concluir o envio, todas desligadas e independentes por clínica.
- No portal, listar somente arquivos clínicos liberados. Abrir por endereço temporário de até 5 minutos, preso à sessão, revalidando paciente, clínica, classificação e liberação a cada abertura.
- O endereço do armazenamento não será entregue diretamente ao navegador: assim, retirar a liberação invalida também links já gerados.
- Imagens/PDFs poderão abrir com segurança; arquivos capazes de executar conteúdo serão oferecidos apenas como download, sem execução no endereço do sistema.

### 3. Pedido de exame próprio
- Criar `pedidos_exame` com clínica, paciente, médico/profissional, vínculos opcionais ao agendamento/atendimento, data, itens solicitados, indicação/observação, situação **emitido/cancelado**, referência do PDF privado, campos de liberação, criador e datas.
- Cada item terá referência/código/nome do procedimento do catálogo quando disponível e texto livre; preservar os dados registrados na emissão mesmo se o catálogo mudar depois.
- Emitir, listar, imprimir/baixar PDF e cancelar na ficha do paciente e na tela do médico, reutilizando o padrão visual dos documentos médicos. Cancelamento preserva o histórico e impede acesso pelo portal.
- Adicionar opção de liberação automática **Pedido de exame**, desligada por padrão.
- No portal, aparecer como **Pedido de exame** somente quando emitido e liberado, com download de 5 minutos preso à sessão e auditoria.
- Antes da migração, conferir novamente pedidos em “outro documento”. Só copiar registros identificados de forma inequívoca; não inferir pelo texto livre, não apagar originais nem duplicar em reexecuções. Casos ambíguos serão apresentados para decisão.

## Segurança e detalhes técnicos
- Equipe: autenticação e papel ativo na clínica verificados no servidor; paciente, profissional e vínculos opcionais devem pertencer à mesma clínica. Permissões de leitura/emissão seguem os padrões clínicos existentes; liberação segue os seis papéis confirmados.
- Paciente: nunca aceitar `paciente_id` do navegador; usar clínica/paciente/sessão validados pelo núcleo do portal. Auditoria de listagem, visualização, solicitação de link, download, liberação, retirada e cancelamento, sem conteúdo clínico em logs técnicos.
- Tabelas afetadas: `paciente_arquivos`, nova `pedidos_exame`, `portal_paciente_config`, `portal_links`; compatibilidade com `documentos_emitidos` e `exame_resultados`. Armazenamento privado e regras de acesso de menor privilégio.
- Evolução aditiva com permissões explícitas, RLS por clínica e validações para impedir liberação de anexos internos e pedidos cancelados. Usar novas migrações, sem editar as já aplicadas.
- Apresentar o SQL completo, incluindo permissões, políticas e gatilhos, para confirmação antes de aplicar: **prévia e site publicado compartilham o banco; não publicar não isola mudanças no banco**.
- Avaliar e apresentar a restrição de execução das funções de gatilho da fase 2 junto ao SQL; não corrigir outros achados da revisão de segurança neste pedido.

## Impactos, riscos e reversão
- **Financeiro:** nenhuma cobrança, pagamento ou nota alterados; apenas recuperação de consultas financeiras já previstas na fase 2.
- **Operação:** pedidos passam a ter histórico próprio; classificação explícita evita liberar documento interno por engano.
- **Paciente:** acesso seguro aos próprios anexos clínicos e solicitações de exame.
- **Risco técnico:** integração da fase 2 ausente e banco compartilhado. Fazer mudanças pequenas, revisadas, sem sobrescrever trabalho recente.
- **Risco de regra de negócio:** “anexo/foto” não comprova finalidade clínica. Assumir interno até classificação explícita pela equipe; classificação proposta sujeita à aprovação deste plano.
- **Estimativa:** três etapas verificáveis: recuperar base; anexos; pedidos e testes. Não prometer duração antes da conferência do SQL e PDF.
- **Reversão:** desativar as novas opções e retirar sua exposição nas telas, preservando dados, PDFs, histórico e auditoria; nenhuma exclusão estrutural.

## Validação / pendências
- Testes concretos: paciente A não vê anexo/pedido de B nem de outra clínica; interno/não liberado/cancelado nunca aparece; expiração exatamente em 5 minutos; outra sessão não abre; retirada invalida imediatamente lista e link antigo; seis papéis autorizados e demais recusados; automático desligado; configuração não cruza clínicas.
- Validar emissão, PDF, liberação, portal, retirada e cancelamento de ponta a ponta na prévia, usando pacientes fictícios e o código de teste. Qualquer gravação no banco compartilhado será previamente explicada e aprovada; preservar auditoria e desfazer apenas dados de teste autorizados.
- Executar testes disponíveis, conferir erros da prévia e demonstrar como testar sem e-mail real.
- **Pendências para iniciar:** aprovação deste plano e, depois, confirmação do SQL completo. E-mail e revisão jurídica do termo continuam separados desta entrega. **Não publicar.**