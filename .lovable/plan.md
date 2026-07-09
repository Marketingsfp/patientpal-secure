## Diagnóstico

O bloqueio "Selecione o serviço" está sendo disparado mesmo com o serviço preenchido porque o formulário passa pelo sanitizador `procedimentoFormulario` (linha 1593 de `src/routes/_authenticated/app.agenda.tsx`):

```
if (atual && med?.especialidade_nome && normalizar(atual) === normalizar(med.especialidade_nome)) return "";
```

Ele existe para não gravar como "serviço" a especialidade sintética do médico (ex.: médico "CARDIOLOGIA" com serviço redundante "CARDIOLOGIA"). Só que quando o "médico/recurso" tem exatamente o mesmo nome do exame que executa — caso do TESTE ERGOMÉTRICO, USG, ECG, etc. — o sanitizador zera o serviço real. No submit (linha 2540-2545), o array fica vazio e cai no toast.

## Correção

Deixar de sanitizar quando o texto atual corresponde a um procedimento **realmente cadastrado** para aquele médico/recurso.

- Em `procedimentoFormulario`: só retornar `""` se `atual` bater com `especialidade_nome` **e** não existir em `opcoesProcedimentoMedico(medicoId, …)` (nem for o `procedimentoPadraoDoMedico`).
- Como `procedimentoFormulario` é usada tanto na abertura do formulário quanto no submit, a mesma correção conserta o salvamento e a exibição inicial.
- Não mexe em `opcoesServicoFormulario` nem no dropdown — só na normalização.

## Verificação

- Editar o agendamento TESTE ERGOMÉTRICO → serviço permanece preenchido → clicar Pagar/Imprimir salva sem erro.
- Testar caso original (médico com especialidade sintética "CARDIOLOGIA" sem procedimento igual): continua zerando corretamente.
- Testar USG com médico "USG …": serviço continua exibido.

## 4 eixos

- 💰 Sem impacto financeiro direto — mas destrava cobranças que hoje ficam presas.
- ⏱️ Elimina bloqueio recorrente em exames com médico=exame (ergométrico, USG dedicado).
- 😊 Recepção não precisa reabrir e reselecionar o serviço.
- 🛡️ Sem risco — mudança local numa função pura de UI.
