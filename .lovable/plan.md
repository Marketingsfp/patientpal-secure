## Objetivo

Tornar o campo **Serviço** opcional no agendamento e adicionar uma opção de **pagamento manual** (com valor editável pelo usuário) no fluxo de cobrança.

## Alterações

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`

### 1. Serviço opcional no cadastro do agendamento

- Remover a validação `if (procedimentosParaSalvar.length === 0) { toast.error("Selecione o serviço"); return; }` (linha ~2609) para permitir salvar/pagar um agendamento sem procedimento definido.
- Ajustar o campo de serviço no formulário: retirar o asterisco/label de "obrigatório" e permitir submit vazio. O texto do procedimento salvo pode ficar `null` (o schema já aceita).
- Nos fluxos de cobrança que dependem do nome do procedimento (`cobrarAgendamento`, `cobrarSelecionados`, submit com "ir para pagamento"), manter o fallback já existente `procedimento ?? "CONSULTA"` para descrição/lookup de valor — quando não houver procedimento e nenhum valor de referência, o fluxo cai naturalmente na cobrança manual descrita abaixo.

### 2. Botão "Valor manual" no diálogo Forma de pagamento

No `Dialog` "Forma de pagamento" (linhas ~3867–3917), adicionar um novo botão abaixo de "Mais de uma forma de pagamento":

```
✏️ Valor manual (definir manualmente)
```

Comportamento (`escolherManual`, análogo a `escolherMisto`):
- Abre o `LancamentoDialog` com:
  - `initialValor = ""` (vazio, para o usuário digitar)
  - `initialFormaPagamento = ""` (usuário escolhe forma dentro do próprio LancamentoDialog)
  - `initialDescricao` = mesma descrição usada nos demais fluxos, com sufixo `— valor manual`
  - `agendamentoId` = mesmo principal + extras já preparados
- O restante do fluxo (baixa, sombras para agrupados, auto check-in) permanece idêntico ao `onSavedWithData` existente.

### 3. Atalho de teclado

Incluir a tecla correspondente ao novo botão na dica "1–5" já exibida no cabeçalho do diálogo, passando a "1–6" (ou próximo índice disponível), e no handler de teclas do diálogo.

## Fora de escopo

- Nenhuma mudança em migrations, RLS, tipos gerados ou outros módulos financeiros.
- Nenhuma alteração no `LancamentoDialog` em si — ele já permite editar valor e forma de pagamento.