# Base de Conhecimentos da Nina (planilha TAP como fonte de verdade)

Escopo confirmado: disponível para **todas as clínicas** (cada clínica envia a sua planilha,
tudo escopado por `clinica_id`), com **busca híbrida** (estruturada + embeddings) desde já.

## O que já existe e será reaproveitado

- Autenticação e permissões: `requireSupabaseAuth`, `clinica_memberships`, `use-permissoes`.
- IA: gateway Lovable (`ai.gateway.lovable.dev`) já usado pela Nina — servirá também para embeddings.
- Ferramentas da Nina: `nina-ferramentas.server.ts` (interno) e `nina/paciente-tools.server.ts` (WhatsApp).
- Prompt e contexto: `nina-contexto.server.ts` (com cache de 60s) e `nina/aprendizado.server.ts`.
- UI: abas da tela `Nina` (`app.nina.tsx`) e menu lateral (`app-shell.tsx`).
- Storage: será criado um bucket privado `nina-kb` (os atuais não servem a este uso).

Nada do fluxo atual da Nina é removido: a Base entra como **fonte prioritária**, acima do
conhecimento geral do modelo, e a Agenda continua sendo a única fonte de vaga real.

## Banco (uma migration)

- `nina_kb_bases` — uma linha por versão: arquivo, storage_path, hash, versão, status
  (`ENVIANDO`/`PROCESSANDO`/`ATIVA`/`INATIVA`/`ERRO`), contadores, quem enviou, datas, relatório de validação.
- `nina_kb_registros` — linha normalizada: categoria, tipo, procedimento, médico, dia, horário,
  preço dinheiro/cartão, observação/preparo, **linha original preservada** (`bruto` jsonb),
  `linha_origem`, texto normalizado para busca (unaccent + trigram) e `embedding` (extensão `vector`).
- `nina_kb_consultas` — log de auditoria: pergunta, termos, registros encontrados, registro usado,
  base/versão, score e resposta.
- RLS por `clinica_id`: leitura para membros, escrita apenas admin/gestor; nada exposto a `anon`.

## Pipeline de ingestão (idempotente, ativação atômica)

`upload → validação → parse (xlsx/xls/csv) → herança de contexto entre linhas → normalização →
validações de integridade → gravação → índices → embeddings → teste de integridade → ativação`

- O parser trata a planilha como seções: célula vazia **herda** a especialidade/procedimento das
  linhas anteriores; valores, dias e horários são detectados por coluna e por formato.
- Enquanto a nova versão processa, a anterior continua **ATIVA**. Só ao final, numa transação,
  a nova vira ATIVA e a antiga INATIVA. Falha grave = nova versão fica em ERRO e nada muda.
- Reprocessar a mesma versão apaga e recria os registros daquela versão (sem duplicar).
- Cache em memória chaveado por `base_id + versao` — muda a versão, o cache antigo morre.

## Consulta da Nina

Nova ferramenta `consultar_base_conhecimento(termo, tipo_info, medico?, dia?)` registrada nas duas
frentes (interna e WhatsApp), com busca estruturada primeiro (nome + sinônimos/abreviações
seguras, sem inventar equivalência clínica) e semântica como complemento para preparos,
observações e perguntas livres. Regras adicionadas ao prompt:

- Preço, médico, dia, horário, preparo e regra administrativa **só** saem da Base.
- Nada encontrado com segurança → "Não encontrei essa informação na minha base no momento.
  Vou encaminhar sua dúvida para nossa equipe." + handoff humano existente.
- Resultado ambíguo → pergunta de esclarecimento, nunca escolha aleatória.
- Horário na planilha é escala administrativa, **não** vaga: vaga continua vindo da Agenda.

## Tela "Base de conhecimentos"

Nova aba em `Nina` (menu + `app.nina.tsx`), visível só com permissão de escrita no módulo:
planilha ativa (nome, status, versão, envio, último processamento, quantidade de registros,
quem enviou), botões Substituir / Reprocessar / Excluir (com confirmação), histórico de versões
e o bloco "Testar conhecimento" mostrando a resposta da Nina e a **fonte utilizada**
(especialidade, procedimento, médico, dia, horário, dinheiro, cartão, observação, linha de origem).

## Testes

Suíte em `src/lib/nina/__tests__/kb.test.ts` cobrindo parser (herança de contexto, múltiplos
médicos, preços não deslocados), normalização, sinônimos, ambiguidade, conflito, informação
inexistente, reprocesso idempotente, troca de versão (R$100 → R$130) e exclusão.

## Fora do escopo agora

Google Sheets (arquitetura fica preparada), alteração do fluxo de agenda e mudanças de layout
fora da aba nova.
