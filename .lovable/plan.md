## Objetivo

Permitir marcar, na aba **Repasse** do médico, se ele aceita ou não Cartões Benefícios em consultas/exames.

## Banco de dados

Migração em `public.medicos`:
- Adicionar `aceita_cartao_beneficios boolean NOT NULL DEFAULT true` (padrão: aceita, mantém comportamento atual).
- Expor o campo na RPC `medico_dados_sensiveis` (retornando no JSON junto aos demais campos de repasse).

## Frontend — `src/components/medicos/MedicoFormDialog.tsx`

Na aba **Repasse**, adicionar um bloco no topo (acima do "Tipo de repasse"):
- Checkbox **"Aceita Cartões Benefícios"** com descrição curta ("Quando desmarcado, este médico não aceita os preços/descontos dos cartões benefícios em consultas e exames.").
- Estado `aceita_cartao_beneficios: boolean` no `form`, hidratado a partir de `medico_dados_sensiveis` (default `true` para novos).
- Enviar o campo no payload de update/insert da tabela `medicos`.

## Fora de escopo

- Aplicar a regra no fluxo de agendamento/orçamento/caixa (bloquear seleção de cartão quando o médico não aceita). Esta etapa apenas registra a preferência; a aplicação prática na precificação pode ser feita em uma próxima etapa, se desejado.
