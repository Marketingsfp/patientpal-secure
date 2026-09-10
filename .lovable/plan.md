# Terceiro portal: Atendimento / WhatsApp

Levantamento feito por varredura no repositório. Nenhum arquivo foi alterado.

## TAREFA 1 — Inventário

### A. Telas claramente de atendimento por mensagem (mover)
- `/app/nina` — tela única com abas por hash: `atend-inbox` (Conversas WhatsApp), `atend-macros` (mensagens prontas "/"), `base-conhecimento`, `homologacao`, `config` (credenciais/instância), `templates` (templates aprovados Meta).
- `/app/nina/$conversationId` — endereço legado; só redireciona para a Inbox.
- `/app/nina-aprendizado` — revisão de aprendizados.
- `/app/nina-metricas` — métricas de aprendizado.
- `/app/nina-arquitetura` — arquitetura/tracing da Nina.
- `/app/configuracoes/respostas-rapidas` — mensagens rápidas (mesmo módulo de permissão "nina").

### B. Configurações ligadas ao WhatsApp
- Credenciais/instância e templates Meta: já são abas de `/app/nina` (`config`, `templates`).
- Macros e base de conhecimento: abas de `/app/nina`.
- Homologação (leads de teste, ciclos, simuladores): aba de `/app/nina`.
- `/app/configuracoes/voz` — Voz & Áudio (TTS). Hoje é rota só de admin (`ADMIN_ONLY_ROUTES`). É usada pela Nina (áudio) e também pelo painel/totem.
- `/app/integration-secrets` — segredos de integração em geral (não só WhatsApp).

### C. Itens de menu envolvidos (`src/components/app-shell.tsx`)
- Seção "Inteligência" → grupo expansível **"Nina — WhatsApp"** com 9 filhos (inbox, macros, base, homologação, aprendizado, métricas, config, templates, arquitetura).
- Seção "Configurações" → "Mensagens rápidas" (`/app/configuracoes/respostas-rapidas`) e "Voz & Áudio (TTS)".
- Seção "Gestão" → "Integrações" (`/app/integration-secrets`).

### D. Backend (só nomes, para dimensionar alcance)
- Rotas de servidor: `src/routes/api/public/whatsapp.$clinicaId.ts` (webhook), `api/public/nina.espera-timeout.ts`, `api/nina-voz.ts`, `api/nina-fala.ts`, `api/public/tts.ts`, `api/public/tts-voices.ts`. Não há edge functions Supabase — a lógica está em server functions (`src/lib/whatsapp.server.ts`, `src/lib/nina/*`).
- Tabelas `atend_*`: conversas, conversa_eventos, leituras, macros, notas_internas, respostas_rapidas, resposta_usos/favoritos, transferencias, handoff_resumos, departamentos(+membros), agente_presenca, pausas_log, pause_reasons, routing_rules, horarios, bot_configs, kb, numeros_autorizados, protocolo_config, avaliacoes.
- Tabelas `nina_*`: instrucoes_versoes, prompt_snapshots, execucoes/execucao_evidencias, trace_eventos, confianca_decisoes/propostas, feedback*(erros, analises, decisoes, versoes, acoes), aprendizados, analista_*, calendario_* / faixas_horarias, cat_servicos / cat_profissionais, kb_consultas, teste_* (leads, ciclos, cenarios, execucoes, simulacoes, avaliacoes, carga).
- Tabelas `whatsapp_*`: configs, mensagens, webhook_logs.
- **Nada disso muda.** O portal é só navegação/menu.

### E. Casos duvidosos — recomendação
| Tela | O que faz | Recomendação |
|---|---|---|
| `/app/chat` — Chat interno | Conversa entre membros da equipe; não toca WhatsApp | **Ficar** em Clínica Médica |
| `/app/campanhas` e `/app/mkt-envios` | Disparos em massa (usam WhatsApp como canal), com público/segmento e agendamento | **Ficar** em Marketing; é ferramenta de marketing, com dono e permissão próprios (`campanhas`, `mkt-envios`). Opcional: atalho de leitura no novo portal |
| `/app/crm` | Funil/oportunidades de lead | **Ficar** (Inteligência/Marketing) |
| `/app/atendimento-multiplo` | Atendimento clínico presencial de vários pacientes; nome parecido, assunto diferente | **Ficar** em Operação |
| Telefonia | É perfil/presença de agente, não tela; já governa elegibilidade de handoff | **Não mexer**; aparece indiretamente na Central de Atenção dentro do novo portal |
| `/app/configuracoes/voz` | TTS usado pela Nina e pelo painel/totem | **Aparecer nos dois** portais (continua admin-only) |
| `/app/integration-secrets` | Segredos de várias integrações | **Ficar** em Gestão (Clínica Médica) |

## TAREFA 2 — Plano de implementação

### 1. Novo subsystem (`src/lib/subsystem.ts`)
- `SubsystemId` passa a incluir `"atendimento"`.
- Entrada: `atendimento` → label "Atendimento / WhatsApp", `home: "/app/nina"`, groups: `["Atendimento", "Nina", "Configurações"]`.
- `ROTAS_HOME_PORTAL` é derivado de `SUBSYSTEMS` automaticamente — nada a fazer lá, mas `/app/nina` passa a ser home de portal (é aceitável: se o perfil não tiver o módulo, o shell redireciona para a primeira rota visível).
- `getSubsystem()` precisa aceitar o novo valor no `localStorage` (hoje há uma comparação literal com dois ids).
- `PortalLauncher` ganha o terceiro cartão (ícone de mensagem, descrição e itens: Conversas, Central de Atenção, Mensagens prontas, Base de conhecimentos, Métricas). O grid `sm:grid-cols-2` vira `lg:grid-cols-3`.

### 2. Novos grupos de `navRows` (`app-shell.tsx`)
Como o filtro por portal é por **rótulo de seção**, a forma limpa é criar duas seções novas e mover os itens para elas:

- **"Atendimento"** (operação do dia): Conversas WhatsApp (`/app/nina#atend-inbox`), Mensagens prontas (`#atend-macros`), Mensagens rápidas (`/app/configuracoes/respostas-rapidas`).
- **"Nina"** (inteligência): Base de conhecimentos, Homologação, Revisão de Aprendizados, Métricas de Aprendizado, Arquitetura.
- **"Configurações"** (seção já existente, compartilhada): recebe Configuração (`#config`), Templates aprovados (Meta) (`#templates`) e mantém Voz & Áudio (TTS). Como essa seção também pertence ao portal Clínica Médica, os itens de WhatsApp nela precisam de um filtro por portal — mesmo mecanismo já usado hoje na seção "Gestão" para o portal de RH.

Alternativa mais simples (recomendada se quiser evitar filtro por item): criar **"Configurações do WhatsApp"** como terceira seção exclusiva do novo portal e não tocar na seção "Configurações" atual. Assumo esta alternativa como padrão.

Menu final do portal: Atendimento / Nina / Configurações do WhatsApp.

### 3. Permissões (`src/lib/permissoes-rotas.ts` e tela de Perfis)
- **Não criar módulo novo.** Todas as rotas já mapeiam para o módulo `nina` (`/app/nina`, `-aprendizado`, `-metricas`, `-arquitetura`, `respostas-rapidas`). Quem tem acesso hoje continua tendo, sem migração de dados.
- Nenhuma linha de `perfil_permissoes` precisa mudar; a tela de Perfis de Acesso segue igual.
- Os testes de `permissoes-rotas.test.ts` leem o trecho entre `const navRows` e `export function AppShell()`: os itens movidos continuam dentro dessa região, então as três travas seguem valendo. Rodar a suíte para confirmar.
- Se no futuro quiser separar "operar conversas" de "configurar a Nina", aí sim entra submódulo (`SUBMODULE_PARENT`) — fora deste escopo.

### 4. O item some do portal "Clínica Médica"?
Recomendação: **sim, sai do Clínica Médica** (menos ruído, e o objetivo do pedido é dedicar um portal). Exceções:
- "Voz & Áudio (TTS)" continua nos dois (serve painel/totem também).
- A troca de portal continua a um clique pelo cabeçalho, então ninguém fica sem caminho.
- O grupo "Nina — WhatsApp" da seção "Inteligência" deixa de existir lá.

### 5. Não quebrar links antigos
- Nenhuma rota é renomeada, criada ou removida — só muda em qual seção/portal o item aparece. Todos os endereços atuais continuam válidos, inclusive `/app/nina/<id>` (que já redireciona).
- Quem abrir `/app/nina` estando no portal Clínica Médica não pode cair em "Acesso negado": o shell deve reconhecer que a rota pertence a outro portal e trocar o portal automaticamente (ou, no mínimo, continuar renderizando a tela). Ponto que exige atenção — hoje o filtro é só de menu, mas a guarda de rota usa a matriz de permissão, que não muda; então o risco é baixo e o ajuste é trocar o portal ativo quando a rota atual pertence a outro.
- Busca universal e atalhos que apontam para `/app/nina#...` continuam funcionando.

### 6. Riscos e o que NÃO mexer
- **Não mexer**: webhook do WhatsApp, `whatsapp.server.ts`, burst/lock/serialização, Confidence Engine, handoff/protocolo, Realtime da Inbox, filtros da Inbox, envio otimista, Telefonia/presença, tabelas e RLS.
- Risco 1: item de menu sem entrada exata em `ROUTE_TO_MODULE` some para não-admin — mitigado porque nenhum endereço muda.
- Risco 2: usuário com portal antigo salvo no navegador; o valor desconhecido já cai em `null` (mostra tudo), sem tela branca.
- Risco 3: portal com home `/app/nina` para perfil sem o módulo — o shell já redireciona para a primeira rota visível; validar esse caso.
- Validação prevista: `bunx tsgo --noEmit`, suíte `permissoes-rotas`, suítes de Atendimento/Nina, build e conferência visual do hub e dos três menus.

### 7. Pendências para você decidir antes de implementar
1. Confirma o rótulo do portal: "Atendimento / WhatsApp"?
2. Confirma tirar o grupo "Nina — WhatsApp" do portal Clínica Médica (sai de lá de vez)?
3. Prefere a seção exclusiva "Configurações do WhatsApp" (mais simples) ou reaproveitar a seção "Configurações" com filtro por portal?
