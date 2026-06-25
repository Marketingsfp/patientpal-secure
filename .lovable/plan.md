## Escopo da auditoria

A base é grande (várias centenas de arquivos: agenda, NFS-e, financeiro, prontuário, atendimento, RH, LMS, etc.). Uma varredura "tudo de uma vez" geraria um diff gigante, arriscaria regressões em fluxos críticos (NFS-e, pagamentos, agenda) e demoraria horas. Vou priorizar áreas de **maior risco real ao usuário** e entregar correções concretas, não um refactor amplo.

## Áreas priorizadas (nesta ordem)

1. **Agenda (`app.agenda.tsx`)** — fluxo mais usado e fonte recente de bugs.
   - `useEffect` com dependências faltando / loops potenciais.
   - `try/catch` em salvar, cobrar, emitir nota, vincular paciente.
   - Validações: bloquear submit em branco (paciente, médico, data).
   - Keys faltando em `.map(...)`.
   - Estados não resetados ao trocar de clínica.

2. **Cadastro de Paciente e Agendamento**
   - Tratamento de exceção do `toast.error` em INSERT/UPDATE.
   - Validação Zod onde estiver ausente em campos obrigatórios.
   - Mensagens de erro amigáveis no lugar de stack traces.

3. **NFS-e (`nfse.functions.ts`, `app.nfse.index.tsx`)**
   - `try/catch` em `emitirNfse`, `reenviarNfse`, `consultarNfse`.
   - Toasts de erro com mensagem do Focus.
   - Loops de polling: garantir cleanup e limite.

4. **Financeiro / Caixa**
   - Submits sem `disabled` enquanto pendente (duplo clique).
   - Conversões `Number(...)` sem fallback (`NaN` em totais).

5. **UI/UX e responsividade**
   - Diálogos que estouram em telas < 768px (overflow, scroll).
   - Botões com texto sobreposto em modo apertado.
   - `grid` sem `min-w-0` causando overflow em tabelas.

6. **Limpeza de warnings**
   - Keys em `.map` (apenas onde realmente faltam).
   - Props com tipo errado, imports não usados nos arquivos tocados.

## O que NÃO entra agora

- Refactor estrutural (mover hooks, dividir `app.agenda.tsx` de 4.7k linhas).
- Renomear pastas, mexer em RLS ou migrations, alterar contratos de API.
- Reescrever telas com aparência funcional só por estética.

Essas mudanças são úteis mas devem ser pedidas separadamente — mexê-las junto com correções de bugs gera risco alto em produção.

## Como vou executar

- Rodar uma varredura automatizada (ripgrep) por padrões de risco: `useEffect` sem deps, `.map(` sem `key`, awaits sem `try`, `onClick` sem `disabled`, `Number(` sem fallback, `dangerouslySetInnerHTML`, `console.error` deixados.
- Para cada ocorrência relevante, aplicar a correção mínima e segura.
- Validar no final com o typecheck do projeto.

## Entrega final

Relatório em bullets, no formato pedido:
- **Problema** — o que estava errado.
- **Arquivo/componente** — caminho exato.
- **Correção** — o que mudou (e por quê, em 1 linha).

Agrupados pelas 6 áreas acima.

## Confirmação antes de executar

Quer que eu siga com esse escopo priorizado, ou prefere que eu foque em **uma única área primeiro** (ex.: só Agenda, ou só NFS-e) para garantir profundidade antes de avançar?