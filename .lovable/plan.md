## Objetivo

Permitir marcar um pagamento como **Cortesia** no diálogo de Novo Lançamento (agenda → pagamento), com justificativa obrigatória e autorização de supervisor.

## Comportamento

- Nova opção **"Cortesia"** disponível no seletor **Categoria** do `LancamentoDialog` (arquivo `src/components/financeiro/lancamento-dialog.tsx`).
- Ao selecionar Cortesia:
  - Aparece um campo obrigatório **"Justificativa da cortesia"** (Textarea).
  - O valor **permanece editável** (não é zerado automaticamente).
  - Ao salvar, exige autorização de supervisor (mesmo fluxo já existente do desconto: `SupervisorAuthDialog` para admin/gestor/financeiro). Quem já é supervisor não precisa reautenticar.
  - A justificativa e o autorizador são anexados ao campo `observacoes` do lançamento no formato:  
    `Cortesia — Autorizado por: <nome> — Justificativa: <texto>`
  - O lançamento é gravado normalmente em `fin_lancamentos` com `categoria_id` = Cortesia.

## Categoria "Cortesia" no banco

Migration única que faz seed idempotente da categoria em `fin_categorias` para toda clínica que ainda não a possua, tipo `receita`, ativa. (Sem alterar estrutura de tabelas.)

```sql
INSERT INTO public.fin_categorias (clinica_id, nome, tipo, ativo)
SELECT c.id, 'CORTESIA', 'receita', true
FROM public.clinicas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_categorias f
  WHERE f.clinica_id = c.id
    AND upper(f.nome) = 'CORTESIA'
    AND f.tipo = 'receita'
);
```

Como a categoria passa a existir no `fin_categorias`, ela aparece automaticamente no select existente — sem hardcode no front.

## Alterações no `LancamentoDialog`

1. Detectar cortesia por nome: `ehCortesia = categorias.find(c => c.id === categoriaId)?.nome?.toUpperCase() === 'CORTESIA'`.
2. Quando `ehCortesia`:
   - Renderizar `<Textarea>` "Justificativa da cortesia *" (state novo: `cortesiaJustificativa`).
   - No submit, validar `cortesiaJustificativa.trim().length > 0` — senão, `toast.error`.
   - Se `!ehSupervisor` e `!supervisorInfo`, abrir `SupervisorAuthDialog`; após confirmação, prosseguir.
   - Compor sufixo em `observacoes` com "Cortesia — Autorizado por: … — Justificativa: …" (concatenado às observações que o usuário já tenha digitado, sem sobrescrever).
3. Resetar `cortesiaJustificativa` no `useEffect` de abertura, junto dos demais resets.

## Fora de escopo

- Não altera comprovante, não muda cálculo de repasse médico, não cria nova tabela nem novos campos em `fin_lancamentos`.
- Não altera o fluxo do "Aplicar desconto" existente.
