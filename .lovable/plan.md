# Relatório de Bugs e Correções — 04/07/2026

| # | Área | Problema | Correção |
|---|------|----------|----------|
| 1 | Cartão de Benefícios · Regras | Coluna "Serviço" antes de "Categoria" | Movida para depois de "Categoria" |
| 2 | Cartão de Benefícios · Regras | Serviço "Preventivo" não aparecia na busca | Ajustado carregamento da lista de serviços |
| 3 | Cartão de Benefícios · Regras | Faltava período "Por contrato" (uso único no contrato) | Opção adicionada + validação na agenda |
| 4 | Cartão de Benefícios · Regras | Faltava escopo "Titular ou dependente (exclusivo)" | Opção adicionada; se um usa, o outro bloqueia |
| 5 | Fluxo do Paciente | Marcadores de conflito de merge quebravam o build | Marcadores removidos, versão correta mantida |
| 6 | Fluxo do Paciente | Comparação de etapa com valor inválido (`"exame"`) | Removida comparação incorreta |
| 7 | Fluxo do Paciente | Função `anterior` chamada sem o parâmetro `isExame` | Passado o 2º argumento corretamente |

**Situação:** todas as correções aplicadas, build compilando normalmente.

**Arquivos alterados:**
- `src/components/cartao-beneficios/regras-tab.tsx`
- `src/routes/_authenticated/app.agenda.tsx`
- `src/routes/_authenticated/app.fluxo.tsx`
