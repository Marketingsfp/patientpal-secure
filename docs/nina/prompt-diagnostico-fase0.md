# FASE 0 — Diagnóstico das instruções atuais da Nina (somente leitura)

Data: 07/09/2026. Nenhum arquivo de comportamento foi alterado.

## 1. Fonte real do prompt atual

Existem **dois** prompts principais, não um:

| Canal | Arquivo | Função | Público |
|---|---|---|---|
| Painel interno (chat/voz da equipe) | `src/lib/nina-contexto.server.ts` | `systemPromptNina(contextoTexto, modoVoz)` (linha 215) | Colaborador autenticado |
| WhatsApp (pacientes) | `src/lib/whatsapp.server.ts` | `gerarRespostaNina` — variáveis `systemPrompt` (l. 917), `systemPromptFinal` (l. 1164), `systemPromptComHandoff` (l. 1252) | Paciente |

**Correção ao node “Montagem do prompt” da aba Arquitetura:** a referência
`src/lib/nina-contexto.server.ts` / `systemPromptNina` está correta **apenas para o
painel interno**. O prompt que atende pacientes no WhatsApp é montado em
`src/lib/whatsapp.server.ts`. O node hoje aponta para o arquivo errado em relação
ao fluxo que ele descreve (catálogo, fases, aprendizados). Ajuste sugerido na Fase 1.

## 2. Como o prompt do WhatsApp é construído

`systemPromptFinal` = concatenação (`.filter(Boolean).join("\n\n")`) de:

1. `systemPrompt` — texto hardcoded + identidade da unidade + contexto do remetente + médicos/procedimentos
2. `blocoPromptDisponibilidade()` — `nina/agenda-flag.server.ts`
3. `blocoKb` — `nina/catalogo-prompt.server.ts` (Base de Conhecimentos publicada)
4. `blocoFase2..blocoFase6` — `nina/atendimento-faseN(.server).ts`, cada um com flag por clínica
5. `blocoOferta` — `nina/oferta-completa.ts` (com flag)
6. `blocoPromptAgenda()` — só quando a clínica pode agendar
7. `blocoAprendizado` — `nina/aprendizado.server.ts` (aprendizados aprovados)
8. `blocoPromptEstado(fluxoEstado)` — `nina/fluxo-estado.server.ts`
9. `blocoPromptSessaoNina(sessaoNina)` — `nina/sessao.ts`
10. `+ ATENDIMENTO HUMANO — REGRA OBRIGATÓRIA` (handoff, l. 1254)

Dentro de `systemPrompt` ainda entram: `blocoClinica` (identidade), `blocoFase1`
(saudação, com flag), `blocoDataHoraAgora()` (`nina-agora.ts`), `contextoRemetente`
(cadastro/associado/base não importada), `blocoIdentidade` (l. 804) e `blocoFoco`
(l. 742–788, foco por especialidade/procedimento).

## 3. Conteúdo que PODE ser migrado para configuração pela interface

Comportamento, tom e estilo — sem valor de segurança:

- Abertura: “Você é a Nina… direta, cordial e acolhedora… 2 a 4 frases”
- Texto e formato da apresentação/saudação (hoje literal na l. 902)
- “SUA FUNÇÃO COM PACIENTES é EXCLUSIVAMENTE: …”
- Regras de estilo de especialidade/exame (máx. 5 profissionais, comparação sem acento)
- Regras de confirmação de identidade quanto ao **tom** (não abrir a resposta com a confirmação)
- Regra de ouro sobre pedido de dados (parte de tom; ver ressalva no item 4)
- Modo voz do painel interno (l. 247)
- Prompt do painel interno (`systemPromptNina`), blocos de identidade e contexto de uso

## 4. Conteúdo que NÃO deve ser editável

Devem permanecer no backend, aplicados independentemente do prompt:

- **Privacidade (regras 1–6, l. 953–959)**: não confirmar vínculo de paciente, não
  revelar financeiro interno, dados de pacientes, operação interna; sigilo → handoff.
- **Proibição de citar CRM** (l. 923).
- **Regra anti-falso-sucesso do agendamento** e obrigatoriedade de `appointment_id`
  (`blocoPromptAgenda`) — reforçada por código no gate de identificação.
- **Gate de identificação** (`identificacao-gate.server.ts`, l. 1218–1233): é código,
  não prompt; decide a ordem confirmar → identificar → gravar.
- **Handoff obrigatório** (l. 1254) e as ferramentas disponíveis por flag.
- **Isolamento por `clinica_id`** e permissões/RLS nas ferramentas.
- **Estado do fluxo, sessão e TTL**, catálogo publicado e aprendizados aprovados:
  são dados, não texto editável.

## 5. Separação pedida

- **PROMPT PRINCIPAL (configurável):** identidade/tom, apresentação, escopo de
  atendimento, estilo de resposta, formato de listagem, modo voz.
- **CONTEXTO DINÂMICO (nunca editável, sempre gerado):** dados da clínica, médicos,
  procedimentos, catálogo publicado, agenda, paciente/identificação, estado do fluxo,
  sessão, data/hora, aprendizados, retornos de tools.
- **REGRAS DE SEGURANÇA (fixas no backend):** privacidade, sigilo, CRM, gate de
  identificação, anti-falso-sucesso, handoff, isolamento por clínica.

## 6. Dependências

- `clinica_feature_flags` (padrão já usado para tudo que é por clínica)
- `nina/catalogo-prompt.server.ts`, `aprendizado.server.ts`, `sessao.ts`,
  `fluxo-estado.server.ts`, `agenda-flag.server.ts`, `modelo-flag.server.ts`
- `nina/context-builder.ts` (monta as mensagens finais)
- Consumidores do prompt interno: `src/lib/nina.functions.ts`, `src/routes/api/nina-fala.ts`
- Homologação: `src/lib/nina/teste-console.functions.ts`
- Aba Arquitetura: `manifesto.ts` (node `Montagem do prompt`) e `sync.ts`

## 7. Estratégia segura de migração (proposta para a Fase 1)

1. Criar tabela de **módulos de prompt por clínica** (não um único campo), com
   `clinica_id`, `chave` (identidade, tom, escopo, apresentação, estilo), conteúdo,
   status rascunho/publicado, versão imutável e autor — reaproveitando o modelo já
   usado no Horário de funcionamento.
2. Composição no backend: `SEGURANÇA (fixo) + MÓDULOS CONFIGURÁVEIS + CONTEXTO DINÂMICO`,
   com os blocos de segurança **sempre por último**, para não serem sobrescritos.
3. Flag por clínica (`nina_prompt_configuravel`): sem linha = texto atual hardcoded.
   Rollback imediato desligando a flag.
4. Validação de conteúdo no servidor: tamanho máximo, bloqueio de instruções que
   tentem anular regras de segurança, e pré-visualização em Homologação antes de publicar.
5. Só depois disso, atualizar o node da aba Arquitetura e o manifesto.

## 8. Riscos encontrados

- **Node do manifesto impreciso** (aponta o arquivo do painel interno para um fluxo de WhatsApp).
- Prompt do WhatsApp está **embutido numa função grande** (`gerarRespostaNina`), misturado
  com regra de negócio — extrair exige cuidado para não mudar a ordem dos blocos.
- Ordem dos blocos **importa** (agenda “substitui a regra 6”); um módulo editável fora de
  ordem pode enfraquecer uma regra.
- Risco de **prompt injection administrativo**: texto livre poderia tentar liberar dados
  sigilosos — mitigado mantendo segurança em código e no fim do prompt.
- Cache: o contexto interno tem TTL de 60s; um prompt configurável precisa de invalidação própria.
- Não foi validado em produção nem com conversa real — apenas leitura de código.
