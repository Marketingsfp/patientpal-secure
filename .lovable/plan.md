# Regra permanente — Sincronização de Permissões

Vou salvar isto na memória do projeto (`mem://index.md` como regra Core) para ser aplicado automaticamente em **toda** nova funcionalidade, sem você precisar pedir de novo.

## A regra

Sempre que uma nova funcionalidade/módulo for adicionado ao sistema (nova rota em `src/routes/_authenticated/app.*`, novo item no menu lateral `src/components/app-shell.tsx`, ou novo recurso significativo), eu devo na mesma entrega:

1. **Atualizar o catálogo de módulos** em `src/routes/_authenticated/app.perfis.tsx`
   - Adicionar entrada em `GRUPOS` (chave, nome, descrição, grupo correto: Operação / Inteligência / Marketing / Cadastros / Gestão / RH / Sistema).
   - Atualizar os `PRESETS` de cada perfil para incluir o novo módulo com o nível sugerido (`none` / `read` / `write`).

2. **Atualizar o banco** (tabela `perfil_permissoes`)
   - Inserir, para cada perfil existente em todas as clínicas, uma linha do novo módulo com o `acesso` padrão sugerido.
   - Usar `INSERT ... ON CONFLICT DO NOTHING` para ser idempotente.

3. **Confirmar no chat** quais módulos foram adicionados e quais perfis receberam acesso padrão, para você revisar.

## Escopo desta entrega

Apenas salvar a regra na memória. **Não vou alterar código nem rodar migration agora.** A partir da próxima funcionalidade nova, essa rotina passa a ser automática.
