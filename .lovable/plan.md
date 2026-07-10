## Contexto

Hoje o diálogo **Incluir dependente** (aba Contrato do cartão benefício) usa um `<Select>` que lista todos os pacientes da clínica pré-carregados. Com clínicas grandes isso vira uma lista enorme e sem busca.

O mesmo arquivo já usa `PatientSearchInput` para escolher o titular na venda e no modo admin — ele suporta digitar nome, CPF, prontuário, pasta ou nascimento.

## Mudança

Em `src/components/pages/contratos-page.tsx`, no diálogo "Incluir dependente":

1. Substituir o `<Select>` de paciente por `<PatientSearchInput>`:
   - `clinicaIdsOverride={[contrato.clinica_id]}` (mesma clínica do contrato).
   - `placeholder="Buscar por nome, CPF, prontuário, pasta ou nascimento…"`.
   - `onSelect`: valida se não é o titular e se ainda não é dependente ativo; se ok, seta `incPaciente`.
   - Mostra o paciente selecionado acima do input com botão "Trocar" (mesmo padrão do titular).

2. Remover o carregamento antecipado de `incPacientes` (o `useEffect` que consulta `pacientes` ao abrir o diálogo) — a busca passa a ser sob demanda pelo próprio componente. Também limpar o estado `incPacientes`/`incLoadingPac` que ficam sem uso.

3. Manter os campos **Parentesco** e **Tipo** como estão, e o botão **Incluir** continua chamando `confirmarIncluir` com `incPaciente`.

Nenhuma outra tela é afetada. Não há mudança de banco.