# Componente AppointmentFormModal (isolado)

Criar um modal reutilizável de agendamento, puramente apresentacional, sem tocar na Agenda atual.

## O que será criado

**1. `src/components/agenda/appointment-form-modal.tsx`**

Props: `isOpen`, `onClose`, `initialData?` (opcional). Título muda para "Novo Agendamento" ou "Editar Agendamento" conforme `initialData`.

- Dialog shadcn `max-w-xl`, corpo com rolagem interna.
- Header com fundo `bg-gradient-to-b from-slate-50 to-transparent`, título e descrição discreta.
- Grupos em containers `bg-slate-50/50 rounded-xl p-4 border`:
  1. **Orçamento** — "Nº do orçamento" (Input) + botão "Buscar".
  2. **Paciente** — campo de busca de paciente + botão de ícone "adicionar paciente" (`UserPlus`); select "Tipo de atendimento" (Convênio / Particular).
  3. **Agendamento** — "Médico ou Exame" (Select), "Data e Hora" (`datetime-local`), "Serviço" (Select).
  4. **Observações** — Textarea.
- Rodapé fixo com borda superior: à esquerda "Aplicar Desconto" (ghost); à direita "Pagar + NFS-e" (outline), "Pagar/Imprimir" (verde esmeralda) e "Salvar" (primário).
- Estado local simples dos campos, iniciado por `initialData`; nenhuma chamada ao banco.

**2. `src/routes/_authenticated/app.dev-appointment-form.tsx`**

Rota de preview isolada com botão para abrir o modal e um exemplo de `initialData`, com `head()` próprio. Não entra no menu.

## Notas técnicas

- Reutiliza `Dialog`, `Input`, `Select`, `Textarea`, `Button`, `Label` de `src/components/ui`; ícones lucide-react.
- Textos em português; nenhuma alteração em `app.agenda.tsx`.
