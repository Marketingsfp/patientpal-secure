## Problema
A tela de Vendas permite criar mais de um contrato com status `ativo` para o mesmo titular (paciente). Exemplo: QUEDIMA SUELEN com contratos 20261879 e 20261880, ambos ativos.

## Causa
Em `src/components/pages/contratos-page.tsx` (função `salvar`, linha ~463), o insert em `contratos_assinatura` não verifica se o titular já possui um contrato ativo na clínica.

## Correção

### 1. Bloqueio no frontend (UX imediata)
Em `src/components/pages/contratos-page.tsx`, antes do insert:
- Consultar `contratos_assinatura` por `clinica_id` + `paciente_id` (titular) + `status = 'ativo'`.
- Se existir, mostrar toast de erro: "Este titular já possui um contrato ativo (#<numero>). Cancele o contrato anterior antes de criar um novo." e abortar.
- Também alertar ao selecionar o titular no formulário (badge/aviso visual) para evitar preencher tudo em vão.

### 2. Garantia no banco (proteção real contra duplicidade)
Migration criando índice único parcial em `public.contratos_assinatura`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contrato_ativo_por_titular
  ON public.contratos_assinatura (clinica_id, paciente_id)
  WHERE status = 'ativo';
```
Isso impede definitivamente dois contratos ativos para o mesmo titular na mesma clínica, mesmo em race conditions ou inserts feitos por outras rotas.

### 3. Limpeza dos dois duplicados existentes
Cancelar o contrato 20261880 (mais recente) da QUEDIMA SUELEN para não bloquear a criação do índice único. Confirmar com você antes qual dos dois manter ativo.

## O que NÃO muda
- Continua sendo permitido renovar: basta cancelar o contrato anterior.
- Dependentes e mensalidades não são afetados.
- Demais validações (e-mail, foto facial, limite de dependentes) permanecem.
