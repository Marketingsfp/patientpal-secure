# Revisão de segurança — 15/10/2026 04:06 UTC (somente leitura, nada foi alterado)

Aprovar este relatório NÃO aplica nenhuma correção; cada item só será corrigido com pedido explícito.

## 1. O que mudou desde 14/10/2026 04:00 UTC

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Alta | `src/lib/equipe.functions.ts` (`assertManager` = `can_manage_clinica`) + perfis customizados | Gestor (e quem tem perfil customizado com base `gestor`) pode gravar `role = 'admin'` em qualquer vínculo da clínica, inclusive o próprio. A trava "base nunca é admin" dos customizados não impede: base `gestor` já basta para promover alguém a admin pela tela de equipe. O comportamento do gestor já existia; o perfil customizado cria um caminho novo e menos visível. | Só admin atribui `admin` (e, de preferência, `gestor`); impedir alterar o próprio vínculo; proibir base `gestor` em customizado ou exigir admin para criá-lo. Possível regra de negócio — validar com a equipe da clínica. |
| 2 | Média | `perfis_acesso` / `perfil_permissoes` (RLS) | Criar/editar perfis e a matriz exige `can_manage_clinica` (admin ou gestor). Um gestor pode marcar Edição em qualquer módulo para qualquer perfil, inclusive o seu e o novo `cartao-beneficios-precos`. Sem registro em `audit_log` confirmado para essas mudanças. | Restringir edição da matriz a admin ou auditar cada mudança. |
| 3 | Baixa | Trigger `tg_membership_perfil_customizado` | Correta: confere unidade, base e força `role = perfil_base`; EXECUTE fechado. Trocar só o `role` limpa o customizado (esperado). `tg_perfis_acesso_custom_imutavel` impede trocar chave/base/unidade. | Nada urgente. |
| 4 | Baixa | `has_module_access`, `pode_escrever_modulo`, `can_manage_medicos` | SECURITY DEFINER com `search_path`, só para usuário logado; leem a matriz do customizado. Recebem `_user_id` livre: um logado pode consultar permissões de outra pessoa (só devolve sim/não). | Opcional: ignorar `_user_id` diferente de `auth.uid()`. |
| 5 | Info | `cb_convenio_regras` | Gravação: admin/gestor ou `cartao-beneficios-precos` Edição; a chave nasce sem ninguém. Leitura: qualquer membro da clínica. Correto. | — |
| 6 | Baixa | `especialidade_unidade` + trigger `removida` | Leitura aberta a visitante (`true`) — é catálogo, sem dado pessoal. Gravação: admin/gestor ou editor do catálogo global membro da clínica. Trigger sem SECURITY DEFINER, ok. | Aceitável; confirmar que leitura pública é intencional. |
| 7 | Média | `nina_teste_simulacoes`, `nina_teste_avaliacoes` (RLS) | Qualquer membro ativo da clínica (inclusive recepção/caixa) pode ler, criar, editar e apagar simulações e avaliações direto pelo banco, embora a tela só libere admin/supervisor. Conversas de teste usam dados fictícios, mas avaliações e custos podem ser adulterados. | Leitura/gravação só para os mesmos perfis da tela, ou só servidor. |
| 8 | Média | `src/lib/nina/ambiente-testes.functions.ts` (chama o Claude) | Acesso conferido no servidor (admin/supervisor da clínica) antes de usar o caminho privilegiado — bom. Porém o perfil é lido de `clinica_memberships.role` (não de `has_module_access`), cada rodada abre 10 conversas com até 50 turnos e `max_custo_creditos: 0`; não há cota diária por usuário/clínica. Risco de custo alto por erro ou abuso. | Cota diária e trava de uma rodada simultânea por clínica. |
| 9 | Média | Ambiente de testes — `resetarLeadTeste` com `removerAgendamentos: true` | Ao iniciar rodada, devolve vagas marcadas pelas conversas de teste. Depende de o vínculo conversa→agendamento ser só de teste. | Confirmar que só agendamentos com origem de teste são devolvidos; teste controlado. |
| 10 | Info | Tela do site limitada à clínica ativa (`site-agendamento.functions.ts`) | Servidor continua exigindo admin da clínica pedida; tabelas `site_agendamento_*` com leitura por `clinicas_do_usuario()` e gravação só servidor. | — |
| 11 | Baixa | Vitrine do site / `horarios_disponiveis_publico` | Função não executável por visitante; rotas públicas a chamam pelo servidor. Retorno só tem horários e nomes de médicos. `site_agendamento_e_do_site` aberta, mas sem efeito (só compara texto). | — |
| 12 | Baixa | Controle de agendas (`handleCriar`) | As novas recusas 422 também valem para a API com chave — mudança de comportamento, não de segurança. | Confirmar com quem usa a API. |

## 2. Achados gerais que continuam abertos

| Sev. | Onde | Achado | Correção |
|---|---|---|---|
| Alta | `src/routes/api/nina-voz.ts` | Correção de login ainda não publicada. | Publicar com autorização. |
| Média | Coach / telefonia (`telefonia.functions.ts`) | Servidor exige só leitura do Coach; RLS exige gestão. | Alinhar critérios. |
| Média | `tel_transcricoes` | Fala de pacientes sem prazo de retenção. | Definir retenção. |
| Média | Banco | Funções SECURITY DEFINER ainda executáveis por visitante sem login. | Revogar EXECUTE das não públicas. |
| Média | Papéis | Duas fontes de papel (`clinica_memberships.role` x `user_roles`); o ambiente de testes usa mais uma leitura direta do `role`. | Unificar. |
| Média | Fotos de orçamento | Retenção indefinida se não buscadas. | Expirar. |
| Baixa | Diversos | Impressão sem escape, `postMessage` sem origem, CSV com fórmula, busca sem saneamento, `nina.espera-timeout` com `!==` e GET. | Escapar/sanitizar; comparação em tempo constante. |

## 3. Dependências

Sem mudança relevante desde ontem (só `bun.lock` do PR de cards). Seguem: crítica só de desenvolvimento (`proxy-addr`); altas em `seroval` (TanStack — afeta o app), `undici`, `ws`, `sharp`, `fast-uri`, `js-yaml`.

## 4. Não verificado

- Teste com usuário real logado em cada perfil (gestor promovendo a admin não foi executado — só lido no código).
- Corpo completo de `devolverVagasDaConversa`.
- Logs de produção. Segredos: nenhum valor novo em código.

## Próximo passo sugerido (se pedido)

Item 1 primeiro (pequeno, só no servidor de equipe), depois item 7 (RLS das tabelas de teste).
