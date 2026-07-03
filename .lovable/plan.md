## Correção dos achados do relatório

Antes de corrigir, **preciso ajustar o relatório**: reinvestiguei o BUG-1 (dependentes = 0 no banco). O `authenticated` tem GRANT e a policy `cd_insert` está correta. O que aconteceu foi um **bug do meu script Playwright**: o autocomplete de dependentes usa `div.absolute.z-50 button` (não `role="option"`), e o script procurava `role=option`, então nunca clicava em nenhum dependente. **Nenhum dep foi realmente selecionado na UI** — logo não há bug de persistência a corrigir no app. Vou manter só as correções que são bugs reais.

### Escopo das correções (frontend + validação)

Arquivo principal: `src/components/pages/contratos-page.tsx` (formulário "Novo contrato").

1. **BUG-2 — Titular duplicado detectado antecipadamente**
   - Ao selecionar titular, consultar `contratos_assinatura` (status ativo, clinica atual). Se existir, mostrar badge vermelho inline com número do contrato e **desabilitar Salvar**. Mantém a checagem no submit por segurança.

2. **BUG-4 — Bloqueio quando titular sem e-mail**
   - Já existe badge "Sem e-mail". Adicionar: **desabilitar botão Salvar** enquanto `titular.email` estiver vazio ou for inválido (regex simples `.+@.+\..+`). Tooltip explica o motivo.

3. **BUG-5 / BUG-6 — Observações validadas com Zod**
   - Aplicar `z.string().trim().max(1000, "Máximo 1000 caracteres")` no submit.
   - Sanitizar tags HTML rudimentares: remover `<script>`, `<iframe>` e event handlers `on*=` antes de gravar (regex simples, não precisa DOMPurify).
   - Contador visível abaixo do textarea: `NNN / 1000`.

4. **BUG-7 — Aviso para data de início extrema**
   - Se `dataInicio < hoje - 7d` ou `> hoje + 6m`: mostrar aviso amarelo abaixo do campo, sem bloquear (permite retroativo intencional).

5. **BUG-3 — Salvar trava quando geração de carnê/boleto demora**
   - Envolver `gerarCarnePDF` e `gerarBoletosFn` em `Promise.race([..., timeout(15000)])`.
   - Se estourar 15s: toast informativo ("Carnê será gerado em segundo plano") e liberar UI (`setSaving(false)` já está antes, mas navegar para lista via `onCreated()`).
   - Também: adicionar spinner explícito no botão Salvar (`{saving && <Loader2 className="animate-spin" />}` — hoje só troca texto).

6. **Robustez — não engolir erro do insert de dependentes/mensalidades**
   - `contrato_dependentes` insert e `contrato_mensalidades` insert atualmente ignoram `error`. Passar por `mostrarErro()` se falhar. Se dep insert falhar, mostrar aviso "Contrato criado, mas X dependentes não foram salvos — reabra o contrato e adicione manualmente."

7. **BUG-8 — 404 recorrente no console**
   - Investigar via DevTools Network e corrigir asset faltante (favicon, imagem, ou fonte). Fix ou remover a referência.

### Fora de escopo (registrado, não vou mexer agora)

- **Validação de e-mail no cadastro do paciente** (raiz do BUG-4: valores como `"janete"` existem no banco). Precisa migração/backfill — item separado.
- Dia de vencimento livre 1–28 (mudança de select para input numérico com validação).
- Faixa vs. contagem real de dependentes (checagem no submit).

### Validação

- Rodar novamente ~10 dos 50 casos automatizados (com script corrigido para clicar no dropdown `div.absolute.z-50 button`) confirmando:
  - Titular duplicado bloqueia botão antes do submit
  - Titular sem e-mail bloqueia botão
  - Observações rejeitando >1000 chars e limpando tags
  - Data 2025-01-15 mostra aviso amarelo
  - Deps agora persistem em `contrato_dependentes`
- Screenshot antes/depois de cada correção em `/mnt/documents/cb-sim/fixes/`.

### Arquivos que devem mudar

- `src/components/pages/contratos-page.tsx` (todo o formulário + salvar + validações)
- Possivelmente `src/lib/traduzir-erro.ts` — apenas se surgir erro novo a mapear
- Nada de mudança de schema; sem migração.

Se aprovado, sigo direto. Se preferir dividir (ex.: só bugs de alta prioridade agora), me avise antes.