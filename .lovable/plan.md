
# Por que o usuário perdeu o botão "Solicitar estorno"

## Diagnóstico

O botão só aparece quando `podeEscrever = usePodeEscrever("caixa")` é `true`, ou seja, quando o módulo **caixa** tem acesso `write` para o perfil.

Consultando o banco para a clínica **POLICLINICA MENINO JESUS**, perfil `caixa`:

```
perfil_permissoes.modulo = 'caixa' → acesso = 'read'
```

Ou seja: alguém editou as permissões do perfil "CAIXA" e deixou o próprio módulo **caixa** como somente-leitura. Com isso, o operador vê a lista de movimentos mas não pode agir sobre eles (solicitar estorno, registrar recebimento/despesa etc.). O preset padrão do sistema é `caixa: write`, mas registros manuais em `perfil_permissoes` sobrescrevem o preset.

## Correção

Alterar a permissão do módulo `caixa` do perfil `CAIXA` desta clínica de `read` para `write` (via `supabase--insert` → `UPDATE perfil_permissoes`).

Após isso, o operador do caixa volta a ver o botão **Solicitar estorno** em cada linha de recebimento — sem nenhuma alteração de código.

## Como evitar de novo

O gestor pode ajustar isso a qualquer momento em **Configurações → Perfis → CAIXA**, marcando o módulo *Caixa* como **Escrever**. Não é preciso mexer no código.
