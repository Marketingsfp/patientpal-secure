# Relatório de Bugs e Correções — 04/07/2026

Resumo, em linguagem simples, de tudo que foi identificado e ajustado hoje no sistema.

---

## 1. Cartão de Benefícios — Aba "Regras"

### 1.1. Coluna "Serviço" fora de ordem
- **Problema:** a coluna "Serviço" aparecia antes de "Categoria" na listagem de regras, dificultando a leitura.
- **Correção:** a coluna "Serviço" foi movida para logo depois de "Categoria".

### 1.2. Serviço "Preventivo" não aparecia na busca
- **Problema:** ao criar uma nova regra, o serviço "Preventivo" (já cadastrado no sistema) não era localizado no seletor.
- **Correção:** ajustado o carregamento da lista de serviços para que "Preventivo" (e demais serviços cadastrados) apareçam corretamente na busca.

### 1.3. Novo período de uso: "Por contrato"
- **Problema:** faltava uma opção para permitir que a regra fosse usada apenas 1 vez durante toda a vigência do contrato.
- **Correção:**
  - Adicionada a opção **"Por contrato"** no campo Período das regras.
  - A validação na agenda passou a considerar todo o contrato (sem recorte por dia/semana/mês) quando essa opção é escolhida.
  - Textos de exibição atualizados (ex.: "1 consulta por contrato").

### 1.4. Novo escopo: "Titular ou dependente (exclusivo)"
- **Problema:** não havia como definir uma regra em que o benefício pudesse ser usado **ou** pelo titular **ou** pelo dependente — nunca pelos dois.
- **Correção:**
  - Adicionado o escopo **"Titular ou dependente (exclusivo)"**.
  - Na agenda, se um deles já usou, o outro fica bloqueado automaticamente.
  - Mensagens/rótulos ajustados para deixar claro o comportamento exclusivo.

---

## 2. Página "Fluxo do Paciente" (`app/fluxo`) — Erros de build

### 2.1. Marcadores de conflito de merge no código
- **Problema:** o arquivo `app.fluxo.tsx` estava com marcadores de conflito (`<<<<<<<`, `=======`, `>>>>>>>`) deixados por um merge mal resolvido, quebrando o build com dezenas de erros de sintaxe.
- **Correção:** todos os marcadores foram removidos, mantendo a versão correta do código. A página voltou a compilar.

### 2.2. Comparação inválida de etapas (TypeScript)
- **Problema:** o código comparava a variável de etapa contra o valor `"exame"`, que não pertencia ao conjunto de etapas válidas, gerando erro de tipagem.
- **Correção:** removida a comparação incorreta; o cálculo passou a usar apenas a ordem oficial de etapas.

### 2.3. Função "anterior" chamada com argumentos faltando
- **Problema:** a função que calcula a etapa anterior era chamada com só 1 parâmetro, mas exigia 2 (etapa atual + se é exame).
- **Correção:** passada também a informação `isExame`, corrigindo o retorno da etapa anterior no fluxo.

---

## Situação atual
- Todos os itens acima foram aplicados e o build está compilando sem os erros reportados.
- Alterações concentradas em:
  - `src/components/cartao-beneficios/regras-tab.tsx`
  - `src/routes/_authenticated/app.agenda.tsx`
  - `src/routes/_authenticated/app.fluxo.tsx`

## Próximos passos sugeridos
- Testar na tela de Regras: cadastrar uma regra com período "Por contrato" e outra com escopo "Titular ou dependente".
- Testar no Fluxo do Paciente: mover um agendamento pelas etapas (incluindo exame) para confirmar avanço/retorno.
