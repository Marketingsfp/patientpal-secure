# Revisão de segurança — 08/10/2026 (somente leitura, nada foi alterado)

## Situação do banco hoje
- A migração do Francisco (20261008193000) **ainda não está aplicada**: tabelas e funções `francisco_*` não existem no banco. Os achados do Francisco valem para quando ela for aplicada.
- `sistema_job_tokens` (onde ficará o token do job do Francisco): proteção ligada, sem acesso para visitantes ou usuários logados. OK.

## Achados

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Alta | `src/routes/api/public/whatsapp.$clinicaId.ts` (~l.147) | Mensagem com assinatura da Meta inválida ou ausente é registrada e **segue para a Nina** (decisão antiga: "nunca descartar"). Quem souber o endereço pode injetar mensagens falsas em nome de qualquer telefone, gerar agendamentos/handoffs e consumir IA. Anterior a hoje. | Com `app_secret` configurado, recusar (401) ou apenas guardar sem processar. Antes, confirmar que as 3 clínicas têm o App Secret correto. |
| 2 | Média | mesmo arquivo, l.183 e l.365 (mudança de hoje) | Francisco só age com assinatura válida — correto. Mas, se o `app_secret` estiver vazio, a resposta "SAIR" do paciente **não é registrada** e ele pode continuar recebendo mensagens (descumprimento de pedido de descadastro/LGPD). | Garantir App Secret antes de ligar o modo real; mostrar alerta na tela do Francisco quando faltar. |
| 3 | Média | mesmo arquivo, l.365–380 | Se `processarRespostaFrancisco` falhar por qualquer motivo, lança erro de agrupamento — a mensagem do paciente fica aguardando e a Nina não responde. | Validar que existe reprocessamento e alerta para a equipe nesse caso. |
| 4 | Média | `20261008150000_perfil_financeiro_opera_como_gestao.sql` | Financeiro ganha **exclusão** em 15 tabelas de dinheiro (lançamentos, caixa, NFS-e, pagamentos, boletos) e controle total de `nfse_emitentes` (certificado/dados fiscais). Aprovado pelo dono, mas exclusão apaga rastro. | Confirmar que `audit_log` grava exclusões nessas tabelas; preferir cancelamento a exclusão física em `nfse` e `fin_lancamentos`. |
| 5 | Média | `is_financeiro_clinica` (banco) | Usa `clinica_memberships.role`, enquanto as demais regras usam `user_roles`/`has_any_role`. Os dois cadastros podem divergir: alguém tirado do Financeiro em um lugar continua com acesso pelo outro. | Unificar a fonte do papel ou conferir as duas na mesma regra. |
| 6 | Baixa | `20261008170000_financeiro_da_baixa_na_agenda.sql` | Financeiro pode alterar **qualquer campo** do agendamento (horário, médico, paciente), não só o status da baixa. | Restringir por gatilho ou função específica de baixa. |
| 7 | Baixa | `20261008180000_financeiro_ve_historico_financeiro.sql` | Financeiro lê o histórico de `agendamentos` no `audit_log`, que pode trazer nome/telefone/observações do paciente nos "antes/depois". | Aceitável se for intencional; senão, tirar `agendamentos` da lista. |
| 8 | Baixa | Francisco — `functions.ts` (homologação) | Guarda o texto do cenário e o resultado em `francisco_eventos`. Se alguém digitar dados reais de paciente, ficam salvos. Leitura já é restrita ao módulo. | Aviso na tela: "use só dados fictícios". |
| 9 | Baixa | `src/routes/api/public/hooks/francisco.ts` | Token comparado de forma segura (OK). Sem limite de chamadas; rodada pode ser disparada várias vezes. | Trava contra rodadas simultâneas (já há reserva por orçamento — risco baixo). |
| 10 | Info (OK) | migração Francisco | Pontos positivos: proteção ligada nas 4 tabelas, leitura exige módulo + vínculo ativo, nenhuma escrita liberada ao navegador, funções só para o servidor, publicação só por administrador, envio real desligado por padrão. | — |
| 11 | Alta (scanner) | tabela `permissions` | Qualquer usuário logado lê toda a tabela. Provável catálogo, mas o scanner marca como erro. | Confirmar que não há dado sensível; se for catálogo, registrar como intencional. |
| 12 | Baixa (scanner) | `tipos_servico`, `especialidades` | Leitura liberada a qualquer logado. Provavelmente catálogo. | Confirmar e marcar como intencional. |
| 13 | Alta | Dependências | 1 crítica (`proxy-addr` via `@lovable.dev/mcp-js`) e várias altas (`undici`, `sharp`, `ws`, `seroval`, `js-yaml`, `fast-uri`) — todas indiretas. Maioria afeta ferramentas de build; `seroval` e `undici` rodam no servidor. | Atualizar `@tanstack/react-start`/`react-router` e `@lovable.dev/mcp-js` para versões que tragam as correções, com testes. |

## Não coberto nesta revisão
- Varredura completa das ~250 tabelas e ~550 funções: foi usado o resultado do último scanner automático (de hoje, 17:20), que não inclui as migrações de hoje à tarde. Recomendo rodar o scanner de novo depois de aplicar o Francisco.
- Não há Edge Functions no projeto (tudo roda nas funções do servidor do app).

## Próximo passo sugerido (se aprovar)
Nada é alterado automaticamente. Ao aprovar, sugiro começar pelo item 1 (assinatura do webhook), depois 5 e 4, um de cada vez, cada um com seu próprio pedido.
