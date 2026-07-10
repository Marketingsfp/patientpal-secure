## Alterar ordem no campo SERVIÇO da Guia de Atendimento

### O que muda

Na Guia (GR) impressa, o serviço hoje sai como:

```
1  GERIATRIA - CONSULTA (CARDIOLOGIA)
```

onde `GERIATRIA` é a especialidade principal do médico e `(CARDIOLOGIA)` é a especialidade do procedimento que já vem "colada" no nome (ex.: `CONSULTA (CARDIOLOGIA)`).

Passa a sair invertido — a especialidade do procedimento vai para frente, e a especialidade do médico vai entre parênteses no fim:

```
1  CARDIOLOGIA - CONSULTA (GERIATRIA)
```

Outros exemplos:

- `GERIATRIA - ECOCARDIOGRAMA (ADULTO) (CARDIOLOGIA)` → `CARDIOLOGIA - ECOCARDIOGRAMA (ADULTO) (GERIATRIA)`
- Sem `(...)` no procedimento: `GERIATRIA - CONSULTA` (fallback mantém como hoje).
- Especialidade do médico igual à do procedimento: sai apenas `CARDIOLOGIA - CONSULTA` (sem parênteses redundante).

### Onde alterar

- `src/lib/print-gr.ts`
  - Linha 437-438 (impressão da GR de um agendamento): trocar a composição atual `${espNome} - ${procNomeBase}` pela nova ordem.
  - Linha 846-850 (relatório de GRs em lote): aplicar a mesma regra para manter consistência.

### Lógica

```text
procNomeBase = "CONSULTA (CARDIOLOGIA)"
espMedico    = "GERIATRIA"

# extrair último "(...)" do procNomeBase
match trailing /\s*\(([^()]+)\)\s*$/ em procNomeBase
  → espServico = "CARDIOLOGIA"
  → procLimpo  = "CONSULTA"

if espServico && espMedico && espServico !== espMedico:
  saida = `${espServico} - ${procLimpo} (${espMedico})`
elif espMedico && !procNomeBase.includes(espMedico):
  saida = `${espMedico} - ${procNomeBase}`   # fallback atual
else:
  saida = procNomeBase
```

### Fora do escopo

- Não muda o cálculo de valores, repasse, ficha, prontuário ou qualquer outro campo — apenas a string que aparece na linha `SERVIÇO`.
- Não altera o cadastro de procedimentos nem o nome no banco.

### Governança (4 eixos)

- 💰 Financeiro: neutro.
- ⏱️ Operacional: recepção e médico leem primeiro a especialidade do procedimento (o que o paciente está fazendo hoje), evitando confusão com a especialidade principal do médico.
- 😊 Experiência: guia mais clara para o paciente — bate com o que ele veio fazer.
- 🛡️ Segurança/Auditoria: nenhuma mudança em dados persistidos, só formatação de impressão.
