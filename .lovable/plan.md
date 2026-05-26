## Objetivo

Expandir o conhecimento da Nina para que ela possa **ler qualquer dado do sistema** (médicos, horários, exames, preparos, procedimentos, convênios, agenda do dia, estoque, modelos, etc.), mantendo o acesso **somente leitura** e bloqueando respostas sobre **financeiro/caixa** e **dados de outros pacientes**.

## Escopo das alterações

Apenas dois arquivos no backend da Nina — sem mudanças de UI, schema ou RLS:

1. `src/lib/nina.functions.ts` — usado pela aba "Nina treinada" (chat interno do sistema).
2. `src/lib/whatsapp.server.ts` — usado pelas respostas automáticas via WhatsApp.

### 1. Ampliar o contexto enviado ao modelo

Hoje a Nina só recebe médicos + procedimentos. Vamos passar a carregar (via `supabaseAdmin` no webhook e via cliente autenticado no chat interno, sempre com `SELECT`):

- Médicos (nome, CRM, especialidade, telefone público).
- Disponibilidades / horários de atendimento.
- Procedimentos / exames com preço PIX, preço cartão, duração e **preparo**.
- Convênios e planos do Cartão Benefício (nome, faixas de preço, descrição de benefícios).
- Especialidades cadastradas.
- Resumo do dia da agenda **agregado e anonimizado** (ex.: "Dr. X tem 3 horários livres entre 14h e 18h hoje"), sem nomes/telefones de pacientes.
- Informações públicas da clínica (nome, endereço, telefones, horário de funcionamento).

Tudo isso permanece somente leitura: a Nina **não recebe nem ferramentas de escrita** nem chamadas de função que alterem dados.

### 2. Bloqueios de privacidade no system prompt

Reforçar regras explícitas no `systemPrompt` da Nina (chat interno e WhatsApp):

- **Proibido** revelar qualquer dado financeiro, de caixa, faturamento, repasses, contas a pagar/receber, boletos, mensalidades, comissões.
- **Proibido** falar sobre outros pacientes: nomes, telefones, CPF, prontuários, agendamentos individuais, histórico clínico, fotos, exames.
- Quando perguntada sobre "quem tem horário marcado", "quanto entrou no caixa", "qual o saldo", "o paciente X esteve aqui?", responder educadamente que essa informação é sigilosa e orientar a procurar o gestor responsável.
- Permitido: informações **públicas e agregadas** — médicos disponíveis, preços de tabela, preparos, horários da clínica, convênios aceitos, slots livres no dia (sem identificar pacientes).
- No WhatsApp, regra adicional: tratar o número que escreve como **paciente externo desconhecido** — nunca confirmar se uma pessoa é paciente da clínica nem revelar dados de cadastro.

### 3. Garantias técnicas de "somente leitura"

- Manter o uso do AI Gateway sem nenhuma `tool`/function-calling — modelo só gera texto.
- Nenhuma rota nova; nenhum `insert`/`update`/`delete` é adicionado.
- Continuar usando `requireSupabaseAuth` no `chatNina` (já valida membership) e `supabaseAdmin` apenas para leitura no webhook do WhatsApp.

## Fora de escopo

- Mudanças na UI da página `/app/nina`.
- Novas migrations, RLS, tabelas ou permissões.
- Ferramentas de ação (agendar, cancelar, cobrar) — Nina segue puramente informativa.

Posso seguir com a implementação?
