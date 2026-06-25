## Diagnóstico

O erro não está nos cadastros: o profissional **ENFERMAGEM** tem **16 serviços ativos** vinculados no banco e também tem vínculos com a agenda. O problema mais provável está na tela da agenda: ela carrega os serviços do médico, mas mistura duas fontes diferentes de configuração e pode ficar com o mapa de serviços vazio/defasado no formulário, fazendo aparecer só o fallback **“ENFERMAGEM (principal)”**.

## Plano para resolver definitivamente

1. **Unificar a fonte de serviços no agendamento**
   - Alterar a agenda para montar as opções diretamente dos vínculos reais `medico_procedimentos` + `procedimentos`, sem depender de fallback por nome/convênio.
   - Manter o filtro por agenda somente quando houver vínculo específico válido; se a agenda não trouxer vínculos, mostrar os serviços do profissional em vez de bloquear.

2. **Corrigir o caso específico da Enfermagem**
   - Garantir que o profissional **ENFERMAGEM** carregue os 16 serviços cadastrados:
     - SORO + 3 MEDICAMENTOS
     - RETIRADA DE PONTOS
     - CURATIVOS
     - TESTE DE GLICEMIA
     - MEDICAÇÃO
     - NEBULIZAÇÃO
     - APLICAÇÃO DE INJEÇÃO
     - demais serviços vinculados.

3. **Adicionar fallback seguro no front-end**
   - Se por qualquer motivo a lista local vier vazia, buscar os serviços do médico no momento de abrir o seletor/formulário e atualizar a lista.
   - Assim o usuário não fica preso só no **“principal”**.

4. **Revisar e reparar vínculos no banco**
   - Rodar uma correção para sincronizar serviços cadastrados no médico com agendas ativas do mesmo médico/clínica.
   - Evitar duplicidade e manter os vínculos existentes.

5. **Validar na própria tela**
   - Abrir `/app/agenda`, selecionar o profissional **ENFERMAGEM** e confirmar que o campo **Serviço** mostra os 16 serviços reais, não apenas **ENFERMAGEM (principal)**.

## Resultado esperado

Ao agendar com o profissional **ENFERMAGEM**, o campo **Serviço** deve listar todos os serviços cadastrados no perfil dela, de forma estável, mesmo se a agenda/filtro estiver diferente.