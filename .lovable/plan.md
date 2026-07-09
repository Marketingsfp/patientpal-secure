## Problema

Na aba **Especialidades** do cadastro do médico, a seção **Serviços** hoje lista **todos** os serviços já vinculados ao médico — incluindo serviços de especialidades que foram removidas da lista de Especialidades. Ex.: o médico "Mamografia" tem apenas MAMOGRAFIA selecionada, mas continua exibindo serviços laboratoriais (ANTI CARDIOLIPINA, etc.) que sobraram de configurações antigas.

## Correção

Quando a lista de especialidades do médico muda (ou ao abrir o cadastro), filtrar automaticamente `form.procedimentos` para manter **apenas** os serviços cujo procedimento pertence a alguma das especialidades selecionadas (via `grupo` do procedimento ou via `procedimento_especialidades`). Serviços de especialidades desmarcadas somem da lista.

Regras:
- Aplica-se ao cadastro em memória do formulário. A remoção só é persistida ao clicar **Salvar** — coerente com o restante do formulário.
- Serviços cujo procedimento não existe mais no cadastro da clínica (item legado sem match) também são removidos.
- Se a lista de especialidades ficar vazia, a lista de serviços também fica vazia (já é a mensagem exibida hoje).
- A aba **Repasse** já reage a `form.procedimentos`, então as linhas automáticas por serviço e por categoria serão atualizadas junto.

## Onde mexer

`src/components/medicos/MedicoFormDialog.tsx`:

- Adicionar um `useEffect` que observa `form.especialidades`, `procs` e `procEspMap` e reseta `form.procedimentos` para conter só os itens cujo `pid` está em `procsFiltradosPorEspecialidade`.
- Só rodar depois que `procs` e `procEspMap` estiverem carregados (evita apagar tudo no primeiro render antes do fetch terminar).
- Não mexer na UI da seção Serviços em si — a lista já usa `form.procedimentos`; ela vai naturalmente encurtar.

## Escopo

- Somente frontend (`MedicoFormDialog.tsx`).
- Sem migração de banco. A limpeza dos serviços "órfãos" é efetivada quando o usuário salvar o cadastro do médico afetado.
