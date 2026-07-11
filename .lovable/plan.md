## Objetivo

Ao clicar em "Adicionar regra" na aba de Regras do convênio, abrir um pop-up (modal) contendo TODOS os campos da regra em uma única tela. Ao salvar, gravar a nova regra no banco e permanecer na tela de regras (com a lista atualizada). Cancelar descarta.

## Mudanças (apenas `src/components/cartao-beneficios/regras-tab.tsx`)

1. **Novo componente `NovaRegraDialog`** no mesmo arquivo. Estado local com todos os campos de `CbRegra`:
   - Especialidade (SearchableSelect)
   - Categoria/Tipo (Select: consulta/exame/procedimento/cirurgia/qualquer)
   - Serviço específico (SearchableSelect) — desativa Especialidade/Tipo quando escolhido
   - Modo (valor fixo / % desconto) + campo Valor ou Percentual conforme modo
   - Prioridade
   - Carência (Select com CARENCIA_GROUPS)
   - Gratuito (Checkbox — força valor 0)
   - Bloco "Limite de uso" (mesmos campos hoje no `LimiteDialog`: quantidade, período, escopo, e excedente)
   - Prévia do exemplo calculado (usa `computeValor`/`sample`)

2. **Botão "Adicionar regra"** passa a abrir esse dialog (em vez de inserir uma linha vazia na tabela).

3. **Handler de salvar do dialog**: insere direto no `cb_convenio_regras` via supabase (mesmo payload de `salvar()`), com toast de sucesso, fecha o dialog e chama `load()` para atualizar a lista. Usuário permanece na aba de Regras.

4. **`LimiteDialog` permanece** para editar limite de regras já existentes na tabela. `addRegra` antigo é removido/substituído.

5. Botão "Salvar regras" da tabela continua existindo para salvar edições feitas inline nas regras existentes.

## Observações

- Nenhuma mudança de schema/backend — usa a tabela `cb_convenio_regras` existente.
- Comportamento das regras inline da tabela permanece igual (edição rápida + botão "Salvar regras").
- Só o fluxo de criação passa pelo modal.
