## Escopo
Ajustes visuais na tabela de contratos do módulo Cartão Benefícios (`src/components/pages/contratos-page.tsx`). Apenas frontend — nenhuma regra de negócio, RPC ou tabela é alterada.

Clínica-alvo: confirmar antes de aplicar. Como é mudança puramente visual, sugestão de aplicar nas **3 clínicas** (ClinicaOS global). Se quiser restringir a uma clínica só, avise.

## Mudanças

1. **Nova coluna "Prontuário"** entre "Paciente" e "Tipo de convênio"
   - Header simples (sem filtro), alinhado com as demais colunas.
   - Célula exibe apenas o número do prontuário (`c.codigo_prontuario`) em `tabular-nums`, sem o badge.
   - Remover o `<ProntuarioBadge>` da célula "Paciente" (fica só o nome + badges de status como "Tabela antiga" / "Sem carência").
   - `colSpan` dos estados "Carregando…" e "Nenhum contrato" sobe de 11 → 12.

2. **Nome completo do paciente**
   - Remover qualquer truncamento na célula de nome — envolver com `whitespace-normal break-words` para permitir quebra.
   - Manter o `paciente_nome` conforme está no banco (não mexer em dados).

3. **Datas Início/Término em `dd/mm/aa`**
   - Criar helper local `fmtDcurto(iso)` que devolve ano com 2 dígitos.
   - Trocar o `fmtD(...)` **somente** nas duas células da tabela (linhas ~836 e 837).
   - Não alterar `fmtD` global (usado em impressões, diálogos, histórico etc.).

4. **Linha inteira em amarelo para contratos de tabela antiga**
   - Adicionar `className` condicional na `<TableRow>`: quando `c.tabela_legada` for verdadeiro, aplicar tom âmbar (`bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30`).
   - Manter o badge "Tabela antiga — migrar em …" na célula do nome como está hoje (redundância visual útil para leitura de perto).

5. **Legenda no rodapé**
   - Abaixo da paginação/contador ("2 contratos"), adicionar uma pequena legenda:
     `▉ Linhas em amarelo indicam contratos em tabela antiga — pendentes de migração.`
   - Usar um quadradinho `bg-amber-100 border border-amber-300` + texto `text-xs text-muted-foreground`.

## Fora do escopo
- Não alterar exportações (CSV/impressões continuam com data completa).
- Não mexer no modal de detalhes do contrato.
- Não alterar dados no banco.
