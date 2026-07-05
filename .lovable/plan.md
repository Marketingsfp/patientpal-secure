# A6 — Clientes V2 (plano, aguardando aprovação)

Mesmo padrão de Caixa V2 e Orçamentos V2: preview isolado atrás de flag, clássico 100% intocado, promoção controlada só depois da validação visual.

## 1. Escopo e não-escopo

**Faço:**
- Nova apresentação de lista de pacientes (busca, filtros, virtualização, cards/tabela moderna, alertas).
- Reusar 100% o `ClienteForm` clássico para criar/editar (nada muda em criação/edição).
- Reusar o link já existente `/app/clientes/duplicados` (nada muda em deduplicação real).

**Não faço:**
- Nada de novo em criação, edição, merge, LGPD, biometria, prontuário, contratos, cartão, agendamentos, cobrança, exportação fiscal ou permissões.
- Não mexer em `pacientes`, RLS, triggers ou schema.
- Zero uso da palavra "Convênio" (usar Particular / Associado / Cartão de Benefícios).

## 2. Rota e flag

- Preview: `/app/dev-clientes-shell` (noindex).
- Flag: `clientes_v2` em `profiles.preferencias_ui.flags.clientes_v2` (default `false`), hook `useClientesV2Flag` (mesma forma do `useOrcamentosV2Flag`, com `clientes:flag-changed`).
- Promoção controlada (fase 3, só após seu OK visual): dispatcher em `/app/clientes` idêntico ao de Orçamentos:
  - `v2Allowed = role === 'admin' || role === 'gestor'`
  - `if (!loading && enabled && v2Allowed) return <ClientesV2Mount />; return <ClientesPage />;`
- Recepção/médico/caixa/financeiro continuam no clássico mesmo com flag ON.

## 3. Layout proposto

```text
┌─ ResumoBar (KPIs em tempo real, filtrado)
│   Total · Ativos · Inativos · Novos 30d · Aniversariantes hoje
│   Cadastro incompleto · Possíveis duplicados
├─ ListShell
│   [Busca forte (debounced) — nome · CPF · telefone · prontuário · nascimento]     [Compacto] [Novo]
│   Abas:  Todos · Ativos · Inativos · Incompletos · Duplicados · Aniversariantes
│   Chips: [Particular] [Associado] [Cartão de Benefícios]
│          [Cadastrados hoje] [7 dias] [30 dias]
│          [Com foto] [Sem foto]  (opcional, discreto)
│   VirtualList
│     PacienteCard  ← borda esquerda por status + chips de alerta
├─ KpiBar rodapé (compacto, estilo Caixa/Orçamentos)
└─ Drawer lateral (Sheet) ao clicar no card:
     ficha resumida + botões Editar (abre ClienteForm clássico), Ver prontuário,
     Ver orçamentos, Ver agendamentos, Duplicados (link para tela existente)
```

Mobile (≤ 640px): ResumoBar vira scroll horizontal, chips empilham, cards ocupam largura total.

## 4. Busca forte (debounced 300 ms)

Normalizada; um mesmo termo casa qualquer campo:
- **Nome** — substring case-insensitive.
- **CPF** — só dígitos (>=3) casa `regexp_replace(cpf,'\\D','','g')`.
- **Telefone** — só dígitos (>=3) casa telefone normalizado.
- **Prontuário** — casa `numero_pasta` e `codigo_prontuario`.
- **Data de nascimento** — aceita `dd/mm`, `dd/mm/aaaa`, `aaaa-mm-dd` e apenas ano.

Estratégia: query base `select('id, nome, cpf, telefone, email, data_nascimento, numero_pasta, codigo_prontuario, ativo, foto_url, created_at, cidade, estado, categoria_pagador?')` limitada a N (500) por clínica, ordem `created_at desc`, e filtragem no cliente (mesma técnica do Orçamentos V2, mantendo UI responsiva). Se lista exceder o corte, mostrar aviso "Refine a busca" — não silenciar.

## 5. Filtros rápidos e abas

- **Abas** (contagens em tempo real sobre a base já filtrada por chips/busca):
  - Todos · Ativos · Inativos · Incompletos · Duplicados · Aniversariantes (hoje)
- **Chips (multi)**:
  - Tipo de pagador: Particular · Associado · Cartão de Benefícios
    Derivado de contrato/cartão ativo (leitura só; não altera regras).
  - Período de cadastro: Hoje · 7 dias · 30 dias
  - Foto: Com foto · Sem foto

Aba "Duplicados" mostra apenas pacientes com match por CPF ou (nome normalizado + nascimento). Botão "Resolver na tela dedicada" leva para `/app/clientes/duplicados` (sem alterar aquela tela).

## 6. Cards vs tabela

Cards por padrão (consistente com Orçamentos V2), mais legíveis em mobile e permitem chips de alerta. Modo compacto vira linha densa (avatar + nome + CPF + telefone + idade + ações), mantendo virtualização.

Toggle **Compacto** persiste em `profiles.preferencias_ui.clientes.compact`. Atalho `Ctrl+Shift+C` igual às outras V2.

## 7. Virtualização e paginação

- `VirtualList` do `list-shell` (já usado em Caixa/Orçamentos).
- `pageSize` inicial 50, cresce +50 em `onEndReached` (scroll infinito) até o corte da query (500). Aviso claro quando atinge o teto: "Mostrando 500 mais recentes — use a busca para refinar."

## 8. Alertas nos cards

Chips discretos, cores semânticas:
- **Cadastro incompleto** — falta CPF, telefone, nascimento ou endereço mínimo.
- **Possível duplicado** — mesmo CPF ou (nome normalizado + nascimento) que outro paciente da clínica.
- **Sem foto** — apenas se filtro "Sem foto" ativo (evita ruído).
- **Aniversariante hoje** — badge sutil.
- **Inativo** — badge cinza.

Borda esquerda do card:
- Ativo → verde
- Inativo → cinza
- Incompleto → âmbar
- Duplicado → vermelho (prioridade máxima)

Cálculo de duplicidade: feito uma vez após load, em memória, `Map<cpfNormalizado, ids[]>` e `Map<nomeNorm+nascimento, ids[]>`. O(n).

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Query pesada em clínicas grandes | Corte 500 + aviso; sem JOINs pesados no primeiro load. Dados de pagador/contrato buscados em lote separado só para os visíveis. |
| Falso positivo de "duplicado" | Regra conservadora (CPF exato OU nome+nascimento exatos). Nunca faz merge automático — apenas sinaliza e linka para tela dedicada. |
| Cadastro incompleto marcando muita gente | Regra é chip visual, não bloqueia nada. Só aparece se faltar pelo menos um dos 3 campos essenciais (CPF, telefone, nascimento). |
| Categoria pagador inferida errada | Fallback silencioso para "Particular" quando não houver contrato/cartão ativo; mesma heurística do OrçamentosV2. |
| Regressão no clássico | Rota clássica não é tocada. Dispatcher só entra em cena na fase 3. |
| Flag vazando pra recepção | Dispatcher checa role, não só flag. |

## 10. Rollback

- Desligar flag `clientes_v2` no perfil → volta ao clássico sem reload (evento `clientes:flag-changed`).
- Remover apenas o bloco `if (v2Allowed && enabled) return <ClientesV2Mount/>` do dispatcher desfaz a promoção.
- Nada foi removido do clássico — reverter é sempre seguro.

## 11. Playwright (antes de propor promoção)

Cenários obrigatórios em `/app/dev-clientes-shell` com flag ON:
1. Lista carrega, ResumoBar preenche, virtualização rola sem travar.
2. Busca por nome, CPF (dígitos), telefone (dígitos), prontuário e data (dd/mm/aaaa) — cada uma retornando o paciente esperado.
3. Chips Particular / Associado / Cartão de Benefícios filtram corretamente.
4. Abas Ativos/Inativos/Incompletos/Duplicados/Aniversariantes com contagens coerentes.
5. Modo compacto (botão + `Ctrl+Shift+C`) reduz altura e persiste no profile.
6. Alerta "Cadastro incompleto" aparece em paciente sem CPF/telefone/nascimento.
7. Alerta "Possível duplicado" aparece em pares reais; botão leva para `/app/clientes/duplicados`.
8. Drawer abre; botão Editar abre o `ClienteForm` clássico sem regressão.
9. Mobile 390px: layout empilha, cards legíveis, busca acessível.
10. `/app/clientes` clássico continua idêntico (screenshot comparativo).
11. Zero erros de console; tempo de load reportado.
12. Zero ocorrências da palavra "Convênio" no DOM.

## 12. Entregáveis por fase

- **Fase 1** — flag + hook + rota preview + shell + card + drawer + busca + abas + chips + virtualização.
- **Fase 2** — ResumoBar + KpiBar + alertas (incompleto/duplicado/aniversariante) + modo compacto persistido.
- **Fase 3** — promoção controlada em `/app/clientes` (admin/gestor + flag), após seu OK visual.

Aguardando aprovação para iniciar Fase 1.
