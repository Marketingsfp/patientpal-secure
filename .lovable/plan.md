## Diagnóstico

Existem **dois** diálogos "Cadastro rápido de paciente" no projeto:

1. `src/components/pacientes/quick-patient-dialog.tsx` — componente reutilizável (botão "Cadastrar e selecionar"). Já recebeu o botão de foto na alteração anterior.
2. `src/routes/_authenticated/app.agenda.tsx` (linhas 5734‑5821) — **diálogo inline** da tela de Agenda (botão "Cadastrar", verde). Este é o que aparece no print enviado, e **não** foi alterado antes.

O botão "Tirar foto (reconhecimento facial)" só existe no diálogo 1, por isso não aparece no fluxo mostrado no print.

## O que vou alterar

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`.

- Importar `FaceCaptureDialog` e o ícone `Camera` (se ainda não estiver importado).
- Adicionar estado local: `faceOpen` e `descritorFace` (Float32Array | null).
- Inserir, logo acima do `DialogFooter` do "Cadastro rápido" (após o campo E-mail, linha ~5810), o mesmo bloco do botão usado em `quick-patient-dialog.tsx`:
  - Quando não há descritor: "📷 Tirar foto (reconhecimento facial)".
  - Quando já capturado: "✓ Foto capturada — refazer" + link "remover".
- Renderizar `<FaceCaptureDialog>` dentro do mesmo Dialog, controlado por `faceOpen`, gravando o descritor em `descritorFace` no `onCaptured`.
- Após o `insert` em `pacientes` dentro de `cadastrarPacienteRapido`, se `descritorFace` estiver preenchido, gravar em `paciente_biometria` (mesmo shape usado em `quick-patient-dialog.tsx`: `paciente_id`, `descritor` como `Array.from(descritorFace)`, `clinica_id`). Em caso de falha, exibir `toast.warning("Paciente salvo, mas a foto não foi registrada.")` — não bloquear o cadastro.
- Resetar `descritorFace` e `faceOpen` quando o diálogo fechar (junto com o reset já existente de `novoPac`).

Nenhuma alteração em banco, RPC ou em outros arquivos.

## Antes / Depois

- **Antes:** No cadastro rápido a partir da Agenda, não havia como capturar a foto — o paciente ficava sem biometria e o totem não reconhecia.
- **Depois:** O mesmo botão que existe no `QuickPatientDialog` também aparece na Agenda, e a foto é vinculada em `paciente_biometria` no mesmo passo do cadastro.

## Validação

- Typecheck (`tsgo --noEmit`).
- Abrir o modal via Agenda e confirmar visualmente que o botão aparece entre "E-mail" e o rodapé, com o mesmo comportamento (captura + toast + refazer/remover).

## Fora do escopo

- Não vou unificar os dois diálogos em um único componente agora (é uma refatoração maior e o pedido é só fazer o botão aparecer).
- Não vou mexer no diálogo do Wizard de novo agendamento (`novo-agendamento-wizard.tsx`) — se você quiser o botão lá também, me avise que incluo no mesmo passo.
