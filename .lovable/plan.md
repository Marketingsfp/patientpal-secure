## Problema

Hoje, no botão azul de nota fiscal na Agenda:
- **Caixa** vê `nfse: "read"` no preset → não consegue emitir.
- **Recepção** não tem `nfse` no preset → sem acesso ao módulo.

Como o botão da agenda usa o mesmo módulo `nfse`, os dois perfis não conseguem emitir a NFS-e diretamente pelo botão.

## Correção

Ajustar apenas o preset de perfis em `src/lib/permissoes-presets.ts`:

- `caixa`: mudar `nfse: "read"` → `nfse: "write"`.
- `recepcao`: adicionar `nfse: "write"`.

Nada mais é alterado:
- RLS da tabela `nfse` já libera INSERT/UPDATE para qualquer membro da clínica (`is_member`), então não precisa mexer em migrations.
- O botão "Emitir nota fiscal" na Agenda continua igual — ele já aparece para quem enxerga a agenda; a mudança no preset só garante que caixa e recepção continuem enxergando o módulo `nfse` como "write" e não fiquem restringidos pelo menu/rotas.
- A regra de negócio dos CNPJs alvo (consulta → Casa de Saúde, exame → MA Imagens) permanece inalterada no server function.

## Impacto

- Caixa e recepção passam a poder clicar no botão e concluir a emissão da NFS-e a partir da Agenda, além de acessar `/app/nfse` para acompanhar.
- Sem alterações em RLS, migrations ou lógica de emissão.