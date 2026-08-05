# Relatório de Qualidade — PatientPal / ClinicaOS

**Análise de interatividade, inconsistências, duplicidade, layout, sintaxe, segurança e regras de negócio**
Data: 09/07/2026 · Planilha completa: [relatorio-erros-ui-ux.xlsx](./relatorio-erros-ui-ux.xlsx)

## Resumo

| Categoria | Alta | Média | Baixa | Total |
|---|---|---|---|---|
| Interatividade | 2 | 4 | 1 | 7 |
| Duplicidade | 2 | 3 | 1 | 6 |
| Inconsistência | 1 | 3 | 2 | 6 |
| Layout | 3 | 4 | 1 | 8 |
| Sintaxe | 1 | 1 | 0 | 2 |
| Segurança | 2 | 2 | 1 | 5 |
| Regras de Negócio | 1 | 3 | 0 | 4 |
| **Total** | **12** | **20** | **6** | **38** |

**Status:** 5 corrigidos nesta análise · 33 pendentes

**Prioridade sugerida (severidade Alta):**
1. Segurança — permissão validada só no menu e segredos de API expostos no cliente
2. Regra de negócio — o `confirm()` de cancelamento de pacote cancela o agendamento de quem quer desistir
3. Interatividade — modais que não fecham com ESC e menu que recarrega a página
4. Duplicidade — módulos inteiros em versão dupla v1/v2

---

## 1. Interatividade

### 1.1 🔴 Alta — Modais não fecham com ESC nem clicando fora
- **Onde:** todos os modais do sistema — `src/components/ui/dialog.tsx:44-46`
- **Problema:** `preventDefault` aplicado globalmente no `DialogContent` bloqueia ESC e clique fora.
- **Impacto:** usuário fica "preso" no modal e só sai pelo X ou botão Cancelar; foge do padrão esperado.
- **Recomendação:** remover os `preventDefault` globais; bloquear fechamento apenas em modais com formulário preenchido.

### 1.2 🔴 Alta — Menu lateral recarrega a página inteira
- **Onde:** `src/components/app-shell.tsx:618, 649`
- **Problema:** cada clique no menu usa `window.location.assign` em vez de navegar via SPA.
- **Impacto:** navegação lenta (recarrega tudo do zero) e perda de estado de filtros e telas abertas.
- **Recomendação:** trocar por `Link`/`navigate` do TanStack Router.

### 1.3 🟡 Média — Mais recargas completas de página
- **Onde:** `caixa-shell.tsx:391,400` · `AtendimentoExtraTabs.tsx:394` · `app.agenda.tsx:4898`
- **Problema/Impacto:** mesmos efeitos do item anterior em Caixa, Nina e Agenda.
- **Recomendação:** trocar por navegação do router.

### 1.4 🟡 Média — confirm()/alert() nativos do navegador
- **Onde:** ~20 pontos — `regras-tab.tsx`, `planos-page.tsx`, `contratos-page.tsx`, `app.agenda.tsx`, `AtendimentoTabs.tsx`…
- **Problema:** exclusões e ações em massa usam diálogos nativos, enquanto outras telas usam `AlertDialog` estilizado.
- **Impacto:** caixas cruas, sem identidade visual, que travam a página; experiência desigual.
- **Recomendação:** padronizar todas as confirmações com o `AlertDialog` do design system.

### 1.5 🟡 Média — Erros engolidos em silêncio
- **Onde:** 11 blocos `catch {}` vazios em `src/`
- **Impacto:** ação pode falhar e o usuário acredita que salvou; suporte fica sem rastro.
- **Recomendação:** exibir toast de erro e registrar o erro em todos os catch.

### 1.6 🟡 Média — Botões e fontes abaixo do mínimo de toque/leitura
- **Onde:** 88 ocorrências de `h-6` (24px) e 224 de `text-[10px]` — Fluxo, Caixa, Agenda
- **Impacto:** difícil acertar o clique em tablets/touch (recepção usa touch); legibilidade ruim.
- **Recomendação:** mínimo `h-8` e `text-xs` nos controles interativos.

### 1.7 🔵 Baixa — Erro de CORS exibido com alert()
- **Onde:** `image-crop-dialog.tsx:181`
- **Recomendação:** exibir como toast ou mensagem inline no dialog.

---

## 2. Duplicidade

### 2.1 🔴 Alta — Duas agendas completas coexistindo
- **Onde:** `app.agenda.tsx` (5.338 linhas) + `agenda-v2/*` (flag `agenda_v2`)
- **Problema:** duas implementações atrás de feature flag — inclusive lógica de cancelamento de pacote copiada e colada nas duas (`agenda-v2-shell.tsx:668` e `app.agenda.tsx:2809`).
- **Impacto:** correção numa agenda não vale na outra; usuários veem comportamentos diferentes.
- **Recomendação:** concluir a migração para a v2 e remover a versão antiga.

### 2.2 🔴 Alta — Mais 3 módulos duplicados v1/v2
- **Onde:** `app.caixa` + `caixa-v2` · `app.orcamentos` + `orcamentos-v2` · `app-shell` + `menu-v2`
- **Impacto:** manutenção dobrada e experiência inconsistente entre perfis de usuário.
- **Recomendação:** definir prazo de migração e eliminar as versões antigas.

### 2.3 🟡 Média — 4 barras de KPI diferentes
- **Onde:** `agenda-v2/kpi-bar.tsx`, `caixa-v2/kpi-bar.tsx`, `clientes-v2/kpi-bar.tsx`, `orcamentos-v2/kpi-bar.tsx` (duas exportam o mesmo nome `KpiBar`)
- **Recomendação:** unificar sobre o design system (`HhpKpiRow`/`HhpKpiCard` já existem).

### 2.4 🟡 Média — Cadastro de pessoas em 3 telas sobrepostas
- **Onde:** `/app/equipe`, `/app/funcionarios`, `/app/medicos`
- **Impacto:** usuário não sabe onde cadastrar; risco de dados divergentes.
- **Recomendação:** consolidar tudo na tela Equipe e redirecionar as demais.

### 2.5 🟡 Média — Telas de desenvolvimento no build de produção
- **Onde:** 6 rotas `/app/dev-*` (dev-hhp, dev-caixa-shell, dev-list-shell…)
- **Impacto:** peso extra no bundle e telas de teste acessíveis por URL (guarda só por role no cliente).
- **Recomendação:** excluir do build de produção (guard com `import.meta.env.DEV`).

### 2.6 🔵 Baixa — Edição de paciente em 4 superfícies
- **Onde:** `cliente-form.tsx`, `editar-paciente-rapido-dialog.tsx`, `paciente-quick-actions.tsx`, rota `clientes/editar`
- **Impacto:** campo atualizado num lugar não aparece nos outros formulários.
- **Recomendação:** reusar um formulário único (versão completa e compacta do mesmo componente).

---

## 3. Inconsistência

### 3.1 🔴 Alta — Alturas de tela com valores mágicos dessincronizados
- **Onde:** `h-[calc(100vh-56px)]` em agenda-v2, caixa-v2, orcamentos-v2, dev-* · `-64px` em clientes · `-260/-280px` na Nina — **o header real tem 50px**
- **Impacto:** faixas vazias ou scroll duplo no fim das telas; cada tela "sobra" diferente.
- **Recomendação:** centralizar a altura do header numa CSS var (`--app-header-h`) e usar nos calc.

### 3.2 🟡 Média — Formatação de datas de dois jeitos
- **Onde:** 56 usos de `toLocaleDateString` espalhados + `date-fns` em apenas 2 arquivos
- **Recomendação:** helper único de formatação de data/hora.

### 3.3 🟡 Média — Controles nativos misturados ao design system
- **Onde:** 8 `<select>` e 7 `<input>` nativos
- **Recomendação:** substituir por `ui/select` e `ui/input`.

### 3.4 🟡 Média — Cores e logos das clínicas hardcoded no código
- **Onde:** `app-shell.tsx:20-42` (`corDaClinica`, `corHoverDaClinica`, `logoDaClinica`) + 6 `style` com hex
- **Impacto:** cadastrar nova clínica exige alterar código; existe `branding.primary` no banco sem uso pleno.
- **Recomendação:** mover cores/logos para o cadastro de clínica e remover os ifs por nome.

### 3.5 🔵 Baixa — Tipografia fora da escala
- **Onde:** 338 ocorrências de `text-[9px]/[10px]/[11px]`
- **Recomendação:** padronizar na escala `text-xs`/`text-sm`.

### 3.6 🔵 Baixa — 23 TODO/FIXME no código
- **Recomendação:** migrar para issues/backlog e limpar o código.

---

## 4. Layout

### 4.1 🔴 Alta — Modais sem limite de altura ✅ CORRIGIDO
- **Onde:** `ui/dialog.tsx`, `ui/alert-dialog.tsx`
- **Era:** modais estouravam a viewport (rodapé com Salvar/Cancelar inacessível) e colavam nas bordas no mobile.
- **Correção:** `max-h` com scroll interno, margem lateral e padding responsivo.

### 4.2 🔴 Alta — Header estourava no mobile ✅ CORRIGIDO
- **Onde:** `app-shell.tsx:670-755`
- **Era:** seletor de clínica com 260px fixos + logo + nome + busca causavam scroll horizontal.
- **Correção:** larguras responsivas e ocultação progressiva de elementos secundários.

### 4.3 🔴 Alta — 45 grids de 3+ colunas sem breakpoints ✅ CORRIGIDO
- **Onde:** ~30 telas (estoque, procedimentos, NFS-e, CRM, portal do paciente…)
- **Era:** formulários esmagados no mobile; filhos `col-span-2` vazavam do card.
- **Correção:** convertidos para `grid-cols-1 sm:grid-cols-N` com `col-span` responsivo.

### 4.4 🟡 Média — Kanban de 7 colunas fixas ✅ CORRIGIDO
- **Onde:** `app.fluxo.tsx:349` · **Correção:** escala responsiva 2 → 3 → 4 → 7 colunas.

### 4.5 🟡 Média — 7 abas espremidas no cadastro de cliente ✅ CORRIGIDO
- **Onde:** `cliente-form.tsx:815` · **Correção:** abas quebram linha no mobile.

### 4.6 🟡 Média — Nina sem versão mobile — PENDENTE
- **Onde:** `app.nina.tsx:995, 1009` — colunas fixas `w-[300px]`/`w-[320px]`
- **Recomendação:** colapsar/empilhar colunas com breakpoints ou drawer.

### 4.7 🟡 Média — Inbox da Nina com altura fixa — PENDENTE
- **Onde:** `AtendimentoExtraTabs.tsx:312` — `h-[calc(100vh-260px)]` + `min-h-[520px]`
- **Impacto:** corta em notebooks de tela baixa (768px).
- **Recomendação:** `flex-1` com min-h fluido.

### 4.8 🔵 Baixa — Popovers com largura fixa — PENDENTE
- **Onde:** `procedimento-cell.tsx:98` (340px) · `cid10-picker.tsx:36` (420px)
- **Recomendação:** `max-w-[calc(100vw-2rem)]`.

---

## 5. Sintaxe

### 5.1 🔴 Alta — Typecheck do projeto não passa (8 erros)
- **Onde:** `app.medicos.tsx:74,82` · `app.medico.$medicoId.tsx:95,108` · `app.hr-contratos.tsx:89,114` · `app.orcamentos.tsx:363` · `app.atendimento-ia.index.tsx:230`
- **Problema:** navegações/Links para rotas com `validateSearch` obrigatório chamados sem o parâmetro `search`.
- **Impacto:** links podem navegar sem os parâmetros que a tela espera (dialogs de novo/editar podem não abrir).
- **Recomendação:** tornar `new`/`edit` opcionais no `validateSearch` ou passar `search:{}`; corrigir os 8 pontos.

### 5.2 🟡 Média — Sem barreira de typecheck no build
- **Onde:** `package.json` (scripts)
- **Problema:** não existe script de typecheck e o build (Vite) não roda o `tsc`.
- **Recomendação:** adicionar `"typecheck": "tsc --noEmit"` e executar no CI antes do build.

---

## 6. Segurança

### 6.1 🔴 Alta — Permissões validadas apenas no menu
- **Onde:** `_authenticated.tsx` (só valida sessão) · `usePermissoes` usado apenas no `app-shell.tsx`
- **Problema:** o controle de permissão por módulo apenas esconde itens do menu — **nenhuma rota valida permissão ao carregar**.
- **Impacto:** qualquer usuário logado acessa qualquer tela digitando a URL (ex.: recepção abrindo `/app/financeiro` ou `/app/auditoria`); a proteção real depende só das políticas RLS do banco.
- **Recomendação:** validar a permissão do módulo no `beforeLoad` das rotas e revisar as políticas RLS tabela a tabela.

### 6.2 🔴 Alta — Segredos de integração expostos no navegador
- **Onde:** `app.integration-secrets.tsx:19-20`
- **Problema:** API keys são lidas e exibidas direto da tabela no cliente (`select` de `id, chave, valor`).
- **Impacto:** chaves secretas trafegam até o navegador; um vazamento compromete as integrações.
- **Recomendação:** manter segredos apenas no backend (Vault/edge functions); o front só grava/rotaciona, nunca lê o valor.

### 6.3 🟡 Média — Autorização de supervisor no cliente
- **Onde:** `supervisor-auth-dialog.tsx:42-68`
- **Problema:** faz `signInWithPassword` com a senha do supervisor no dispositivo do operador e valida o papel no cliente, trocando a sessão temporariamente.
- **Impacto:** senha do supervisor digitada em máquina de terceiros; checagem contornável pelo console.
- **Recomendação:** validar via função no servidor (RPC) que confere credencial + papel e registra auditoria.

### 6.4 🟡 Média — Biometria facial circulando no front (LGPD)
- **Onde:** `face_descriptor` em `cliente-form`, `contratos-page`, `FaceCaptureDialog`, check-in
- **Problema:** descritores biométricos (dado sensível — LGPD art. 5º, II) circulam e são comparados no navegador.
- **Recomendação:** restringir acesso à coluna, matching no servidor, revisar consentimento/retenção. (A exclusão LGPD já existe — ponto positivo.)

### 6.5 🔵 Baixa — HTML dinâmico sanitizado, mas sem trava de lint
- **Onde:** `contratos-page.tsx:2047, 2371` · `lp.$slug.tsx:111`
- **Situação:** os 3 usos de `dangerouslySetInnerHTML` estão protegidos com DOMPurify (ponto positivo).
- **Recomendação:** ativar `react/no-danger` como erro de lint para novos usos.

---

## 7. Regras de Negócio

### 7.1 🔴 Alta — Cancelamento de pacote sem opção de desistir
- **Onde:** `app.agenda.tsx:2809` · `agenda-v2-shell.tsx:667-668`
- **Problema:** o `confirm()` decide entre cancelar TODOS os itens do pacote (OK) ou APENAS este (Cancelar) — **não existe forma de abortar a operação**.
- **Impacto:** usuário que quer desistir clica em "Cancelar" e o agendamento é cancelado mesmo assim — perda real de agendamentos do paciente.
- **Recomendação:** dialog com 3 ações explícitas: "Cancelar todos" / "Apenas este" / "Voltar".

### 7.2 🟡 Média — Dinheiro calculado em ponto flutuante
- **Onde:** `MedicoFormDialog.tsx:478, 585` · `regras-tab.tsx:390` (+11 pontos com `*100`/`/100`)
- **Impacto:** arredondamentos incorretos em repasse médico e regras de preço; centavos podem divergir do caixa.
- **Recomendação:** padronizar valores em centavos inteiros (ou utilitário decimal único).

### 7.3 🟡 Média — Datas podem aparecer um dia antes (fuso)
- **Onde:** 28 ocorrências de `new Date(campo_data)` — `financeiro.atendimentos.tsx:1412-1820`, alertas, lembretes, `cliente-form`
- **Problema:** datas "YYYY-MM-DD" são interpretadas como UTC ao criar o `Date`.
- **Impacto:** vencimentos, alertas e aniversários podem cair um dia antes no fuso do Brasil (UTC-3).
- **Recomendação:** helper único que trate data-sem-hora como data local.

### 7.4 🟡 Média — Regra de permissão padrão ambígua
- **Onde:** `app-shell.tsx:126-131` (`leafAllowed` / `ROUTE_TO_MODULE`)
- **Problema:** rota não mapeada some do menu por padrão, mas continua acessível por URL; o menu v2 tem catálogo próprio que pode divergir.
- **Recomendação:** fonte única de verdade módulo×rota compartilhada pelo menu (v1 e v2) e pelo guard de rota.

---

*Relatório gerado por análise estática do código-fonte. A planilha [relatorio-erros-ui-ux.xlsx](./relatorio-erros-ui-ux.xlsx) contém os mesmos itens com filtros por categoria, severidade e status, além do mapa de módulos do sistema.*
