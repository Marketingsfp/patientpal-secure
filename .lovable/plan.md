# Bateria de testes de permissões — perfil Caixa

**Conta de teste:** [testecaixa@gmail.com](mailto:testecaixa@gmail.com)  
**Categoria:** Operação  
**Objetivo:** validar individualmente o bloqueio e a liberação de acesso em todos os módulos da categoria Operação.

## Regra geral do teste

A IA deverá testar todos os módulos da categoria Operação, um de cada vez, seguindo rigorosamente a ordem definida abaixo.

Para cada módulo, deverá executar o seguinte ciclo:

1. Identificar a permissão atual do módulo para o perfil Caixa.
2. Alterar temporariamente a permissão do módulo para `none`, correspondente à opção **Sem acesso**.
3. Atualizar a sessão da conta `testecaixa@gmail.com`.
4. Confirmar que o módulo foi corretamente bloqueado.
5. Alterar a permissão do mesmo módulo para `write`, correspondente à opção **Edição**.
6. Atualizar novamente a sessão.
7. Confirmar que o módulo foi corretamente liberado.
8. Registrar o resultado e seguir para o próximo módulo.

O teste deve começar pelo módulo **Agenda** e continuar sequencialmente pelos demais módulos da categoria Operação.

## Módulos que serão testados

Baseado no grupo `Operação` definido em `src/components/app-shell.tsx`:

1. Agenda — `/app/agenda` — módulo `agenda`
2. Check-in — `/app/checkin` — módulo `checkin`
3. Caixa — `/app/caixa` — módulo `caixa`
4. Chat — `/app/chat` — módulo `chat`
5. Clientes — `/app/clientes` — módulo `clientes`
6. Dashboard — `/app/painel` — módulo `dashboard`
7. Fluxo — `/app/fluxo` — módulo `fluxo`
8. Orçamentos — `/app/orcamentos` — módulo `orcamentos`
9. Recepção — `/app/recepcao` — módulo `recepcao`
10. Triagem enfermagem — `/app/triagem-enfermagem` — módulo `triagem-enfermagem`
11. Cartão benefícios — `/app/cartao-beneficios` — módulo `cartao-beneficios`
12. Documentos — `/app/documentos` — módulo `documentos`
13. Atendimento múltiplo — `/app/atendimento-multiplo` — módulo `atendimento-multiplo`

O **Painel público de senhas** não deverá fazer parte desta bateria, pois fica fora do gate `_authenticated` e não utiliza o mesmo controle RBAC dos demais módulos.

## Ciclo obrigatório por módulo

### Etapa 1 — Registrar o estado inicial

Antes de alterar a permissão:

- Consultar e registrar o valor atual em `perfil_permissoes`.
- Registrar o `perfil_id`, a clínica, o módulo e o valor atual.
- Tirar um screenshot do menu lateral.
- Tentar abrir diretamente a rota do módulo.

O estado inicial deve ser registrado apenas como evidência. Independentemente do valor encontrado, o módulo deverá passar pelo ciclo completo de teste.

### Etapa 2 — Definir como Sem acesso

Alterar somente o módulo que está sendo testado:

```sql
UPDATE perfil_permissoes
SET acesso = 'none'
WHERE perfil_id = '<perfil_caixa>'
  AND modulo = '<modulo_em_teste>';

```

Não alterar outros módulos simultaneamente.

### Etapa 3 — Verificar o bloqueio

Após definir a permissão como `none`:

- Fazer logout e login novamente com `testecaixa@gmail.com`, ou forçar o recarregamento completo das permissões.
- Confirmar que o item desapareceu do menu lateral.
- Tentar abrir diretamente a rota do módulo.
- Confirmar que a rota exibiu a tela `SemPermissao` ou o bloqueio equivalente do `AppShell`.
- Confirmar que nenhuma funcionalidade interna do módulo ficou acessível.
- Registrar screenshots do menu e da tentativa de acesso direto.

O bloqueio somente será considerado aprovado quando:

- o item não estiver visível no menu; e
- o acesso pela URL direta também estiver bloqueado.

### Etapa 4 — Definir como Edição

Depois de validar o bloqueio, alterar a permissão do mesmo módulo para `write`:

```sql
UPDATE perfil_permissoes
SET acesso = 'write'
WHERE perfil_id = '<perfil_caixa>'
  AND modulo = '<modulo_em_teste>';

```

A opção `write` deve corresponder à permissão visual **Edição** no sistema.

### Etapa 5 — Verificar a liberação

Após definir a permissão como `write`:

- Fazer logout e login novamente, ou forçar o recarregamento completo das permissões.
- Confirmar que o item voltou a aparecer no menu lateral.
- Abrir a rota diretamente.
- Confirmar que a página carregou normalmente.
- Confirmar que os controles de criação, alteração ou edição esperados estão disponíveis.
- Executar uma verificação superficial para garantir que não existe bloqueio residual.
- Registrar screenshots do menu e da página liberada.

A liberação somente será considerada aprovada quando:

- o item estiver visível no menu;
- a rota abrir normalmente; e
- as ações de edição esperadas estiverem disponíveis.

### Etapa 6 — Seguir para o próximo módulo

Somente depois de concluir as verificações de bloqueio e liberação do módulo atual, iniciar o teste do próximo módulo.

Não alterar permissões de dois módulos ao mesmo tempo.

## Exemplo obrigatório — módulo Agenda

O primeiro teste deverá ser realizado no módulo Agenda.

### Agenda como Sem acesso

1. Alterar `agenda` para `none`.
2. Recarregar a sessão.
3. Confirmar que Agenda desapareceu do menu.
4. Abrir `/app/agenda` diretamente.
5. Confirmar que o sistema exibiu `SemPermissao`.
6. Salvar as evidências.

### Agenda como Edição

1. Alterar `agenda` para `write`.
2. Recarregar a sessão.
3. Confirmar que Agenda voltou ao menu.
4. Abrir `/app/agenda`.
5. Confirmar que a agenda abriu normalmente.
6. Confirmar que as ações de edição estão disponíveis.
7. Salvar as evidências.

Após finalizar Agenda, repetir exatamente o mesmo processo em Check-in, Caixa, Chat e todos os demais módulos da lista.

## Execução automatizada

Utilizar Playwright com Chromium contra:

```text
http://localhost:8080

```

Realizar o login com:

```text
testecaixa@gmail.com

```

Antes de iniciar:

- identificar a clínica associada à conta;
- identificar o perfil Caixa correto;
- identificar o `perfil_id`;
- confirmar os nomes exatos dos módulos cadastrados em `perfil_permissoes`;
- confirmar que `none` corresponde a Sem acesso;
- confirmar que `write` corresponde a Edição.

As consultas iniciais devem ser feitas antes de qualquer alteração.

## Controle das alterações

Para cada alteração realizada, registrar:

- data e horário;
- clínica;
- `perfil_id`;
- módulo;
- valor anterior;
- novo valor;
- resultado da verificação;
- valor final.

A IA deverá validar o resultado do `UPDATE` antes de continuar.

Caso algum teste falhe, interromper o avanço para o próximo módulo até:

1. registrar o erro;
2. verificar o valor atual no banco;
3. garantir que o módulo não ficou em um estado indefinido;
4. restaurar a permissão para `write`, caso essa seja a configuração final definida para a bateria.

## Screenshots

Salvar as evidências em:

```text
/tmp/browser/rbac-caixa/screenshots/

```

Organizar por módulo:

```text
agenda/
  01-none-menu.png
  02-none-rota-bloqueada.png
  03-write-menu.png
  04-write-pagina.png

```

Repetir o mesmo padrão para todos os módulos.

## Relatório final

Gerar uma tabela com as seguintes colunas:


| Módulo | Rota | Teste `none` | Menu ocultado | Rota bloqueada | Teste `write` | Menu exibido | Rota liberada | Edição disponível | Evidências |
| ------ | ---- | ------------ | ------------- | -------------- | ------------- | ------------ | ------------- | ----------------- | ---------- |


Também apresentar:

- módulos aprovados;
- módulos com falha;
- diferenças entre o menu lateral e o bloqueio da rota;
- módulos em que `write` não disponibilizou ações de edição;
- erros encontrados no `AppShell`, no guard de rota ou no carregamento de permissões;
- screenshots correspondentes;
- estado final de `perfil_permissoes`.

## Estado esperado ao final

Ao final da bateria, todos os módulos testados da categoria Operação deverão estar configurados como:

```text
write

```

correspondente à opção:

```text
Edição

```

A IA deverá executar uma consulta final no banco e confirmar que todos os módulos da lista estão com o valor esperado.

Não declarar a bateria como concluída sem comparar o estado final do banco com a lista completa de módulos testados.

## Cuidados obrigatórios

A tabela `perfil_permissoes` é sensível.

Portanto:

- alterar somente o perfil Caixa da clínica identificada;
- não alterar outros perfis;
- não alterar outras clínicas;
- não alterar mais de um módulo por vez;
- não modificar código de permissões durante a execução da bateria;
- não criar migrations permanentes apenas para executar os testes;
- não deixar nenhum módulo com `none` depois de concluir seu ciclo;
- interromper o teste se houver dúvida sobre o perfil ou a clínica selecionada.

Antes de executar qualquer alteração em produção, solicitar confirmação explícita do responsável pelo sistema.