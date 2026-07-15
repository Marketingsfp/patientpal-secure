## Objetivo

Permitir marcar o **paciente titular** de um contrato do Cartão Benefícios como **"Titular financeiro"** (paga o plano, mas não usufrui dos benefícios). A marcação fica visível na ficha do contrato, na carteirinha impressa/digital, no portal do paciente, e afeta a contagem de vidas usadas na faixa de preço.

## 1) Banco — nova coluna

Nova coluna em `contratos_assinatura`:

- `titular_apenas_financeiro boolean NOT NULL DEFAULT false`

Sem trigger, sem regeração automática de faixa. A recontagem passa a considerar essa flag no cálculo de vidas.

## 2) UI — página do contrato (`src/components/pages/contratos-page.tsx`)

Ao lado do nome do **Paciente titular** (bloco onde hoje ficam os badges de e-mail/foto/duplicidade):

- Adicionar um **checkbox / toggle**: "**Apenas titular financeiro** (não utiliza os benefícios)".
- Ícone de informação (`Info` do lucide) com tooltip:
  > "Marque quando o titular apenas paga o contrato e não usufrui dos benefícios. Ele **não conta** na quantidade de vidas do plano, mas aparecerá na carteirinha com o selo 'Titular financeiro — não utiliza'."
- Ao marcar/desmarcar: se o contrato já existe, salva imediatamente (`update` em `contratos_assinatura`) e recalcula a faixa sugerida.
- Se ainda é um contrato novo (draft), guarda no estado local e envia no create.

**Contagem de vidas (faixa de preço):**
- Substituir `vidasAtuais = (titular ? 1 : 0) + deps.length` por `vidasAtuais = (titular && !titularApenasFinanceiro ? 1 : 0) + deps.length`.
- Aplicar na pré-seleção de faixa e na exibição do "Nº de pessoas no contrato".

**Aba "Resumo" do contrato existente:** exibir uma linha destacada `"Titular apenas financeiro — não utiliza os benefícios"` quando marcado, com o mesmo tooltip explicativo.

## 3) Cartão impresso/digital (`src/lib/print-cartao.ts`)

- Ler `titular_apenas_financeiro` do contrato.
- Quando `true`, no cartão do titular:
  - Rótulo `TITULAR` → `TITULAR FINANCEIRO`.
  - Adicionar faixa/selo discreto no rodapé do cartão: `"Não utiliza os benefícios"`.
- Dependentes não mudam.

## 4) Portal do paciente (`src/routes/paciente.cartoes.tsx` e RPC `meus_cartoes`)

- Incluir `titular_apenas_financeiro` no retorno da RPC `meus_cartoes` (edição da function; parte do mesmo migration).
- Quando `papel = "titular"` e a flag for `true`:
  - Na carteirinha, mudar o subtítulo `capitalize(papel)` de "Titular" para "Titular financeiro".
  - Abaixo do nome, badge branca semitransparente: `"Não utiliza benefícios"`.
  - Mantém tudo o resto (mensalidades, dependentes).

## 5) Não faz parte do escopo

- Não altera regras de repasse, faturamento, ou vínculo de consultas.
- Não bloqueia agendamento/atendimento do titular financeiro no sistema — a marcação é informativa/comercial (o convênio dele simplesmente não deve ser usado; a clínica continua controlando isso operacionalmente).
- Não altera o cálculo já persistido do `valor_mensal` de contratos antigos; só afeta a **sugestão de faixa** ao editar e o campo `titular_apenas_financeiro`.

## Antes / Depois

**Antes:** todo titular consta como beneficiário; a faixa sempre soma titular + dependentes; não há como registrar que o titular só paga.

**Depois:** um checkbox ao lado do titular marca "apenas financeiro"; a faixa passa a contar só quem usufrui; a carteirinha, o resumo do contrato e o portal do paciente exibem o selo "Titular financeiro — não utiliza".

## Validação

1. Abrir um contrato existente, marcar "Apenas titular financeiro", salvar → a contagem de vidas cai em 1 e a faixa sugerida é recalculada.
2. Imprimir o cartão → titular sai com rótulo `TITULAR FINANCEIRO` + "Não utiliza os benefícios"; dependentes inalterados.
3. Logar no portal como o titular → carteirinha mostra "Titular financeiro" e badge "Não utiliza benefícios"; mensalidades continuam listadas.
4. Desmarcar a flag → tudo volta ao comportamento anterior.

## Detalhes técnicos

- Migração:
  ```sql
  ALTER TABLE public.contratos_assinatura
    ADD COLUMN titular_apenas_financeiro boolean NOT NULL DEFAULT false;
  ```
  E `CREATE OR REPLACE FUNCTION public.meus_cartoes(...)` para incluir a nova coluna no JSON retornado (mantendo a assinatura atual).
- Não altera RLS nem GRANTs (coluna nova em tabela existente).
- Arquivos tocados: `contratos-page.tsx`, `print-cartao.ts`, `paciente.cartoes.tsx`, função `meus_cartoes` (migration).
