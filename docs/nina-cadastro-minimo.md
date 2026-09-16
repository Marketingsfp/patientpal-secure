# Cadastro de pacientes pela Nina

Depois de definir procedimento/especialidade, profissional e vaga real e obter a confirmação do paciente, a Nina consulta o cadastro confirmado da conversa. Solicita somente nome, nascimento e telefone faltantes, usando as mesmas validações do cadastro do Clínica OS. Aproveita o telefone do WhatsApp. CPF, e-mail e endereço não são solicitados.

Um contato por telefone não confirma sozinho a identidade clínica. Quando a pessoa ainda não está identificada, nome e nascimento permitem procurar o cadastro; a correspondência por nome/nascimento também precisa do contato compatível. Homônimos, cadastro inativo e divergências pedem conferência humana. Não se escolhe o primeiro registro nem se cria outro cadastro para contornar a divergência.

Cadastros confirmados são reutilizados; somente telefone e nascimento vazios podem ser preenchidos. Não há alteração de prontuário, pasta, histórico, dados financeiros ou dados cadastrais já preenchidos. A criação e a vinculação ficam na mesma transação, com trava por conversa e identidade e registro em `audit_log`. A Agenda continua revalidando a vaga antes de reservar.

## Publicação

1. Aplicar `supabase/migrations/20260916190000_nina_cadastro_minimo.sql`. Ela adiciona apenas `nina_resolver_cadastro`, restrita ao `service_role`, usando as tabelas existentes `pacientes`, `atend_conversas` e `audit_log`. Não altera tabelas, índices, políticas RLS nem a RPC anterior da API de integração.
2. Publicar o código da Nina, compartilhado entre produção e homologação. A RPC precisa existir antes; sua ausência gera falha de identificação, sem criação alternativa desprotegida.
3. Na versão publicada das instruções em Arquitetura, alinhar a seção de cadastro ao fluxo acima. O código atualiza o texto padrão, não reescreve versões já publicadas no banco. Remover instruções antigas que exigem CPF ou mandam coletar dados antes de definir e confirmar a vaga. O gate novo usa `fluxo.cadastro.obrigatorios`, sem reutilizar o antigo template que listava CPF.
4. Validar em homologação: paciente existente, novo, dados incompletos, homônimos e vaga ocupada durante a coleta. Homologação usa paciente sintético com nascimento fictício e não chama a RPC de cadastro real.

Para reverter o comportamento, republicar o código anterior. A função nova pode permanecer sem uso; não remover nem alterar cadastros, vínculos, prontuários ou auditoria já produzidos.

## Validação local

- Testes Bun: `cadastro-paciente-gate.test.ts`, `cadastro-paciente-executor.test.ts` e os testes de fase 3, fase 6 e autorização.
- SQL: `node scripts/test-nina-cadastro-sql.mjs <caminho-do-pglite/dist/index.js>`. Executa PostgreSQL temporário em memória com tabelas mínimas, sem acesso ao banco real. Confere transação, reutilização, divergência, escopo, campos preservados e permissões. Não simula concorrência entre múltiplos processos do PostgreSQL de produção.
- O build completo no Windows tem a limitação já identificada no plugin Lovable; a checagem de tipos é independente.
