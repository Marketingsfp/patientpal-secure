## Diagnóstico

O agendamento da **PAULA DSA SILVA THOMAZ** está vinculado ao médico **"BENITES"** (`03b2ee8d…`, atualmente **inativo**). Existe outro cadastro parecido, **ADRIAN ANDRES JARA BENITEZ** (ativo).

- **Fluxo do paciente**: mostra a Paula normalmente (não filtra por status do médico).
- **Atendimento médico**: só carrega médicos ativos, então "BENITES" some do seletor e a Paula fica invisível na fila.
- **Agenda**: já filtra `ativo = true` ao listar médicos, então médico inativo já não aparece para novos agendamentos — nenhuma mudança necessária ali.

Regra confirmada com o usuário: médico inativo **não deve** ser opção em novos agendamentos (já é o comportamento atual), mas pacientes já agendados com ele precisam continuar visíveis para atendimento até serem finalizados.

## Mudanças

Somente frontend, arquivo `src/routes/_authenticated/app.atendimento-ia.index.tsx`:

1. **Carregar médicos em duas etapas**:
   - Buscar médicos ativos da clínica (como hoje).
   - Buscar `medico_id` distintos de agendamentos do dia nas etapas `aguardando_recepcao` → `atendimento` (com `paciente_id` não nulo e `paciente_nome != 'DISPONIVEL'`).
   - Para IDs que aparecem no fluxo mas não estão na lista de ativos, buscar seus dados e mesclar no array `medicos`, marcando como inativo.

2. **Exibir sufixo `(inativo)`** no seletor para esses médicos, deixando claro que é cadastro fora de uso mas com paciente pendente.

3. **Manter a auto-seleção** existente (médico logado → médico com fila pendente → primeiro da lista), agora considerando também os inativos com fila. Assim a Paula aparece automaticamente ao abrir a página.

4. **Auditoria rápida do agendamento existente**: sem mudanças de dados. O agendamento da Paula continua atribuído ao "BENITES" — a limpeza dos cadastros duplicados fica para uma ação separada, se você quiser.

## Fora do escopo

- Aba **Agenda** — já filtra médicos inativos corretamente.
- Não alteramos dados (não reatribui Paula, não mescla cadastros, não reativa "BENITES").
- Não mexemos no Fluxo do paciente.

## Resultado esperado

- Aba **Atendimento médico**: seletor mostra `BENITES (inativo)` junto aos demais; ao selecioná-lo (ou automaticamente) a **PAULA DSA SILVA THOMAZ** aparece pronta para atender.
- Aba **Agenda**: continua bloqueando médicos inativos para novos agendamentos (comportamento já existente, apenas confirmado).
- Nenhum paciente do Fluxo fica órfão na aba Atendimento médico.
