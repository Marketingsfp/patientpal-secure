## Módulos ausentes em Perfis & Permissões

Comparei `src/lib/permissoes-presets.ts` (lista `TODOS_MODULOS`, base da tela `/app/perfis`) com as rotas reais em `src/routes/_authenticated/` e o catálogo do menu. Encontrei **4 funções do sistema que existem como página mas NÃO aparecem na tela de Perfis**, portanto não podem ter permissão configurada hoje:

| Módulo (chave) | Rota | Onde aparece |
|---|---|---|
| `atendimento-multiplo` | `/app/atendimento-multiplo` | Menu Atendimento |
| `painel-executivo` | `/app/painel-executivo` | Menu Gestão |
| `tipos-servico` | `/app/tipos-servico` | Cadastros clínicos |
| `enfermagem-recursos` | `/app/enfermagem-recursos` | Enfermagem |

Observações:
- Subpáginas de `financeiro.*` (contas, categorias, movimento, alertas, empresas, relatórios, etc.) e de `cartao-beneficios.*` já são cobertas pelos módulos-pai `financeiro` e `cartao-beneficios` — sem alteração.
- `orcamentos-agenda` é variação de `orcamentos` — sem alteração.
- Rotas `dev-*`, `agenda-v2`, `imprimir.*` são internas/feature-flag — sem alteração.

## Alteração proposta

Editar **apenas** `src/lib/permissoes-presets.ts`:

1. Adicionar as 4 chaves em `TODOS_MODULOS` nos grupos apropriados:
   - Operação: `atendimento-multiplo`
   - Cadastros: `tipos-servico`, `enfermagem-recursos`
   - Gestão: `painel-executivo`
2. Ampliar `PRESETS` com defaults sensatos:
   - `admin`: `write` em todos (já herda automaticamente via `Object.fromEntries`).
   - `gestor`: `painel-executivo: write`, `tipos-servico: read`, `enfermagem-recursos: read`, `atendimento-multiplo: read`.
   - `recepcao`: `atendimento-multiplo: write`, `tipos-servico: read`.
   - `medico`: `atendimento-multiplo: write`.
   - `enfermeiro`: `atendimento-multiplo: write`, `enfermagem-recursos: write`.
   - `caixa` / `financeiro`: sem acesso aos 4 novos (mantém escopo).

Nenhuma alteração em rotas, componentes ou banco. Após o merge, os 4 módulos passam a aparecer na tela `/app/perfis` e podem ser habilitados/desabilitados por perfil normalmente.