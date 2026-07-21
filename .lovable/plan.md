## Contexto
O filtro "Tipo de agenda" agrupa as agendas dos profissionais pelo nome cadastrado em `medico_agendas.nome`. Na Menino Jesus há 5 rótulos hoje: CONSULTAS (132), AGENDA (5), EXAMES (2), ENFERMAGEM (1), TESTE ERGOMETRICO (1).

O rótulo genérico **"AGENDA"** provavelmente é resíduo de cadastros rápidos onde não renomearam. Aparecer no filtro polui a lista.

## Pergunta pendente para você
Antes de qualquer alteração, preciso confirmar:

1. **Clínica-alvo:** aplico só na **Menino Jesus** (é onde vocês veem o problema)?
2. **O que fazer com as 5 agendas chamadas "AGENDA"?**
   - (a) Renomear todas para **"CONSULTAS"** (unificar no filtro).
   - (b) Renomear caso a caso — eu listo os 5 médicos e você me diz o nome correto de cada um.
   - (c) Não mexer — só queria entender o que era.

Assim que responder 1 + 2, eu executo (se for renomear, via migration/UPDATE no banco, somente na Menino Jesus, mantendo `id`/`medico_id` para não quebrar agendamentos existentes).

## Fora do escopo
- Não vou alterar código do filtro. A lista é gerada dinamicamente a partir dos nomes cadastrados — corrigindo o cadastro, o filtro se resolve sozinho.
- Não vou tocar em SFP nem Novo Rumo.
