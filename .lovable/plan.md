## Objetivo
Traduzir mensagens técnicas de erro (códigos SQL, retornos crus do Supabase, stack traces) para uma linguagem clara em português, mantendo o texto original apenas em um "ver detalhes" opcional para o suporte técnico.

## Diagnóstico
Existem **197 ocorrências** de `toast.error(error.message)` espalhadas em ~50 arquivos, além de erros vindos de:
- Postgres/Supabase (`23505` duplicate, `23503` FK, `42501` RLS, `PGRST116` etc.)
- Auth (`Invalid login credentials`, `Email not confirmed`, `User already registered`)
- Storage (`Payload too large`, `Bucket not found`)
- Focus NFe (E0310, E0120, E0014...)
- ViaCEP, fetch/network (`Failed to fetch`, `NetworkError`)

Trocar cada `toast.error` manualmente seria frágil. Melhor centralizar.

## Plano

### 1. Criar `src/lib/traduzir-erro.ts`
Uma função `traduzirErro(err: unknown, contexto?: string): string` que:
- Reconhece objetos `PostgrestError` (usa `code`, `hint`, `details`) e mapeia:
  - `23505` → "Registro duplicado" (com nome do campo quando possível: CPF, e-mail, código)
  - `23503` → "Este registro está sendo usado em outro cadastro e não pode ser removido"
  - `23514` → "Valor fora do intervalo permitido"
  - `42501` / `permission denied` → "Você não tem permissão para essa ação"
  - `PGRST116` → "Registro não encontrado"
  - `PGRST301` → "Sessão expirada, faça login novamente"
- Reconhece erros de Auth (mensagens em inglês do GoTrue) e traduz:
  - `Invalid login credentials` → "E-mail ou senha incorretos"
  - `Email not confirmed` → "Confirme seu e-mail antes de entrar"
  - `User already registered` → "Este e-mail já está cadastrado"
  - `Password should be at least...` → "A senha precisa ter no mínimo 6 caracteres"
- Reconhece rede: `Failed to fetch`, `NetworkError`, `TypeError: fetch` → "Falha de conexão. Verifique sua internet e tente novamente"
- Reconhece códigos Focus NFe (E0310, E0120, E0014, E0160, E0539, E0166, E0712, E0713) com explicação prática
- Reconhece storage: `The object exceeded the maximum allowed size` → "Arquivo muito grande"
- Fallback: se a string for técnica (contém `::`, `syntax error`, `relation`, `column`, `null value in column`), retorna "Não foi possível concluir a operação. Tente novamente." e loga o original no console.
- Aceita `contexto` opcional ("salvar cliente", "enviar NFS-e") para prefixar: *"Não foi possível salvar cliente: …"*.

### 2. Criar `mostrarErro(err, contexto?)` em `src/lib/traduzir-erro.ts`
Helper que já chama `toast.error()` com a mensagem traduzida e adiciona uma **ação "Ver detalhes"** no toast (usando a API do sonner) que abre um dialog/alert com o texto técnico original — útil para o suporte sem poluir a UI.

### 3. Substituição em massa
Rodar um patch guiado em todos os arquivos com `toast.error(...error.message)`:
- `toast.error(error.message)` → `mostrarErro(error)`
- `toast.error("Falha ao X: " + error.message)` → `mostrarErro(error, "X")`
- Manter as chamadas de `toast.error("texto literal já em PT-BR")` como estão.

Escopo dos arquivos (agrupados por área) — cerca de 50 arquivos, 197 pontos:
- Auth: `login.tsx`, `signup.tsx`, `change-password-dialog.tsx`
- Clientes/Funcionários: forms de paciente, médico, enfermeiro, funcionário
- Financeiro: lançamento, estorno, caixa, boletos
- Cartão de convênio: contratos, planos, dependentes, regras
- Agenda: quick actions, dividir orçamento
- NFS-e: envio, consulta, reenvio (integra com códigos Focus NFe)
- Portal do paciente: `p.$token.tsx`, `paciente.*`
- Edição/upload: rich editor, foto do paciente

### 4. Feedback visual em campos de formulário
Para os erros de validação que hoje usam `alert()` nativo do HTML5 (o caso do e-mail com acento), garantir que os principais formulários (`cliente-form`, `medico-form`, `funcionario-form`) chamem `preventDefault` + `mostrarErro` quando `checkValidity()` falha, para nunca mais aparecer o tooltip amarelo do navegador.

## Fora de escopo
- Não vou reescrever a arquitetura de tratamento de erros (React Query error boundaries, etc.).
- Não vou traduzir textos de terceiros que aparecem *dentro* de iframes (Focus NFe DANFSE, boleto Rede), só o que passa pelo nosso toast.
- Não vou remover o `error.message` do `console.error` — ele continua útil para debug.

## Perguntas antes de implementar
1. Você quer o botão **"Ver detalhes"** dentro do toast para o suporte técnico, ou prefiro esconder totalmente o texto original do usuário?
2. Devo priorizar alguma área (auth, clientes, NFS-e)? Ou aplico em todo o app numa única passada?
