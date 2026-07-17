## Objetivo

No **Comprovante de Agendamento** (impressão térmica 80mm):

1. Mostrar o **nº de prontuário** do paciente, no mesmo padrão da GR.
2. Corrigir o disparo duplicado de `window.print()`, que abre dois pop-ups de impressão.

## Onde muda

Apenas `src/lib/print-comprovante-agendamento.ts`.

### 1. Nº de prontuário

- Incluir `codigo_prontuario` no `select` da tabela `pacientes` (linha ~69).
- Adicionar o campo no tipo local do `paciente`.
- Renderizar logo abaixo do nome / CPF, como uma linha centralizada:
  `PRONTUÁRIO: 00001` (usando classe `sm` já existente). Só exibe quando `codigo_prontuario` estiver preenchido — mantém o comportamento de identificadores legados (leitura, nunca escrita).

### 2. Pop-up duplicado

Hoje `imprimirViaIframe` chama `dispararPrint` duas vezes (linhas 228–229): via `iframe.onload` **e** via `setTimeout(600)`. Em navegadores rápidos, os dois disparam e aparecem dois diálogos de impressão.

Ajuste: adicionar uma flag `jaImprimiu` para garantir que `cw.print()` execute uma única vez. O `setTimeout(600)` fica só como fallback para o caso do `onload` não disparar.

```
let jaImprimiu = false;
const dispararPrint = () => {
  if (jaImprimiu) return;
  jaImprimiu = true;
  try { cw.focus(); cw.print(); } catch {}
  setTimeout(cleanup, 4000);
};
```

## Fora de escopo

- Layout geral do comprovante (fontes, separadores, orientações) permanece igual.
- GR e demais impressões (carnê, cartão, orçamento) — nenhuma alteração.
- Regras de negócio, banco e RLS — nada muda.

## Validação

- `tsgo --noEmit` sem erros.
- Reagendar/agendar um paciente com `codigo_prontuario` cadastrado e imprimir o comprovante: só abre 1 diálogo e o campo `PRONTUÁRIO: xxxxx` aparece abaixo do CPF.