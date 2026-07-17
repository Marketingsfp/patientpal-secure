## O que vai mudar

Todas as alterações são de **layout/UI** em `src/components/pages/contratos-page.tsx`. Nenhuma regra de negócio, cálculo, permissão, migração ou banco é tocado.

### 1. Badge "Prontuário" ao lado do nome do titular (foto 1)

Hoje o badge `Prontuário xxxx` aparece apenas ao lado do rótulo "Paciente titular". A foto pede que ele também apareça **inline junto ao nome do paciente selecionado**, dentro da caixa de exibição do titular.

Aplicar em 3 pontos:

- **Aba Dados — modo admin (contrato existente):** logo após o `PatientSearchInput`, renderizar o `ProntuarioBadge` inline ao lado do nome selecionado (quando houver `admPaciente?.codigo_prontuario`). O badge continua fixo/não editável — só aparece após seleção.
- **Aba Dados — modo leitura:** dentro da caixa cinza que mostra `{contrato.paciente_nome}`, exibir o `ProntuarioBadge` ao lado do nome (mesmo comportamento).
- **Novo contrato (wizard):** dentro do bloco de exibição do titular selecionado (linha `{titular.nome} {titular.cpf ...}`), acrescentar o `ProntuarioBadge` com `titular.codigo_prontuario`. Confirmar que `carregarPacienteCompleto` já traz `codigo_prontuario`; se não trouxer, incluir apenas a leitura desse campo (nada de escrita — respeita a constraint de identificadores legados imutáveis).

Sem alteração no rótulo/label — mantém a badge que já existe junto do rótulo.

### 2. Convênio + Nº de pessoas na mesma linha (foto 2)

Na aba **Dados — modo admin**, hoje "Convênio" e "Nº de pessoas no contrato" estão em blocos separados um abaixo do outro (linhas 3142–3190). Envolver os dois em um único `grid grid-cols-1 md:grid-cols-2 gap-4` para que fiquem lado a lado no desktop. Em telas estreitas, empilham normalmente.

O modo leitura (dois `DadosField` correspondentes) recebe o mesmo agrupamento em 2 colunas para manter consistência.

### 3. Inverter ordem no wizard "Novo contrato"

Em `NovoContratoWizard` (a partir da linha 1128), reordenar os campos no `Card` para:

1. **Paciente titular** (busca + bloco de titular selecionado, com toggle "Apenas titular financeiro")
2. **Convênio** + **Nº de pessoas no contrato** (mesma linha, grid 2 colunas — só aparece Nº de pessoas quando há faixas)
3. **Data início**, **Dia de vencimento** e demais campos que já existem depois

Nada além da ordem visual muda: mesmos estados (`convenioId`, `faixaId`, `titular`, etc.), mesmas validações, mesmo submit.

## Fora de escopo

- Wizard de novo contrato: sem novos campos, sem alteração em validações ou submit.
- Impressão de contrato/cartão/carnê, aba Resumo, aba Contrato: intocados.
- Não haverá gravação em `codigo_prontuario` (identificador legado imutável) — apenas leitura.

## Validação

- `tsgo` (typecheck) após as edições.
- Verificação visual via preview nas duas telas (aba Dados de contrato existente em modo admin/leitura, e wizard de novo contrato).
