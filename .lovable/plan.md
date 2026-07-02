## Objetivo
Testar a aba **Clientes** (`/app/clientes`) via Playwright: cadastrar 50 clientes variados através da UI e forçar erros de validação, depois relatar todos os problemas encontrados.

## Escopo do teste

### Parte 1 — 50 cadastros válidos (variados)
Cadastrar via UI (dialog "Novo cliente") com variação em:
- Nomes (compostos, acentuados, hifenizados, com apóstrofo)
- CPFs válidos (gerados pelo algoritmo oficial)
- Datas de nascimento (bebês, crianças, adultos, idosos 90+)
- Sexo (M/F/outros)
- Telefones (celular, fixo, DDDs variados)
- E-mails (com/sem, domínios variados)
- Endereços (várias UFs, com/sem número, CEP via ViaCEP)
- Ativos/Inativos

### Parte 2 — Forçar erros de validação
Tentativas propositalmente inválidas para verificar como a UI e o backend reagem:

1. **Campos obrigatórios vazios** — submeter form sem nome, sem CPF, sem nada
2. **CPF inválido** — dígitos verificadores errados, "11111111111", menos de 11 dígitos
3. **CPF duplicado** — cadastrar o mesmo CPF duas vezes
4. **Data de nascimento**:
   - Data futura (2099)
   - Data inválida (32/13/2020)
   - Idade absurda (200 anos)
   - Formato errado (texto no lugar de data)
5. **Letras em campos numéricos** — CPF com letras, telefone com letras, CEP com letras
6. **Números em campos texto** — nome só com números, nome só com símbolos
7. **E-mail inválido** — "abc", "abc@", "@dominio.com", sem TLD
8. **Telefone** — com poucos dígitos, com muitos dígitos, com letras
9. **CEP inválido** — inexistente, com letras, com menos dígitos
10. **XSS/Injection básico** — `<script>alert(1)</script>` no nome
11. **Strings gigantes** — nome com 500 caracteres, observações com 5000
12. **Caracteres especiais / unicode** — emojis no nome, RTL, chars de controle

### Parte 3 — Coleta de evidências
Para cada cenário: screenshot + captura de console/network errors + estado final (registro criado ou bloqueado).

## Metodologia
- Script Playwright em `/tmp/browser/clientes-test/` autenticando via sessão Supabase injetada
- Uma iteração por cliente para permitir screenshots individuais dos erros
- Contagem final via query no banco para confirmar quantos dos 50 realmente entraram
- Relatório final com:
  - Lista dos 50 clientes criados (nome + CPF)
  - Tabela de erros forçados: cenário → comportamento esperado → comportamento observado → severidade (bug / melhoria / OK)
  - Recomendações de correção priorizadas

## Não faz parte
- Não vou corrigir bugs nesta rodada — só reportar. Após aprovar o relatório, decidimos o que corrigir.
- Não mexe em NFS-e, agenda, financeiro — apenas cadastro de clientes.
