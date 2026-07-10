## Objetivo
Ocultar a seção **REPASSE LAUDO TERCEIRO** no cadastro do médico, deixando-a visível apenas para o registro `ELETROCARDIOGRAMA` (agenda de exame). Nenhum outro médico deve ver esse bloco.

## Alteração
Arquivo: `src/components/medicos/MedicoFormDialog.tsx` (linhas 1500–1611).

Envolver o bloco `<div className="space-y-3 pt-4 border-t mt-4"> ... REPASSE LAUDO TERCEIRO ... </div>` em uma condição que só renderiza quando o nome do médico do formulário for `ELETROCARDIOGRAMA` (comparação case-insensitive, ignorando espaços em volta):

```tsx
{form.nome.trim().toUpperCase() === "ELETROCARDIOGRAMA" && (
  <div className="space-y-3 pt-4 border-t mt-4"> … </div>
)}
```

Nenhuma outra lógica muda:
- O carregamento dos laudadores/`medico_repasse_laudo` continua igual (só afeta esse médico, que já é o único com registros).
- O salvamento (`await supabase.from("medico_repasse_laudo").delete/insert`) continua funcionando quando o cadastro em edição for o `ELETROCARDIOGRAMA`.
- Nenhuma mudança de banco, RLS ou tipos.

## Resultado
- Ao abrir qualquer médico cujo nome não seja `ELETROCARDIOGRAMA`, a seção some por completo.
- Ao abrir o cadastro `ELETROCARDIOGRAMA`, a seção continua funcionando exatamente como hoje.
