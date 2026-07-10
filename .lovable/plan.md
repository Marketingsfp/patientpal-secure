# Inventário de prompts de erro/correção — 08–09/07/2026

Levantei o histórico de chat e agrupei os prompts do usuário que (a) contêm "erro"/"errado", (b) pedem correção explícita, e/ou (c) trazem capturas de tela como evidência. Foco no lançamento em produção (08–09/07/2026). Cada item traz o índice da mensagem no histórico, hora, módulo, sintoma e se veio com imagem.

## 09/07/2026 — dia do lançamento (mais recente → mais antigo)

| # | Hora | Módulo | Sintoma reportado | Anexos |
|---|------|--------|-------------------|--------|
| #5396 | 23:29 | Financeiro › Atendimentos / Repasse / GR | GR mostra repasse do prestador R$ 10,40; no Financeiro Atendimentos aparece R$ 52,00. Valor correto é R$ 10,40. | 2 imagens |
| #5392 | 23:24 | Caixa › Estorno | Follow-up do erro #5386: respostas às perguntas sobre estorno da ficha 004 Glicemia que não aparece no Mov. Caixa. | — |
| #5386 | 23:10 | Caixa › Estorno | Tentativa de estorno não aparece no Mov. Caixa. | 1 imagem |
| #5380 | 22:53 | Cadastro › Especialidade "Mamografia" | Ao adicionar especialidade Mamografia, todos os serviços aparecem em vez de só os vinculados. | 1 imagem |
| #5370 | 22:40 | Médico › Repasse (Dra. Isis Serrano) | Serviço (ultrassonografia) está na aba Especialidade mas não aparece na aba Repasse. Pede varredura em todos os médicos com o mesmo padrão. | 1 imagem |
| #5346 | 21:59 | Agenda › Estorno + reagendamento | Após estornar/desmarcar, slot fica bloqueado para agendar novo paciente. | — |
| #5328 | 21:45 | Agenda › Novo agendamento em slot desmarcado | Erro ao tentar agendar em slot previamente desmarcado. | 1 imagem |
| #5282 | 20:30 | Agenda | Paciente HENRIK VESTENG estornado mas agenda não atualizou. | 1 imagem |
| #5252 | 19:28 | Financeiro › Baixa | Pedido visual: botão "Dá baixa" amarelo (pendente) / verde (baixado) na coluna Ações. | 1 imagem |
| #5242 | 18:44 | (contexto anterior) | "Mas tem vários erros, percebeu?" — comentário genérico. | — |
| #5204 | 17:50 | (não especificado no texto) | "Que erro é esse? Resolve por favor." | 1 imagem |
| #5178 | 16:53 | Financeiro › Atendimentos | Agenda criada 09/07/26 uma vez; em Atendimentos aparecem 2 registros com data 08/07/26. | 2 imagens |
| #5166 | 15:30 | GR (impressão) | Número da GR sai diferente do que está na agenda. | — |
| #5152 | 15:07 | Financeiro › Repasse (permissões) | Admin vê os campos de marcar/fazer repasse; atendente da tesouraria não vê. | 1 imagem |
| #5108 | 13:32 | Agenda › Revisão | Erro ao agendar revisão (não cobra e descrição é automática). | 1 imagem |
| #5094 | 12:44 | Agenda / Funcionários | (a) Pede botão "Cancelar" no agendamento; (b) cadastro de funcionário exige telefone mas não mostra campo. | 2 imagens |
| #5088 | 12:35 | (SRE / perf) | Solicitação do teste de carga de 1000 usuários. | — |
| #5062 | 11:41 | Orçamento › Laboratório | Buscando glicose no orçamento e não aparece nada. | 1 imagem |
| #5054 | 11:18 | Serviços / Orçamento | Vários exames chamados "glicose" no cadastro, só 1 aparece no orçamento. | 2 imagens |
| #5040 | 10:43 | GR / Auditoria | GR paciente saiu com nº 10; sistema mostra nº 11. Auditoria não registra. | 2 imagens |

## 08/07/2026 — véspera

| # | Hora | Módulo | Sintoma | Anexos |
|---|------|--------|---------|--------|
| #5000 | 20:24 | Serviços (valor variável) | Erro ao salvar serviço com valor variável. | 1 imagem |
| #4986 | 20:08 | (fluxo/senhas) | Numeração de pacientes mudou após atendimento anterior; deveria ser estável. | 2 imagens |
| #4948 | 18:42 | Funcionários / Médicos | Médico "Adriana" criado na Menino Jesus, mas cadastro fica "sem clínica". | 1 imagem |
| #4942 | 18:36 | Pagamento › Segunda via | Horário do pagamento na 2ª via está errado. | 1 imagem |
| #4900 | 17:18 | Médicos | Médico Raio-X criado na Menino Jesus mas perfil diz "sem clínica selecionada". Pede varredura. | 2 imagens |

## Padrões que saltam à vista

**Cluster A — Repasse/valores divergentes entre GR ↔ Financeiro Atendimentos** (#5396, #5370, #5178, #5166, #5040). Aparece 5x hoje. Suspeita: `procedimento_split_regras` / `regras_rateio` / `medico_procedimentos` não estão convergindo para a mesma fonte quando GR grava e Financeiro lê.

**Cluster B — Estorno/desmarcação não propaga** (#5346, #5328, #5282, #5386, #5392). 5x hoje. O estorno grava em `estorno_solicitacoes` e/ou `caixa_movimentos` mas não atualiza `agendamentos.paciente_nome → "disponivel"` nem `fin_atendimentos.status`.

**Cluster C — Filtros de serviço por especialidade** (#5380, #5370, #5062, #5054). 4x hoje. Serviço cadastrado numa especialidade não aparece nas telas que filtram por ela (Orçamento, Repasse).

**Cluster D — Cadastro de médico sem clínica** (#4948, #4900). Fluxo de criação de médico não está gravando `medicos.clinica_id` ou `medico_clinicas` conforme esperado.

**Cluster E — Permissão para atendente da tesouraria** (#5152). Um único caso, mas é o único sintoma "role não-admin não vê o que admin vê" que aparece — é o candidato natural para investigar RLS/perfis quando você me pedir a auditoria forense propriamente dita.

## Próximo passo sugerido

Se quiser, posso agora escolher **1 cluster** (recomendo o A — repasse divergente — porque envolve dinheiro e reincide) e:
1. Ler os anexos citados nesses prompts (as imagens já estão no histórico do chat)
2. Reproduzir com Playwright em produção
3. Rastrear as queries de GR ↔ Financeiro Atendimentos ↔ Repasse
4. Entregar o relatório forense (Crítico/Alto/Médio + causa raiz + correção atômica) que ficou pendente do turno anterior

Me diga qual cluster atacar primeiro — ou se prefere que eu simplesmente entregue essa lista como está e você triage.
