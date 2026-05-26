## Mudança em `src/routes/_authenticated/app.contratos.tsx` (frontend)

Refatorar `DetalheContrato` para usar abas (`Tabs` do shadcn, já disponível):

### Aba 1 — "Resumo" (conteúdo atual)
Move todo o conteúdo existente (cards Pagas/Recebido/A receber, botões de imprimir/link/assinatura, lista de Dependentes/Agregados e tabela de Mensalidades) para dentro desta aba. Sem mudança visual além do wrapper.

### Aba 2 — "Contrato" (nova)
- Ao montar o detalhe, carregar em paralelo (junto com mensalidades e dependentes):
  - `cb_convenios` (campo `modelo_contrato`, mais `nome`, `vigencia_meses`, `fidelidade_meses`) pelo `contrato.convenio_id`
  - `clinicas` (nome, cnpj, endereco, cidade, estado, telefone) pelo `clinica_id` do contrato
  - `pacientes` (cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep) pelo `paciente_id` do contrato
- Substituir as variáveis `{{CHAVE}}` do `modelo_contrato` usando o mesmo conjunto já implementado em `src/lib/print-contrato.ts`:
  `CLINICA_NOME`, `CLINICA_CNPJ`, `CLINICA_ENDERECO`, `CIDADE`, `PACIENTE_NOME`, `PACIENTE_CPF`, `PACIENTE_NASCIMENTO`, `PACIENTE_ENDERECO`, `PACIENTE_TELEFONE`, `PACIENTE_EMAIL`, `VALOR_MENSAL`, `TAXA_ADESAO`, `NUM_PARCELAS`, `VIGENCIA_MESES`, `FIDELIDADE_MESES`, `DATA_HOJE`, `DEPENDENTES`.
  A função `applyTemplate` será replicada localmente (mesma lógica regex `\{\{(\w+)\}\}`), sem usar `esc()` pois o conteúdo é renderizado em `<pre>` (texto puro, sem risco de XSS na própria aba React).
- Renderização: bloco em `<pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed p-4 rounded-md border bg-card">`.
- Se `modelo_contrato` estiver vazio, exibir mensagem: "Nenhum modelo cadastrado neste convênio. Configure em **Cartão de Benefícios → Convênio**."
- Botão "Imprimir A4" continua disponível na aba Resumo (já existente).

### Estados/efeitos
Adicionar states `convenio`, `clinica`, `pacienteFull` em `DetalheContrato` e popular no `load()`. `useMemo` para gerar o texto substituído. Sem mudança de schema, RLS ou backend.

## Fora do escopo
- Não editar `print-contrato.ts` (já funciona). 
- Sem mudanças na criação do contrato nem no fluxo de assinatura.
