# NFS-e — diagnóstico das 3 demandas e correções aplicadas

Data: 31/08/2026 · Tela: Financeiro › Notas Fiscais (NFS-e)

---

## 1. Filtro por período + Exportação Excel

### O que estava errado

A tela **não tinha filtro de data nenhum**. Ela carregava sempre "as últimas 500
notas", sem recorte de período:

```
.eq("clinica_id", ...)
.order("data_emissao", { ascending: false })
.limit(500)
```

Duas consequências práticas:

- Hoje existem **736 notas** no banco (de 10/07/2026 a 31/08/2026). Como o teto
  era 500, **236 notas antigas simplesmente não apareciam na tela** — não havia
  como chegar nelas nem rolando a lista.
- Os dois quadrinhos de total do topo ("294 notas · R$ 36.340,95" e "206 notas ·
  R$ 35.717,04") somavam esse recorte arbitrário de 500 notas, que não
  corresponde a mês nenhum. Não serviam para fechar competência.

Não existia botão de exportação.

### O que foi feito

- Dois campos novos na barra de filtros: **Data inicial** e **Data final**, já
  preenchidos com **do dia 1º do mês corrente até hoje**.
- O período entra **na consulta ao banco** (`.gte` / `.lte` em `data_emissao`),
  não só na filtragem em memória. É isso que faz meses antigos voltarem a
  aparecer. O teto subiu de 500 para 5.000 linhas, que cobre com folga qualquer
  mês da clínica.
- Botão **"Exportar Excel"** no topo, ao lado de "Conferir por imagem".
- A planilha sai com as colunas pedidas: **Número, Emissão, Emitente, CNPJ do
  emitente, Tomador, CPF/CNPJ do tomador, Valor, Status e Emitido por** — mais
  linha de total, cabeçalho com o período e os filtros usados, e um resumo por
  emitente no rodapé.
- A exportação leva **exatamente o que está na tela**: mesmo período, mesmo
  emitente, mesmo status e mesma busca. Se a planilha divergisse da tela, não
  serviria para conferência.
- Reaproveita o `src/lib/exportar-xlsx.ts` que o Financeiro › Relatórios já usa,
  então o valor sai como número de verdade (dá para somar coluna no Excel), com
  cabeçalho congelado e autofiltro ligado.
- O botão aparece também na São Francisco de Paula: exportar é leitura, e
  aquela unidade também precisa fechar o mês.

**Atenção a uma mudança de comportamento:** como agora o padrão é o mês
corrente, os quadrinhos de total do topo passam a mostrar **o mês**, e não mais
o recorte das últimas 500 notas. Para ver outro período, basta mudar as datas.

---

## 2. Identificação do usuário/operador

### O que estava errado

Só a exibição. O `created_by` **já estava sendo gravado desde sempre**, na
coluna `nfse.emitida_por`:

```
emitida_por: userId,
```

Conferido no banco de produção: **736 de 736 notas têm o usuário preenchido,
zero em branco**. Agosto/2026, por exemplo:

| Quem emitiu | Notas |
|---|---|
| AMANDA FELICIA DE MORAES NETTO | 32 |
| NICOLE FROTA MAGALHAES | 29 |
| EDNALDA PAULINA DE OLIVEIRA | 25 |
| SUELLEN ALEXANDRE BATISTA | 3 |
| MAYARA APARECIDA VIANA LUCENA | 1 |
| RODRIGO SABADIM SANTANA | 1 |

O dado estava lá o tempo todo; a tela é que nunca o buscava nem o mostrava.

### O que foi feito

- Coluna nova **"Emitido por"** na tabela, entre Status e Ações.
- O nome também vai para a planilha do Excel.
- A busca do topo passa a encontrar por nome de quem emitiu (e também por
  CPF/CNPJ do tomador, que antes não era pesquisável).
- Como `nfse` não tem chave estrangeira declarada para `profiles`, o nome é
  resolvido numa segunda consulta — o mesmo caminho que o Caixa e o Movimento
  de Caixa já usam. A permissão do banco já permite isso: qualquer membro da
  clínica enxerga o nome dos colegas da mesma clínica.

**Nenhuma migration é necessária.** A coluna já existe e já está preenchida.

### Restrição por perfil

Quem emitiu cada nota é informação de gestão, não de operação. A pedido do dono,
só **Admin, Gestor e Supervisor** enxergam. Para os demais perfis (recepção,
caixa, financeiro, médico, enfermeiro):

- a coluna **não aparece** na tabela;
- o nome **não entra** na planilha exportada;
- o nome **nem chega a ser carregado** do banco, então também não dá para
  descobrir o emissor digitando o nome dele na busca — fechar a coluna sem
  fechar a busca deixaria a informação acessível por tentativa.

A checagem usa `clinicaAtual.role`, o mesmo padrão de Agenda, Caixa e Contratos.
O perfil `supervisor` existe de fato no banco (um usuário), embora não faça
parte da lista de presets em `src/lib/permissoes-presets.ts` — deve ter sido
criado pela tela de Perfis.

---

## 3. Empresa emitente trocada (CASA DE SAUDE ↔ MA) — **confirmado**

### A causa

O relato das funcionárias está correto, e não é um bug aleatório: é uma **regra
fixa no servidor que reescreve a escolha delas em silêncio**.

Em `src/lib/nfse.functions.ts`, logo depois de carregar o emitente escolhido no
formulário, havia este trecho (introduzido em 19/06/2026):

```
// Regra de negócio: toda NFS-e de CONSULTA deve ser emitida no CNPJ
// 31.919.483/0003-18 (CASA DE SAUDE E MATERNIDADE), independente do
// emitente escolhido pelo usuário. Detecta "consulta" na descrição.
...
if (alvoCnpj && only(emitente.cnpj) !== alvoCnpj) {
  ...
  emitente = emitConsulta;   // <-- troca a empresa aqui, sem avisar ninguém
}
```

Ou seja: o sistema **lê a descrição digitada** e decide a empresa sozinho.

- Se a descrição contém a palavra **"consulta"** → força **CASA DE SAUDE E
  MATERNIDADE**.
- Se contém palavra de **exame** (ecocardio, eletrocardio, ultrassom, raio-x,
  tomografia, ressonância, mamografia, doppler, endoscopia, holter…) → força
  **MA** (MA IMAGENS).
- A empresa escolhida no modal "Em qual empresa emitir a NFS-e?" era
  simplesmente **descartada**, sem nenhuma mensagem na tela.

Por isso a funcionária escolhe "CASA DE SAUDE", digita `ECOCARDIOGRAMA`, e a
nota aparece na lista como "MA". Ela não errou — o sistema trocou.

### A prova nos dados de produção

Agosto/2026, cruzando a descrição com a empresa que ficou gravada:

| Empresa gravada | Palavra na descrição | Notas |
|---|---|---|
| CASA DE SAUDE E MATERNIDADE | "consulta" → força CASA | 57 |
| CASA DE SAUDE E MATERNIDADE | nenhuma palavra-chave (respeitou a escolha) | 19 |
| MA | palavra de exame → força MA | 10 |
| MA | nenhuma palavra-chave (respeitou a escolha) | 5 |

A correlação é de **100%**: não existe **nenhuma** nota com "consulta" na
descrição que tenha saído pela MA, nem **nenhuma** com palavra de exame que
tenha saído pela CASA DE SAUDE. Numa escolha realmente manual isso não
aconteceria — é a assinatura da regra automática atuando.

Casos reais de 31/08 em que a descrição mandou na empresa:

- `ECOCARDIOGRAMA` → MA
- `ELETROCARDIOGRAMA (ECG)` → MA
- `RX TORAX AP/PERFIL (RAIO-X)` → MA
- `CONSULTA (ORTOPEDIA)`, `CONSULTA (CARDIOLOGIA)`, `02 CONSULTAS` → CASA DE SAUDE
- `LAUDO MEDICO`, `RISCO CIRURGICO`, `02 INFILTRACOES` → aí sim valeu a escolha
  da funcionária, porque não tem palavra-chave nenhuma

### Um segundo defeito, este sem discussão

A busca da empresa de destino comparava o CNPJ **como texto formatado**:

```
.eq("cnpj", "57.786.061/0001-43")
```

Se alguém reabrisse o cadastro do emitente e salvasse o CNPJ sem os pontos e a
barra, essa busca não acharia mais nada e **toda emissão de exame passaria a
falhar** com "Emitente MA IMAGENS não cadastrado/ativo". Uma bomba-relógio
dependendo de como o CNPJ foi digitado.

### O que foi feito

A regra de enquadramento fiscal **continua valendo** — trocá-la sozinho seria
mexer em imposto sem a sua autorização (veja a pergunta no fim). O que mudou é
que ela **deixou de ser invisível**:

1. **A regra saiu de dentro da emissão** e virou um módulo próprio,
   `src/lib/nfse-roteamento-emitente.ts`, que o servidor **e as telas** usam. É
   uma fonte única, com testes automatizados.
2. **A tela de emissão avisa antes de enviar.** Enquanto a pessoa digita a
   descrição, aparece um aviso amarelo embaixo do seletor de empresa:
   > ⚠ Pela descrição, esta nota é de **exame** e será emitida por **MA
   > IMAGENS**, e não pela empresa selecionada acima. Se a empresa correta for a
   > selecionada, ajuste a descrição.

   Ela decide antes, não descobre depois.
3. **Aviso também depois de emitir**, em todos os pontos de emissão (tela de
   NFS-e, Agenda e Contratos): "Emitida por MA IMAGENS, não por CASA DE SAUDE E
   MATERNIDADE — a descrição caracteriza exame."
4. **Trilha de auditoria na própria nota.** Quando há troca, fica gravado no
   campo `observacoes` da nota: `Emitente ajustado automaticamente: escolhido
   "X", emitido por "Y" (motivo)`. Assim dá para levantar depois quantas notas
   tiveram a empresa trocada.
5. **A comparação de CNPJ passou a ser por dígitos**, ignorando pontos e barra.
   O segundo defeito acabou.
6. Quando a empresa obrigatória não está cadastrada, a mensagem de erro agora
   explica o motivo em vez de só dizer "não cadastrado".

### Ponto que ficou registrado para o futuro

Exame tem **precedência** sobre consulta. Uma nota agrupada que cite os dois
(ex.: "CONSULTA + ELETROCARDIOGRAMA") vai **inteira** para a MA, inclusive a
parte da consulta. Hoje isso não acontece na prática — procurei no banco e
**não existe nenhuma nota com as duas palavras** —, mas fica anotado e travado
em teste, porque no dia em que a clínica começar a agrupar consulta com exame na
mesma nota, esse é o ponto que vai precisar de decisão.

---

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/lib/nfse-roteamento-emitente.ts` | **novo** — a regra de enquadramento fiscal, agora compartilhada |
| `src/lib/nfse-roteamento-emitente.test.ts` | **novo** — 7 testes cobrindo a regra e o caso relatado |
| `src/lib/nfse-aviso-emitente.ts` | **novo** — aviso na tela quando a empresa foi trocada |
| `src/lib/nfse.functions.ts` | troca de emitente deixou de ser silenciosa; CNPJ comparado por dígitos; grava a trilha em `observacoes` |
| `src/routes/_authenticated/app.nfse.index.tsx` | filtro de período, exportação Excel, coluna "Emitido por", busca ampliada |
| `src/routes/_authenticated/app.nfse.testar.tsx` | aviso amarelo antes de emitir + aviso depois |
| `src/routes/_authenticated/app.agenda.tsx` | aviso de troca de empresa (3 pontos de emissão) |
| `src/components/pages/contratos-page.tsx` | aviso de troca de empresa (2 pontos de emissão) |

**Sem migration de banco.** Todas as colunas usadas (`emitida_por`,
`tomador_documento`, `observacoes`) já existem em produção.

## Verificações feitas

- `tsc --noEmit` — sem erros
- `eslint` nos arquivos alterados — 0 erros (só avisos que já existiam antes)
- `bun test` — **452 testes passando, 0 falhas**
- Dados conferidos direto na base de produção (736 notas)

O `vite build` não roda nesta máquina Windows por um problema do plugin do
Lovable com barra invertida no caminho — é anterior a estas mudanças e não tem
relação com o código. O build de verdade acontece no Lovable.
