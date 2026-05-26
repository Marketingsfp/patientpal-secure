## Objetivo
Na tela "Nova venda" do Cartão Benefícios, os campos **Paciente titular** e **Dependentes** devem listar diretamente os Clientes (tabela `pacientes`) já cadastrados, em vez de exigir digitação no campo de busca.

## Mudanças

### `src/routes/_authenticated/app.contratos.tsx` (frontend apenas)

1. **Carregar todos os clientes ativos da clínica** ao abrir o formulário "Novo contrato" (`useEffect` com `supabase.from("pacientes").select("id, nome, cpf, face_descriptor").eq("clinica_id", clinicaId).eq("ativo", true).order("nome")`).

2. **Paciente titular** — substituir o `Input` "Buscar paciente…" por um **Combobox** (padrão do projeto, baseado em `Popover` + `Command` do shadcn):
   - Mostra a lista completa de clientes ao abrir.
   - Permite filtrar digitando o nome ou CPF.
   - Ao selecionar, popula `titular` como já acontece hoje.
   - Mantém o cartão de "titular escolhido" com botões Trocar / Foto.

3. **Dependentes** — mesmo padrão de Combobox:
   - Lista todos os clientes (exceto o titular e os já adicionados como dependentes).
   - Respeita `convenio.max_dependentes`.
   - Ao selecionar, chama `addDep(p)` (já existente).

4. Remover os states/handlers de busca livre que ficam obsoletos (`pacBusca`, `pacResults`, `depBusca`, `depResults`, `buscarPac`) — substituídos pela lista carregada uma vez + filtro local do `Command`.

## Fora do escopo
- Nenhuma alteração no backend, schema ou RLS — a tabela `pacientes` já é a fonte de "Clientes" e o usuário autenticado já tem acesso via membership da clínica.
- Sem mudanças em outras abas (Convênio, Relatórios, Contratos existentes).