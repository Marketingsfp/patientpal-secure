# Telefonia: telas de atendimento do OS ZAP

O perfil `telefonia` não deve ver as áreas de configuração e gestão da Nina:
Informações da clínica, Homologação, Laboratório, Revisão de Aprendizados,
Métricas, Decisões do Jev, Arquitetura, Configuração do WhatsApp e Templates.

Antes, parte dessas telas herdava o módulo `nina` liberado para atendimento.
Agora uma restrição adicional específica do OS ZAP é aplicada no AppShell,
tanto ao menu quanto à guarda da tela, inclusive em links diretos com hash.
O favorito antigo `base-conhecimento` segue a restrição de Informações da clínica.
Os grupos sem nenhum item visível desaparecem do menu e da busca do menu.

Conversas, mensagens prontas e Central de conversas mantêm as verificações
existentes. Outros perfis e outros módulos não recebem novas permissões nem
restrições. O comportamento de atendimento real e homologação não é alterado.

A alteração controla navegação e montagem das telas. Não modifica RLS,
endpoints, perfis salvos ou a base publicada. Não exige migration.

## Validação

- `bun test src/lib/atendimento/__tests__/acesso-telas-oszap.test.ts`: abas,
  favoritos antigos, rotas e subrotas bloqueadas; atendimento preservado;
  demais perfis sem alteração.
- `tsc --noEmit`: integração do menu e da guarda de rota.
- A suíte geral `src/lib/permissoes-rotas.test.ts` apresentou três falhas por
  `/app/nina-jev` e `/app/painel-tv-atendimento` não constarem no mapa geral.
  Ambas já existiam no menu da revisão anterior; esse mapa não foi alterado
  por esta mudança. A nova restrição de telefonia tem testes próprios.

Após a publicação, entrar com perfil de telefonia, conferir a ausência dos
grupos e tentar abrir cada link bloqueado. Repetir com admin para confirmar
o acesso administrativo existente. Publicação e teste com sessão autenticada
real ainda precisam ser verificados. Reversão por revert do commit.
