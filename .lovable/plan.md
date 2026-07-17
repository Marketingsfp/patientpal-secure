## Reorganizar o diálogo "Renovar contrato" no padrão da venda

Vou reordenar as seções para bater com o wizard de venda de contrato e habilitar edição/inclusão de dependentes no mesmo diálogo.

### Nova ordem das seções

1. **Convênio da renovação** (Select, como já está).
2. **Nº de pessoas no contrato** (campo numérico logo abaixo do convênio, mesmo padrão da venda). Ao alterar o número:
   - Aumentar: abre linhas vazias na lista de dependentes para preencher.
   - Diminuir: pede confirmação antes de remover o último dependente da lista.
3. **Dependentes** (titular + dependentes):
   - Titular fixo no topo (só leitura), com prontuário ao lado.
   - Lista dos dependentes atuais do contrato, agora **editáveis**:
     - Trocar o paciente vinculado (busca com `PatientSearchInput` + prontuário).
     - Trocar o parentesco (Select).
     - Marcar/desmarcar "manter no contrato renovado".
   - Botão **"+ Adicionar dependente"** para novas linhas (paciente + parentesco + checkbox "Cobrar taxa de inclusão R$ X,XX", marcado por padrão).
4. **Cobrar taxa de adesão do novo convênio** (mantém o checkbox atual, aparece só em troca de plano).
5. **Resumo** (mantém, com linhas extras "Novos dependentes" e "Taxa de inclusão total" quando houver).
6. **Observação** (mantém).

### Regras

- **Extensão (mesmo convênio)**: alterações em dependentes existentes são aplicadas no próprio contrato; dependentes novos entram no contrato atual e a taxa de inclusão (se marcada) vai como `numero_parcela < 0` com o valor do convênio atual.
- **Troca de plano**: o contrato antigo é encerrado como renovado; o contrato novo recebe os dependentes na configuração final desta tela (com edições e novos), e as taxas de inclusão marcadas viram parcelas do contrato novo com o valor do convênio escolhido.
- **Nº de pessoas** é derivado: `1 (titular) + dependentes marcados como manter + novos preenchidos`. O campo é editável e serve como meta — se o operador digita 4 e só há 2 linhas, o diálogo abre 2 linhas em branco para completar. Botão "Confirmar" fica desabilitado enquanto houver linha incompleta ou mismatch com o número informado.

### Alterações técnicas

1. **Migration — RPCs de renovação** (`renovar_contrato_extensao` e `renovar_contrato_troca_plano`):
   - Novo parâmetro `_dependentes jsonb` com o estado final da lista:
     `[{ "id": uuid | null, "paciente_id": uuid, "parentesco": text, "manter": bool, "cobrar_taxa_inclusao": bool }]`.
     - `id` presente → dependente existente: aplicar edições (paciente/parentesco) ou desativar se `manter=false`.
     - `id` nulo → dependente novo: inserir e, se `cobrar_taxa_inclusao`, lançar parcela de taxa de inclusão.
   - Aposentar `_dependentes_manter uuid[]` (substituído por `_dependentes`).
   - Snapshot dos novos vai para `contrato_renovacoes.dependentes_incluidos jsonb` (nova coluna) para histórico.

2. **Frontend — `src/components/contratos/renovar-contrato-dialog.tsx`**:
   - Reordenar o JSX (convênio → nº pessoas → dependentes → taxa adesão → resumo → observação).
   - Substituir a lista atual de checkboxes por linhas editáveis com `PatientSearchInput` + Select de parentesco + toggle "manter".
   - Adicionar botão "+ Adicionar dependente" e a lógica de sincronia com o campo "Nº de pessoas".
   - Enviar o novo payload `_dependentes` para as RPCs.

3. **`contratos-page.tsx`**: sem alterações (o `onRenovado` continua o mesmo).

### Fora de escopo

- Cadastrar paciente novo direto do diálogo (continua sendo feito antes, na tela de pacientes).
- Alterar o valor da mensalidade em função do nº de pessoas (segue o cadastro do convênio, como hoje).

Confirme para eu executar.
