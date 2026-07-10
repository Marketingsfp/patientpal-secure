## Novo filtro "Laudo" na tela Atendimentos

Adicionar um filtro dropdown ao lado dos filtros existentes (após "Tipo"), com três opções:

- **Todos** (padrão)
- **Baixados** — `laudo_status === "emitido"`
- **Não baixados** — `laudo_status !== "emitido"`

O botão amarelo "Baixar" na coluna Laudo marca o atendimento como `laudo_status = 'emitido'`, então esse é o critério.

## Implementação

Arquivo único: `src/routes/_authenticated/app.financeiro.atendimentos.tsx`

1. Novo estado: `const [fLaudo, setFLaudo] = useState<"todos" | "baixado" | "nao_baixado">("todos");`
2. Aplicar no filtro em memória (mesmo bloco onde `fStatus`/`fTipo` são aplicados):
   - `baixado`: manter apenas `a.laudo_status === "emitido"`
   - `nao_baixado`: manter apenas `a.laudo_status !== "emitido"`
3. Novo `<Select>` entre "Tipo" e "Ordenar por", seguindo o mesmo padrão visual (Label `text-xs font-medium`, trigger `h-9`).
4. Contagem visível — mostrar quantidade ao lado do label, ex.: `Laudo — 27 baixados / 8 pendentes` (calculado a partir da lista já filtrada pelos demais critérios, para dar feedback rápido).

## Escopo

- Apenas UI/filtro em memória — sem mudança de schema, sem alteração de consulta ao banco.
- Não altera comportamento do botão "Baixar" nem dos outros filtros.
