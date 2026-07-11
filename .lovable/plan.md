## Objetivo

Adicionar o campo **CONV.** na GUIA DE ATENDIMENTO (GR térmica 80mm) logo abaixo da linha **NASC**, mostrando automaticamente a opção selecionada em "Tipo de atendimento" do agendamento.

## Comportamento

- `tipo_atendimento = "convenio"` → `CONV: <NOME DO CONVÊNIO>` (ex.: `CONV: CARTÃO CONSULTA + SEGUROS`), usando o nome do convênio do contrato ativo do paciente (`cartao_beneficios_contratos` → `cb_convenios.nome`).
- `tipo_atendimento = "particular"` → `CONV: PARTICULAR`.
- Sem `tipo_atendimento` ou sem contrato de convênio válido → não renderiza a linha (mantém a GR limpa em vez de mostrar “—”).
- A linha fica **numa linha só** (mesmo estilo `center sm` das linhas PRONTUÁRIO/CPF/FONE/NASC, `word-break` já herdado — para nomes curtos como “CARTÃO CONSULTA + SEGUROS” não haverá quebra).

## Arquivo alterado

`src/lib/print-gr.ts` — layout individual e agrupado (as duas ocorrências da linha `NASC`, ~L630 e ~L1009).

## Implementação técnica

1. Incluir `tipo_atendimento` no `.select` de `agendamentos` (L248 e L836).
2. Após buscar o paciente, quando `tipo_atendimento === "convenio"` e houver `paciente_id`, buscar o contrato ativo:
   ```
   supabase
     .from("cartao_beneficios_contratos")
     .select("cb_convenios(nome)")
     .eq("paciente_id", ...)
     .eq("status", "ativo")
     .maybeSingle()
   ```
   Fallback: se não achar, usar `"CONVÊNIO"` (rótulo genérico) — evita GR sem informação quando o vínculo foi apagado depois do agendamento.
3. Calcular `convLabel`:
   - `"convenio"` → `nome.toUpperCase()` do contrato (ou `"CONVÊNIO"` de fallback).
   - `"particular"` → `"PARTICULAR"`.
   - outros/nulo → não renderiza.
4. Inserir logo após a linha NASC:
   ```html
   <div class="center sm">CONV: <span class="v">${esc(convLabel)}</span></div>
   ```
   Aplicar nos dois blocos de HTML (individual e agrupada).

## Fora de escopo

- Não alteramos a lógica de repasse/valores da GR.
- Não alteramos a UI da Agenda nem o schema.
- Não mexemos no comprovante de agendamento nem no contrato/carnê.

## Análise dos 4 eixos

- 💰 Financeiro: neutro (apenas informativo na GR).
- ⏱️ Operacional: recepção/médico identificam na hora o convênio que cobriu o atendimento sem abrir a agenda.
- 😊 Experiência: paciente enxerga na guia impressa o tipo de atendimento contratado.
- 🛡️ Segurança/Auditoria: nenhum dado sensível novo; a GR já é impressa localmente.
