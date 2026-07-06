# Fase F — Conectar wizard "Nova sessão" ao fluxo real

Objetivo: fazer o wizard da Agenda V2 criar agendamentos reais no banco, reutilizando 100% das regras da Agenda clássica. Nenhuma regra nova, nenhuma migration, Agenda clássica intacta, flag `agenda_v2` OFF por padrão.

---

## 1. Funções e componentes atuais que serão reutilizados

Todos vivem na Agenda clássica ou em módulos compartilhados. Nenhum será modificado — apenas consumidos.

| Fonte | O que será reutilizado |
|---|---|
| `src/routes/_authenticated/app.agenda.tsx:2410` (`submit`) | Referência das regras — não será chamado diretamente (é local ao componente). Será extraída a lógica para um helper puro (ver seção "Extração mínima"). |
| `src/routes/_authenticated/app.agenda.tsx:2120` (`buscarOrcamento`) | Idem — referência para o path de orçamento. |
| `src/components/agenda/dividir-orcamento-dialog.tsx` | Reutilizado **como está** para o caso "orçamento com múltiplos grupos" — o wizard V2 abrirá esse mesmo dialog quando detectar > 1 grupo. |
| `src/components/patient-search-input.tsx` | Reutilizado no step "paciente" do wizard V2 (substitui a lista mockada). |
| `src/components/agenda/procedimento-picker.tsx` | Reutilizado no step "serviço" (substitui grid mockado). |
| RPC `paciente_cartao_inadimplente` (Supabase) | Chamada igual à clássica quando `tipo_atendimento = "convenio"`. |
| `@/integrations/supabase/client` | Mesmo cliente já usado em toda a V2. |
| `use-clinica`, `use-medico-context`, `use-auth` | Contextos já disponíveis. |

### Extração mínima (única mudança fora da V2)

Para evitar duplicar as regras, extrair da `app.agenda.tsx` uma função **pura** de validação + persistência em `src/lib/agenda/criar-agendamento.functions.ts` (novo arquivo). A `app.agenda.tsx` clássica passa a chamar essa função dentro do seu `submit` — comportamento idêntico, zero mudança visual/funcional na clássica.

Assinatura proposta (server function `createServerFn` + `requireSupabaseAuth`):

```
criarAgendamento({
  clinica_id, paciente_id, paciente_nome,
  medico_id | enfermagem_recurso_id,
  inicio, fim, procedimento,
  tipo_atendimento, observacoes?, orcamento_id?,
  agenda_id?, pacote_id?,
  orcamento_item_ids?: string[],
}) -> { id }
```

Toda a validação (telefone/nascimento, fim>início, slot livre, agenda aberta, inadimplência, procedimento vs. perfil do médico) roda **dentro** dessa função. O wizard V2 e a Agenda clássica chamam o mesmo ponto.

Justificativa: sem essa extração, o wizard V2 duplicaria as regras — o que quebra o princípio "zero regra de negócio nova/alterada".

---

## 2. Regras do agendamento clássico preservadas (todas)

| Regra | Origem |
|---|---|
| Paciente precisa ter telefone e data_nascimento | `app.agenda.tsx:2422–2435` |
| `fim > inicio` | `app.agenda.tsx:2438` |
| Procedimento obrigatório | `app.agenda.tsx:2439` |
| Médico precisa ter agenda aberta no dia | `app.agenda.tsx:2445–2477` |
| Slot livre `DISPONÍVEL` deve cobrir o intervalo | `app.agenda.tsx:2465–2476` |
| Bypass de slot para recursos de enfermagem | `app.agenda.tsx:2445` |
| Inadimplência em cartão benefícios bloqueia (`tipo_atendimento = "convenio"`) | `app.agenda.tsx:2486–2500` |
| Status inicial sempre `"agendado"` | `app.agenda.tsx:2513` |
| Orçamento cancelado não pode ser agendado | `app.agenda.tsx:2134` |
| Itens já consumidos por agendamentos ativos são excluídos | `app.agenda.tsx:2143–2161` |
| Profissional restrito ao perfil (procedimentos autorizados) | `dividir-orcamento-dialog.tsx:378–385` |
| Slots `DISPONÍVEL` reutilizados via UPDATE em vez de INSERT | `dividir-orcamento-dialog.tsx:416–423` |
| `agendamento_orcamento_itens` gravado após INSERT do agendamento | `app.agenda.tsx:2530–2546` |

Nenhuma regra nova. Nenhuma regra removida.

---

## 3. Como o wizard V2 criará um agendamento comum

Novos/ajustados steps do wizard V2:

```text
Step 1  Paciente        -> patient-search-input (BD real)  → paciente_id + nome
Step 2  Serviço         -> procedimento-picker             → procedimento + duração + tipo
Step 3  Profissional    -> select de médicos/recursos      → medico_id ou enfermagem_recurso_id
Step 4  Data e horário  -> date + slots reais              → inicio/fim ISO
Step 5  Confirmação     -> resumo + tipo_atendimento       → chama criarAgendamento()
```

- `clinica_id` vem do `use-clinica`.
- `tipo_atendimento` default = `"particular"`; toggle para `"convenio"` no step 5.
- No submit: chama `criarAgendamento(...)`, mostra toast de sucesso, fecha wizard, invalida `queryKey ["agenda-v2","ags",clinicaId,diaKey]`.
- Erros de validação viram toast com a mesma mensagem da clássica.

---

## 4. Sessão Laboratorial com vários exames

Modelo idêntico ao clássico: **um único agendamento** com `procedimento` = string composta e N vínculos em `agendamento_orcamento_itens`.

- Detecção: `procedimentos.grupo === "LABORATORIO"` OU `procedimentos.tipo IN ("EXAME","LABORATORIO")` (`app.agenda.tsx:2183–2190`).
- Quando o usuário selecionar múltiplos itens de laboratório no step "Serviço" (ou vier de orçamento), o wizard monta a string:
  `LABORATÓRIO (N EXAMES): nome1, nome2, ...` (`app.agenda.tsx:2195–2197`).
- Após o INSERT do agendamento, insere N linhas em `agendamento_orcamento_itens` com o mesmo `orcamento_item_ids` — igual ao fluxo clássico.

---

## 5. Orçamento vinculado

Duas variantes, iguais à clássica:

### 5a. Orçamento com 1 grupo
- Wizard aceita `orcamento_numero` como entrada opcional (ex.: `?orcamento=12345` ou botão "carregar orçamento" no step 1).
- Roda a mesma `buscarOrcamento` (extraída junto para `src/lib/agenda/orcamento.functions.ts`), filtra itens consumidos.
- Preenche steps 1–4 automaticamente; usuário só ajusta horário/profissional.
- Submit chama `criarAgendamento({ orcamento_id, orcamento_item_ids, procedimento })`.

### 5b. Orçamento com múltiplos grupos
- Wizard detecta `gruposDistintos.size > 1` e **abre o `DividirOrcamentoDialog` existente** (não reimplementa). Fecha o wizard V2, delega ao dialog clássico, que já faz INSERT em lote com `pacote_id` compartilhado.
- Justificativa: reusar exatamente o mesmo componente evita divergência de comportamento em um caso complexo.

---

## 6. Encaixe

O relatório de mapeamento confirmou que **não existe suporte a encaixe na Agenda clássica hoje**. Nenhum bypass de conflito, nenhuma flag.

Decisão para a Fase F: **não introduzir encaixe agora**. O wizard V2 seguirá exatamente a regra clássica — sem encaixe. Se o usuário tentar agendar em horário sem slot `DISPONÍVEL`, recebe o mesmo erro da clássica.

Registrar como pendência técnica: "Encaixe (overbooking) — funcionalidade nova, fora do escopo da Fase F. Requer especificação de regra (flag, quem autoriza, se conta ocupação) antes de implementar."

---

## 7. Rollback

Três camadas, do mais leve ao mais completo:

1. **Instantâneo (usuário-a-usuário):** flag `agenda_v2 = OFF` em `profiles.preferencias_ui.flags.agenda_v2`. Wizard V2 deixa de ser acessível; clássica continua funcionando.
2. **Reverter apenas a UI da Fase F:** reverter o commit do `novo-agendamento-wizard.tsx` — volta ao wizard visual (mock), sem afetar `criarAgendamento` (que continua sendo chamado apenas pela clássica via extração da seção 1).
3. **Reverter a extração:** reverter o commit que criou `src/lib/agenda/criar-agendamento.functions.ts` e restaurar o `submit` inline em `app.agenda.tsx`. Comportamento da clássica permanece idêntico (a extração é 1:1).

**Sem migration**, portanto sem rollback de banco. Agendamentos criados pelo wizard V2 são registros normais em `agendamentos` — se necessário identificar-los, marcar via campo `observacoes` prefixado com `[V2]` durante a Fase F (opcional; pergunto se aprovado). Assim, um `DELETE FROM agendamentos WHERE observacoes LIKE '[V2]%'` reverte dados criados pelo wizard.

---

## 8. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Divergência entre wizard V2 e clássica ao evoluir regras | Extração para função única em `criar-agendamento.functions.ts` — os dois consomem o mesmo ponto |
| R2 | Extração introduz regressão na clássica | Extração 1:1 sem mudar lógica; typecheck + Playwright na clássica (criar 1 agendamento simples + 1 com orçamento) antes de merge |
| R3 | Wizard grava payload incompleto e cria "buracos" na visão clássica | Função extraída valida todos os campos; wizard só chama após todos os steps preenchidos |
| R4 | `agendamento_orcamento_itens` órfãos (INSERT do agendamento OK, INSERT dos itens falha) | Mesma limitação da clássica (não há transação atômica hoje). Registrar como pendência técnica; tratar erro do 2º INSERT com toast + botão "tentar novamente" |
| R5 | Realtime da clássica flasha ao ver INSERT do V2 | Comportamento correto — clássica se atualiza; não é bug |
| R6 | Concorrência: dois usuários criam agendamento no mesmo slot ao mesmo tempo | Já é limitação da clássica; a validação de slot livre no servidor mitiga majoritariamente. Sem mudança |
| R7 | Extração quebra imports circulares | Novo arquivo em `src/lib/agenda/` (fora do route file); testado com typecheck |
| R8 | `DividirOrcamentoDialog` acoplado ao estado da `app.agenda.tsx` | Verificar props na fase de execução — se o dialog depende de callbacks locais da clássica, mover para prop-based ou registrar como impedimento antes de codar |

---

## 9. Testes Playwright (persistidos no repositório)

Endereçando também a pendência técnica de "Playwright ad-hoc". Criar `tests/agenda-v2/` com:

| Teste | Cenário | Assert |
|---|---|---|
| `criar-agendamento-simples.spec.ts` | Login → flag ON → wizard → paciente real + serviço real + médico + horário → confirmar | Agendamento aparece na grade V2; existe linha em `agendamentos`; toast sucesso |
| `criar-agendamento-orcamento-1grupo.spec.ts` | Wizard com `orcamento_numero` → steps auto-preenchidos → confirmar | `orcamento_id` gravado; itens em `agendamento_orcamento_itens` |
| `criar-agendamento-orcamento-multigrupo.spec.ts` | Wizard com orçamento >1 grupo → abre `DividirOrcamentoDialog` → confirmar divisão | N agendamentos com mesmo `pacote_id` |
| `criar-sessao-laboratorial.spec.ts` | Selecionar N exames laboratoriais | `procedimento` = `"LABORATÓRIO (N EXAMES): ..."`; N linhas em `agendamento_orcamento_itens` |
| `validacao-paciente-incompleto.spec.ts` | Paciente sem telefone/nascimento | Toast de erro; nenhum INSERT |
| `validacao-slot-ocupado.spec.ts` | Horário sem slot `DISPONÍVEL` | Toast de erro; nenhum INSERT |
| `regressao-agenda-classica.spec.ts` | Flag OFF → criar agendamento pela clássica | Fluxo clássico funciona idêntico ao pré-extração |

Além dos Playwright, `bunx tsgo --noEmit` deve permanecer em zero erro.

---

## 10. Confirmações que serão validadas ao final da Fase F

- Agenda clássica intacta (Playwright `regressao-agenda-classica.spec.ts`).
- Flag `agenda_v2` OFF por padrão (sem mudança no `use-agenda-v2-flag`).
- Zero regra de negócio nova (todas as regras vêm da extração 1:1).
- Zero migration.
- Zero alteração em Caixa, Financeiro, Orçamentos, Prontuário, NFS-e, Nina, Check-in.

---

## Arquivos que serão alterados/criados

**Criados**
- `src/lib/agenda/criar-agendamento.functions.ts` (server function extraída — chamada por clássica e V2)
- `src/lib/agenda/orcamento.functions.ts` (extração de `buscarOrcamento` — opcional; se acoplamento for alto, mantém inline na clássica e V2 usa cópia mínima)
- `tests/agenda-v2/*.spec.ts` (7 arquivos)

**Alterados**
- `src/routes/_authenticated/app.agenda.tsx` (substitui corpo do `submit` por chamada à função extraída — comportamento idêntico)
- `src/components/agenda-v2/novo-agendamento-wizard.tsx` (steps reais + chamada da função extraída + invalidação de query)

**Nada mais.** Sem tocar em Caixa, Financeiro, Orçamentos, Prontuário, NFS-e, Nina, Check-in, Agenda clássica além do ponto de extração.

---

## O que preciso de decisão antes de codar

1. **Aprovar a extração de `submit` para função compartilhada** (ponto único de risco na clássica).
2. **Aprovar prefixo `[V2]` em `observacoes`** para rastreabilidade opcional (facilita rollback de dados).
3. **Aprovar reuso do `DividirOrcamentoDialog` como está** para múltiplos grupos (evita reimplementar).
4. **Aprovar criação da pasta `tests/agenda-v2/`** com Playwright persistido no repo.

Aguardando aprovação do plano antes de iniciar qualquer alteração.
