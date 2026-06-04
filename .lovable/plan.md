## Objetivo

Remover a opção "Avulso (texto livre)" do botão **Manual** no Repasse Individual. Toda linha manual deve estar vinculada a um serviço cadastrado do médico — sem texto solto que não case com nada no sistema.

## Mudanças (somente em `src/components/medicos/MedicoFormDialog.tsx`)

1. **Botão Manual deixa de ser dropdown** — volta a ser um botão simples que adiciona uma linha de override de serviço (picker dos serviços selecionados na aba Especialidades). Remover o `DropdownMenu` adicionado.

2. **Remover renderização de texto livre** na célula "Nome": apagar o ramo `showTextInput` / `c.avulso`. Toda linha não-categoria renderiza apenas o `<select>` com os serviços do médico.

3. **Migrar linhas avulsas legadas** (ex.: "Cartão Consulta") presentes no banco de médicos já cadastrados:
   - Ao carregar `medico_convenios`, descartar silenciosamente linhas cujo `nome` não é `__CAT__:*` e não corresponde a nenhum procedimento atualmente selecionado pelo médico. Elas não têm como ser editadas/validadas no novo modelo.
   - Remover também o seed `CONVENIOS_PADRAO` ("Cartão Consulta", "Cartão Desconto") usado para novos médicos — não faz mais sentido criar linhas sem vínculo a serviço.

4. **Limpar tipos**: remover o campo `avulso?: boolean` de `ConvenioRow` (agora não utilizado).

## Nada muda

- Lookup em `app.financeiro.atendimentos.tsx` e `print-gr.ts` (continua casando por nome do procedimento e caindo para `__CAT__:<TIPO>`).
- Categorias automáticas, Repasse Padrão, Cartões Benefícios, schema, demais abas.
