## Situação atual no banco

Verifiquei os dados reais:

- **Especialidades**: existe apenas **"DENTISTA"** (id `f0cfaa0a-…`). Não existe ainda uma especialidade "Odontologia" cadastrada na tabela `especialidades` — então não há duas linhas para mesclar nesse nível, é só renomear.
- **Procedimentos (serviços)** com vínculo a essas especialidades (campo `grupo`):
  - `grupo = "Dentista"` → **10 itens**, todos com `tipo = procedimento`
  - `grupo = "Odontologia"` → **533 itens**, todos com `tipo = consulta`

Ou seja, a "duplicidade" que você vê está no cadastro de **Serviços** (campo grupo), não em Especialidades.

## O que vou fazer

Uma única migração SQL com três passos:

1. **Renomear a especialidade** `DENTISTA` → `ODONTOLOGIA` (mantendo o mesmo `id`, então todos os vínculos existentes — médicos, modelos de prontuário, benefícios do cartão, regras de rateio etc. — continuam apontando para a mesma linha automaticamente, sem precisar migrar FKs).

2. **Unificar o grupo dos serviços**: atualizar todos os procedimentos com `grupo = 'Dentista'` para `grupo = 'Odontologia'`. Resultado: os 543 serviços passam a ficar agrupados sob "Odontologia".

3. **Trocar o tipo dos serviços de Odontologia**: nos procedimentos com `grupo = 'Odontologia'` e `tipo = 'consulta'`, alterar `tipo` para `'procedimento'`. Resultado final: os 543 serviços de Odontologia ficam todos como **Procedimento**.

## O que NÃO vou mexer

- Nenhuma alteração de schema (sem novas colunas/tabelas/RLS).
- Nenhuma alteração em código frontend — a tela `/app/procedimentos` já lê `grupo` e `tipo` da tabela; os novos valores aparecem automaticamente.
- Outras tabelas que referenciam a especialidade pelo `id` (médicos, prontuário etc.) ficam intactas, pois o `id` não muda — só o `nome`.

## Verificação após a execução

Vou rodar uma consulta de conferência mostrando:
- a linha de `especialidades` renomeada;
- a contagem de procedimentos por `grupo` e `tipo` na área odonto (esperado: 543 em "Odontologia" / "procedimento", 0 em "Dentista" e 0 com tipo "consulta").
