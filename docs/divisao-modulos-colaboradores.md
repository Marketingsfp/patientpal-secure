# Divisão do ClinicaOS em 3 frentes de trabalho

> Proposta para 3 colaboradores trabalharem em paralelo sem mexer no código um do outro.
> Base: `main` no commit `ac6bc6cc` (10/10/2026). Levantamento feito direto no código (pastas, rotas, imports entre arquivos, migrations e histórico git dos últimos 60 dias).
> **O OS ZAP está fora da divisão** (ver seção 2).
> O dono de cada arquivo está no anexo `docs/divisao-modulos-arquivos.csv`.

---

## 1. Resumo

| Frente | Escopo de negócio | Arquivos | Linhas | Responsável |
|---|---|---:|---:|---|
| **Frente 1 — Atendimento Clínico** | Da marcação ao consultório: agenda, escala médica, check-in, recepção/filas, totem e painel de senhas, prontuário, especialidades clínicas | 205 | ~72 mil | ________ |
| **Frente 2 — Financeiro** | Do caixa ao faturamento: caixa, financeiro, NFS-e, boletos, PIX, orçamentos, tabela de valores, repasses, relatórios, painel executivo | 225 | ~88 mil | ________ |
| **Frente 3 — Clientes, Cartão e Gestão** | Cadastro de pacientes, cartão benefícios/terapêutico, contratos e convênios, cadastros da clínica, RH, treinamento, marketing/CRM, administração | 233 | ~85 mil | ________ |
| Núcleo compartilhado | Base usada por todos: UI, design system, shell/menu, autenticação, permissões, Supabase, utilitários | 232 | ~56 mil | todos (com regra, seção 6) |
| OS ZAP | Fora da divisão | 1.314 | ~271 mil | — |

A Frente 1 tem menos linhas, mas concentra o arquivo mais complexo e mais alterado do sistema (`app.agenda.tsx`, 183 commits em 60 dias), então o esforço fica equilibrado.

**Critério da divisão:** cada frente é um fluxo de negócio completo (tela → regra → banco). Assim uma pessoa entrega uma funcionalidade inteira sem precisar abrir arquivo de outra frente. Os imports entre frentes são poucos (~170) perto dos imports das frentes para o núcleo (~2.300), o que confirma que as fronteiras estão em lugares naturais.

---

## 2. Fora da divisão: OS ZAP

Ninguém das 3 frentes altera estes itens:

- **Telas:** `/app/nina` (Dashboard, Conversas WhatsApp, Mensagens prontas, Central de conversas, Departamentos, Voz/Laboratório/Homologação da Nina, Configurações do WhatsApp, Templates), `/app/nina-*`, `/app/francisco`, `/app/painel-tv-atendimento`, `/app/configuracoes/respostas-rapidas`, rotas `dev.*` do OS ZAP.
- **Código:** `src/components/nina/`, `src/components/atendimento/`, `src/components/francisco/`, `src/lib/nina/`, `src/lib/atendimento/`, `src/lib/francisco/`, `src/lib/webmcp/`, `src/lib/mcp/`, `permissoes-oszap*`, `src/routes/api/nina*`, `api/public/nina*`, `api/public/whatsapp.$clinicaId`, `api/public/hooks/francisco`.
- **Banco:** 91 tabelas `nina_*`, `atend_*`, `whatsapp_*`, `francisco_*`.

**Premissa — Coach WhatsApp:** o Coach é um subsistema separado no menu e não importa nenhum código da Nina/Atendimento. Por isso ficou na Frente 3. Se a equipe considerar o Coach parte do OS ZAP, ele sai da Frente 3 (~11 mil linhas).

**Arquivos que o OS ZAP divide com as frentes** (menu, permissões, autenticação, TTS) seguem a regra do núcleo (seção 6).

---

## 3. Frente 1 — Atendimento Clínico

**Telas do menu:** Dashboard (Início), Agenda, Escala e Horários, Atendimento Múltiplo, Check-in, Fluxo do paciente, Recepção/Filas, Triagem - Enfermagem, Documentos do paciente, Anamneses, Hiperdia, Apoio Clínico, Meus Pacientes — Atendimento, Prontuários — Histórico, Enfermeira IA — Alertas, Informações rápidas, Odontograma & Prontuário, Fisioterapia (mapa corporal e pacotes), Resultados de Exames, Horários médicos, Modelos de Prontuário, Configurações › Numeração de Prontuário, Painel & Totem, Voz & Áudio.

**Telas públicas:** totem (`/totem*`), painel de senhas (`/painel*`), autoatendimento, check-in por link (`/checkin/$token`), portal do médico (`/medico`), intake de consultas e o hook de confirmação de consultas.

**Pastas:**
- `src/components/`: `agenda/`, `agenda-v2/`, `recepcao/`, `painel/`, `totem/`, `face/`, `prontuario/`, `odontologia/`, `fisioterapia/`, `hiperdia/`, `medico/`, `sessoes/`, `fluxo/`
- `src/lib/`: `agenda/`, `agenda-v2/`, `painel/`, `prontuario/`, `sessoes/`, `triagem/`, `hiperdia/`, `medico/`, `fluxo/`, `qz/`, `atendimento-multiplo/`, além de `prontuario.ts`, `fisio*.ts`, `odonto*.ts`, `biometria.ts`, `face-recognition.ts`, `consulta-ia.functions.ts`, `exames-ia.functions.ts`, `lumen-tv.functions.ts`, `print-senha.ts`, `print-a4-medico.ts`, `print-comprovante-agendamento.ts`
- `src/hooks/`: `use-agenda-v2-flag`, `use-ficha-presence`, `use-historico-anterior`, `use-dashboard-blocos`, `use-medico-context`, `use-medicos-permitidos`, `use-especialidade-odonto`, `use-atendimento-multiplo-disabled`

**Tabelas (dono):** `agendamentos` e `agendamento_*`, `medico_agendas`, `medico_agenda_procedimentos`, `medico_disponibilidades`, `medico_expediente_encerramento`, `medico_biometria`, `senhas`, `prontuarios`, `prontuario_modelos`, `prontuario_sequencia`, `anamnese_*`, `documentos_emitidos`, `exame_resultados`, `odonto_*`, `fisio_*`, `hiperdia_registros`, `triagens_enfermagem`, `enfermagem_recurso*`, `alertas_enfermagem`, `paciente_biometria`, `lumen_tv_*`, `intake_rate_limit`, `busca_ativa_contatos`.

**Atenção:** agenda clássica e Agenda V2 coexistem por feature flag. Não remover a clássica enquanto a V2 não for promovida.

---

## 4. Frente 2 — Financeiro

**Telas do menu:** Caixa, Financeiro (as 21 telas `/app/financeiro/*`: movimento, atendimentos, contas, categorias, empresas, BI, analítico, projeção, pendências, estorno, lembretes, notas, regras IA, relatórios...), NFS-e e Configuração NFS-e, Boletos, Orçamentos (inclusive orçamentos da agenda e de odonto), Tabela de valores, Relatórios, Painel Executivo.

**Telas públicas:** `paciente.financeiro` (portal do paciente) e webhook da Focus NFe.

**Pastas:**
- `src/components/`: `caixa/`, `caixa-v2/`, `financeiro/`, `nfse/`, `orcamentos/`, `orcamentos-v2/`, `tabela-valores/`, `relatorios/`, `painel-executivo/`, `EstornosBell.tsx`
- `src/lib/`: `financeiro/`, `caixa/`, `orcamentos/`, `pix/`, `relatorios/`, `tabela-valores/`, `dashboard/`, além de `nfse*.ts`, `boleto.functions.ts`, `estornar-lancamento.ts`, `repasse-*.ts`, `orcamento-*.ts`, `pagamento-status.ts`, `print-caixa-comprovante.ts`, `print-recibo-lancamento.ts`, `print-gr.ts`, `print-orcamento.ts`, `print-relatorio-financeiro.ts`, `print-tabela-precos.ts`, `print-pedido-compra.ts`
- `src/hooks/`: `use-caixa-v2-flag`, `use-orcamentos-v2-flag`

**Tabelas (dono):** `fin_*`, `caixa_sessoes`, `caixa_movimentos`, `nfse`, `nfse_agendamentos`, `nfse_emitentes`, `boletos`, `orcamentos`, `orcamento_itens`, `estorno_solicitacoes`, `regras_rateio`, `medico_repasse_laudo`, `gr_impressoes`, `pagamentos`, `pagamento_splits`, `prestadores`.

**Atenção:** Caixa V2 e Orçamentos V2 coexistem com os clássicos por feature flag.

---

## 5. Frente 3 — Clientes, Cartão e Gestão

**Telas do menu:** Clientes (lista, ficha, recentes, Duplicados/Merge), Cartão Benefícios (9 telas), Cartão Terapêutico (7 telas), Contratos de assinatura, Planos, Revisão de convênio, Médicos/Equipe, Equipe e acessos, Perfis, Serviços/Especialidades, Procedimentos, Tipos de serviço, Unidades, Setores, Cargos, Estoque, Modelos de Documentos, Recursos Humanos (ponto, funcionários, férias, holerites), Treinamentos e Cursos (LMS), Coach WhatsApp, Marketing (leads, campanhas, envios, landing pages, segmentos), CRM, LGPD, Segurança & Compliance (auditoria), Integrações, Clínicas, Backups, Chat interno.

**Telas públicas:** portal do paciente (`paciente.*`, exceto financeiro), assinatura de contrato por link (`/p/contrato/$token`, `/p/$token`), landing pages (`/lp/$slug`), verificação de certificado (`/verificar/$codigo`), cadastro (`/signup`) e o hook de backup diário.

**Pastas:**
- `src/components/`: `clientes/`, `clientes-v2/`, `pacientes/`, `paciente/`, `cartao/`, `cartao-beneficios/`, `contratos/`, `pages/` (contratos e planos), `medicos/`, `funcionarios/`, `coach/`
- `src/lib/`: `cartao/`, `convenio/`, `contract-templates/`, `coach/`, `equipe/`, `paciente/`, `procedimento/`, `estoque/`, além de `cb-regras.ts`, `contrato-dependentes.ts`, `importar-*.ts`, `equipe.functions.ts`, `backups.functions.ts`, `lms-certificate.ts`, `print-carne.ts`, `print-cartao.ts`, `print-contrato.ts`, `paciente-distancia.ts`, `perguntar-vinculo-dependente.ts`, `busca-servico.ts`, `nome-servico.ts`
- `src/hooks/`: `use-clientes-v2-flag`, `use-catalogo-atualizado`

**Tabelas (dono):** `pacientes` e `paciente_*` (exceto biometria), `cb_*`, `cartoes_convenio`, `credito_clinica_revisoes`, `procedimento_cb_convenio_valores`, `contratos_assinatura`, `contrato_*`, `planos_assinatura`, `sistema_planos`, `medicos`, `medico_procedimentos`, `medico_especialidades`, `medico_convenios`, `especialidades`, `especialidade_unidade`, `procedimentos`, `procedimento_*`, `tipos_servico`, `tipo_servico_unidade`, `unidades`, `setores`, `cargos`, `estoque_*`, `modelos_documentos`, `hr_*`, `lms_*`, `coach_*`, `mkt_*`, `campanhas_marketing`, `crm_*`, `lgpd_*`, `chat_*`, `backup_execucoes`, `catalogo_global_editores`.

**Atenção:** Clientes V2 coexiste com o clássico por feature flag.

---

## 6. Núcleo compartilhado (todos usam, ninguém é dono sozinho)

- **UI e visual:** `src/components/ui/`, `src/design-system/`, `src/styles.css`, `components/list-shell/`, `simple-crud/`, `charts/`, `theme/`, `icons/`, `acessibilidade/`
- **Shell e navegação:** `components/app-shell.tsx` (menu), `app-sidebar-layout.tsx`, `portal-launcher.tsx`, `sidebar-user-menu.tsx`, `universal-search-bar.tsx`, `src/lib/subsystem.ts`, `menu-*.ts`
- **Acesso e segurança:** `hooks/use-auth`, `use-permissoes`, `use-clinica`, `use-alcadas`, `use-admin-plataforma`, `lib/permissoes-rotas.ts`, `permissoes-presets.ts`, `permissoes.server.ts`, `permissoes-pessoa.ts`, `autorizacao-supervisor*`, `lib/seguranca/`
- **Infra:** `src/integrations/supabase/` (inclui `types.ts`, gerado), `src/server.ts`, `start.ts`, `router.tsx`, `routeTree.gen.ts` (gerado), `routes/__root.tsx`, `routes/_authenticated.tsx`, login/reset/privacy, API de integrações (`api/*/integrations/v1`), TTS (`tts-service`, `use-tts`, `api/public/tts*`)
- **Utilitários:** `utils.ts`, `traduzir-erro.ts`, `date-utils.ts`, `cpf.ts`, `validators.ts`, `confirm.tsx`, `notify.ts`, `export-csv.ts`, `exportar-xlsx/docx.ts`, `print-html.ts`, `print-doc-a4.ts`, `patient-search-input.tsx`, `paciente-nome.tsx`
- **Projeto:** `package.json`, lockfiles, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `wrangler.jsonc`, `.github/workflows/ci.yml`

**Regra do núcleo:**
1. Pode **usar** à vontade. Para **alterar**, faça um PR pequeno só com essa mudança e avise os outros dois antes do merge.
2. Mudança que muda comportamento existente (assinatura de função, prop de componente, regra de permissão) precisa do OK de pelo menos mais uma pessoa.
3. Sugestão: um "guardião do núcleo" por semana, em rodízio, que revisa esses PRs.

---

## 7. Banco de dados (Supabase)

**Regras de migration:**
1. Cada frente só cria migrations para as **suas** tabelas (listas nas seções 3 a 5).
2. **Nunca** editar uma migration já existente. Correção é sempre uma migration nova.
3. Uma migration por PR, com nome descritivo e o prefixo da frente no nome (ex.: `..._f2_fin_alerta_vencimento.sql`).
4. Toda tabela nova segue o padrão multi-clínica: `clinica_id` + RLS com `is_member` / `has_role` / `can_manage_clinica`.
5. Aplicar migration em produção continua exigindo autorização explícita (regra do `CLAUDE.md`).

**Tabelas compartilhadas** — exigem aviso prévio aos outros dois antes de qualquer `ALTER`, policy, trigger ou função que as altere:

| Tabela | Dono | Migrations que já a alteraram |
|---|---|---:|
| `agendamentos` | Frente 1 | 99 |
| `pacientes` | Frente 3 | 84 |
| `fin_lancamentos` | Frente 2 | 82 |
| `medicos` | Frente 3 | 49 |
| `procedimentos` | Frente 3 | 33 |
| `audit_log` | Núcleo | 31 |
| `clinica_feature_flags` | Núcleo | 20 |
| `clinicas`, `clinica_memberships`, `profiles` | Núcleo | 18+ |
| `perfis_acesso`, `perfil_permissoes`, `permissions`, `role_permissions`, `user_roles`, `usuario_permissoes`, `usuario_alcadas` | Núcleo | — |

**Tabelas de importação/legado** (`_mj_*`, `_pasta_*`, `_stg_*`, `_tmp_*`, `_pac_stage_import`, `*_backup_*`): não mexer sem combinar.

---

## 8. Onde as frentes se encontram (interfaces)

Pontos em que uma frente usa código de outra. Quem usa **não edita** o arquivo do outro: pede a mudança ao dono.

| Interface | Dono | Usado por |
|---|---|---|
| Busca e cadastro rápido de paciente (`patient-search-input`, `pacientes/quick-patient-dialog`, `paciente/alerta-critico`) | Núcleo / F3 | F1, F2 |
| Regras de convênio do cartão (`lib/convenio/*`, `cb-regras.ts`) | F3 | F1 (agenda), F2 (caixa) |
| Orçamento vinculado ao agendamento (`agendamento_orcamento_itens` ↔ `orcamentos`) | F1 / F2 | F1 e F2 |
| Status de pagamento do agendamento (`pagamento-status.ts`, caixa lendo `agendamentos`) | F2 | F1 |
| Prontuário (`lib/prontuario.ts`) | F1 | F3 (ficha do cliente) |
| Formatação de moeda (`lib/financeiro/format.ts`) | F2 | F1, F3 |
| Código do OS ZAP usado pelas frentes (16 imports, principalmente na Frente 1) | OS ZAP | F1, F2, F3 — só consumir, nunca alterar |

Quando uma tarefa exigir mexer nos dois lados, o dono de cada lado faz a sua parte e os PRs são mergeados juntos.

---

## 9. Regras de trabalho (Git e Lovable)

1. **Nada direto na `main`.** Cada tarefa em uma branch com o prefixo da frente: `f1/...`, `f2/...`, `f3/...`, `nucleo/...`. Merge na `main` só por Pull Request.
2. **CI verde antes do merge.** O PR roda Lint, Typecheck e Testes (`.github/workflows/ci.yml`). Localmente: `npm run lint`, `npm run typecheck`, `npm run test`.
3. **PR pequeno e de uma frente só.** Se o PR tocar arquivo de outra frente ou do núcleo, marque o dono para revisar.
4. **Arquivos gerados nunca se resolvem à mão.** Em conflito no `src/routeTree.gen.ts` ou `src/integrations/supabase/types.ts`, aceite qualquer lado e regere (o `vite dev`/`build` regera as rotas; os tipos são regerados a partir do banco).
5. **Menu e permissões são os maiores pontos de conflito.** Nos últimos 60 dias, `app-shell.tsx` mudou 120 vezes e `permissoes-rotas.ts` / `permissoes-presets.ts` 46 vezes. Cada frente só edita o bloco do seu grupo de menu e das suas rotas, sem reordenar o resto.
6. **Lovable é o maior risco de interferência.** Nos últimos 60 dias, 5.113 commits na `main` vieram do bot do Lovable, que grava direto na `main` e não sabe de fronteiras. Combinem:
   - todo prompt ao Lovable diz qual frente está sendo alterada e lista as pastas que **não** podem ser tocadas (a skill `/preparar-prompt-lovable` monta isso);
   - antes de usar o Lovable, faça `git pull`; depois, confira o diff do que ele alterou;
   - de preferência, só uma pessoa usa o Lovable por vez.
7. **Feature flags por clínica continuam valendo.** Melhorias entram atrás de flag (`clinica_feature_flags`), e o módulo clássico só sai quando a V2 for promovida.
8. **Comunicação.** Antes de mexer em tabela compartilhada ou no núcleo, avise no canal do time. No fim do dia, cada um faz push da sua branch.

---

## 10. Próximos passos sugeridos

1. Definir o responsável de cada frente (coluna "Responsável" da seção 1).
2. Confirmar a premissa do Coach WhatsApp (Frente 3 ou OS ZAP).
3. Proteger a `main` no GitHub (exigir PR e CI verde) e criar um `.github/CODEOWNERS` com os usuários GitHub de cada frente, usando os caminhos deste documento.
4. **Fase 0, opcional, feita pelo guardião do núcleo:** separar o menu do `app-shell.tsx` e as listas de `permissoes-rotas.ts` em um arquivo por frente. Isso elimina a maior fonte de conflito. É uma mudança no núcleo e precisa de plano e aprovação antes.

---

### Anexo — dono de cada arquivo

`docs/divisao-modulos-arquivos.csv`: lista arquivo por arquivo de `src/` (2.209 arquivos), com a frente dona e o número de linhas. Use-o para tirar dúvida de quem é dono de um arquivo específico.
