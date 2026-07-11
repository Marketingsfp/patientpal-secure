## Mudanças

### 1. Aviso persistente (modal) em vez de toast
Em `src/routes/_authenticated/app.agenda.tsx`:
- Adicionar estado `avisoConvenio` = `{ titulo, mensagem, tom: "warning"|"error" } | null`.
- Renderizar um `AlertDialog` (shadcn) com esse estado, título fixo "Aviso do convênio", mensagem em `whitespace-pre-line`, e um único botão "Entendi" que fecha (`onOpenChange`/`onClick` → `setAvisoConvenio(null)`).
- Substituir os `toast.warning(info.avisoLimite, { duration: 8000 })` e o `toast.error(info.avisoLimite ?? …, { duration: 8000 })` dos dois fluxos (linhas ~2716-2732 no `formaPagOpen` normal e ~2969-2985 na cobrança agrupada) por `setAvisoConvenio({ tom, titulo, mensagem: info.avisoLimite })`. Toasts de "cobrança bloqueada"/"limite atingido" quando `info.avisoLimite` está vazio viram fallback do mesmo modal. Os outros toasts (`info.emDia === false`, `desconto aplicado`, etc.) continuam como toasts.

### 2. Mensagem enriquecida quando a regra é `gratuito`
No bloco de limite em `obterInfoConvenioPaciente` (linhas ~505-540), quando `beneficioEscolhido.gratuito === true` E `usados >= limite_qtd` (ou `esgotadoExclusivo`):
- Pegar o consumidor mais recente da cota: `agsPagos.sort((a,b) => new Date(b.inicio) - new Date(a.inicio))[0]` (incluir `id, inicio, medico_id, paciente_id` no SELECT da query de `agendamentos` — já tem `id, medico_id, paciente_id`, faltando `inicio`).
- Buscar nomes: `medicos.nome` do `medico_id` e `pacientes.nome` do `paciente_id` do consumidor (2 selects `.maybeSingle()`).
- Formatar `avisoLimite`:
  > "Gratuidade de <procedimento> deste convênio já foi utilizada em <DD/MM/AAAA às HH:MM> por <PACIENTE NOME> com Dr(a). <MEDICO NOME>.
  > Cobrando <regra do excedente> para este atendimento."
- O texto de excedente continua derivado do `excedente_modo` (particular / -X% / R$ fixo / bloquear), colado na segunda linha.
- Para regras **não** gratuitas (ex.: cartão consulta R$9,99), manter o texto atual já implementado.

### 3. Aviso informativo (múltiplos pendentes) também vira modal
O `avisoLimite` gerado no branch `agsPendentes.length >= 1` (usuário ainda tem cota, mas há outros agendados) também usa `setAvisoConvenio({ tom: "warning", … })`. Mesmo comportamento — atendente fecha para prosseguir.

### 4. Limpeza
Remove o `duration: 8000` dos toasts substituídos (agora modal). Mantém o `duration: 8000` apenas se restar algum toast de limite não coberto (nenhum caso deve sobrar).

## Fora do escopo
- Não muda o cálculo de desconto/excedente nem quem "consome" a cota (fin_lancamentos confirmado ou status realizado/pago) — já correto.
- Não muda outros toasts do sistema.
