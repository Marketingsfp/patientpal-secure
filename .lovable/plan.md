## Mudança solicitada

Substituir os diálogos modais (pop-ups) de cadastro/edição por **telas inline** (tela cheia dentro da área de conteúdo) nos seguintes submenus de **Cartão Benefícios**:

1. **Nova Venda** (`app.cartao-beneficios.contratos.tsx` → na verdade `app.contratos.tsx`)
2. **Convênio** (`app.cartao-beneficios.convenios.tsx`)
3. **Benefícios** (`app.cartao-beneficios.beneficios.tsx`)

Cada tela de cadastro/edição terá um botão **"Voltar"** (ícone seta + texto) no topo, que retorna para a tela de listagem anterior — sem perder os filtros aplicados.

## Como vai funcionar

Cada página manterá **dois modos de visualização** controlados por estado local (`view: "list" | "form"`):

- **Modo `list`**: tabela + botão "Novo" como hoje.
- **Modo `form`**: substitui a tabela pelo formulário completo (mesmos campos do diálogo atual), com:
  - Cabeçalho: `← Voltar` + título ("Novo convênio" / "Editar convênio: <nome>").
  - Conteúdo do formulário (no caso do Convênio, mantém as abas "Informações" / "Faixas de Preço" implementadas anteriormente).
  - Rodapé fixo com botões "Cancelar" e "Salvar".
- Ao clicar em "Novo" ou "Editar", troca para `view: "form"` (sem abrir Dialog).
- Ao clicar em "Voltar", "Cancelar" ou após salvar com sucesso, volta para `view: "list"` e recarrega os dados.
- O `AlertDialog` de confirmação de exclusão **permanece** (é uma confirmação rápida, não um formulário).

## Arquivos afetados

- `src/routes/_authenticated/app.contratos.tsx` — Nova Venda
- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` — Convênio
- `src/routes/_authenticated/app.cartao-beneficios.beneficios.tsx` — Benefícios

## Detalhes técnicos

- Remover `<Dialog>` / `<DialogContent>` de cadastro nos 3 arquivos (manter `AlertDialog` de exclusão).
- Adicionar estado `const [view, setView] = useState<"list" | "form">("list")` em cada página.
- Renderização condicional: `view === "list" ? <Listagem/> : <Formulario/>`.
- Botão "Voltar" usa `<Button variant="ghost"><ArrowLeft/> Voltar</Button>` chamando `setView("list")`.
- Após salvar, `setView("list")` + `load()`.
- **Nota sobre Nova Venda**: o arquivo real é `app.contratos.tsx` (importado em `app.cartao-beneficios.contratos.tsx`). Preciso ler esse arquivo durante a implementação para confirmar a estrutura do diálogo de venda.
