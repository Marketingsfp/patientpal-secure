## Objetivo
Permitir salvar regras de desconto do tipo **cirurgia** em `cb_convenio_regras` (hoje o CHECK constraint só aceita 'consulta', 'exame', 'procedimento').

## Escopo
- Global (todas as clínicas), pois é correção técnica de constraint.
- Somente banco de dados; nenhum frontend precisa mudar (o select da UI já envia 'cirurgia').

## Alteração
Migration única:

```sql
ALTER TABLE public.cb_convenio_regras
  DROP CONSTRAINT IF EXISTS cb_convenio_regras_tipo_check;

ALTER TABLE public.cb_convenio_regras
  ADD CONSTRAINT cb_convenio_regras_tipo_check
  CHECK (tipo IN ('consulta','exame','procedimento','cirurgia'));
```

## Validação
- Reabrir o convênio FUNCIONARIO, adicionar regra de categoria 'cirurgia' e salvar.
- Conferir que regras já existentes (consulta/exame/procedimento) continuam válidas.

## Fora de escopo
- Nenhuma alteração no motor de aplicação de desconto (ele já trata 'cirurgia' como categoria genérica).
- Nenhuma feature flag — trata-se de correção de bug técnico.