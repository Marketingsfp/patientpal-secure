## Ícones duplicados no menu lateral

Encontrei 3 conflitos:

1. **`Stethoscope`** está em **Médicos** e **Especialidades**.
2. **`Users`** está em **Clientes** e **Equipe**.
3. **`Bell`** (Recepção) e **`BellRing`** (Alertas Enfermagem) — quase idênticos visualmente.

## Substituições propostas

| Item | Antes | Depois |
|---|---|---|
| Especialidades | `Stethoscope` | `HeartPulse` |
| Clientes | `Users` | `Contact` |
| Recepção / Filas | `Bell` | `ConciergeBell` |

Mantenho:
- Médicos → `Stethoscope`
- Equipe → `Users`
- Alertas Enfermagem → `BellRing`

## Onde mexer

- `src/components/app-shell.tsx` — trocar os 3 ícones em `navRows` e atualizar o `import` do `lucide-react`.
