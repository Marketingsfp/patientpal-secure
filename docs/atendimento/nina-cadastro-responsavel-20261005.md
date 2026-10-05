# Cadastro da pessoa atendida e WhatsApp do responsável

Regra solicitada em 05/10/2026: na consulta da filha, usar nome completo e nascimento da filha com o WhatsApp do responsável que conversa com a Nina. Nina e Maria são o mesmo agente.

## Comportamento

O transporte registra o remetente no estado de cada turno. Após selecionar uma vaga real, o núcleo pede os dados da pessoa atendida que ainda faltarem e aproveita os já fornecidos. Consulta/criação de cadastro usa nome, nascimento e contato do remetente. Dados de outro paciente vinculado não completam automaticamente os dados da nova pessoa.

O resumo passa a incluir paciente, nascimento, WhatsApp e os dados do atendimento. O aceite corresponde a esse paciente e à vaga escolhida. Troca de paciente invalida o aceite anterior. Só após receber a confirmação do resumo entregue o fluxo revalida a vaga e grava a reserva; sucesso depende da gravação comprovada.

## Código, instruções e banco

- Núcleo compartilhado: gate de identificação, executor de cadastro, confirmação da escolha e registro do remetente. Produção e homologação seguem as mesmas regras.
- Instrução efetiva do turno: explica coleta, contato do responsável, conferência e aceite. Não reescreve o histórico de prompts publicados. Jev não autoriza cadastro nem reserva em substituição ao núcleo.
- Migration `20261005190000_nina_cadastro_dependente_whatsapp.sql`: substitui somente o corpo da RPC existente, mantendo assinatura e permissões. O telefone vem da conversa persistida. O vínculo anterior só é reutilizado se corresponder à pessoa e ao contato atuais. Homônimos ambíguos e divergência de contato continuam exigindo conferência humana.
- Não altera tabelas, colunas, prontuários, registros financeiros ou pacientes históricos. Pode criar o cadastro ausente e completar campos vazios pelas regras já existentes da RPC. Homologação continua segregada por `is_teste`/`is_mock_data` e sem WhatsApp ou transferência operacional.

## Validação e implantação

Testes com serviços/modelos simulados cobrem contato do responsável, troca de paciente, nascimento em mensagem separada, confirmação após cadastro, idempotência, bloqueio de aceite anterior e regressões de agenda. PostgreSQL descartável executa a migration real para validar criação, reutilização, preservação do responsável, ambiguidade e isolamento de clínica/ambiente. Nenhum paciente real é criado por esses testes.

É necessário implantar o backend e aplicar a migration para ativar integralmente o fluxo. Commit/push não confirmam implantação no Lovable nem paridade com o modelo real. Esta entrega não executou atendimento real.

Rollback: restaurar o código anterior e a definição da RPC de `20260924233000_nina_cadastro_identidade_tripla.sql`, sem apagar cadastros ou auditorias criados. O estado JSON novo é compatível com os campos opcionais anteriores. A reversão da RPC restaura também a limitação anterior para troca de paciente vinculado.
