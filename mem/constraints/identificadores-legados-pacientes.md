---
name: Identificadores legados de pacientes são imutáveis
description: codigo_prontuario, codigo_prontuario_anterior, numero_pasta e demais números importados do sistema antigo são somente-leitura em qualquer feature nova.
type: constraint
---
Campos protegidos em `public.pacientes`:
- `codigo_prontuario`
- `codigo_prontuario_anterior`
- `numero_pasta`
- qualquer outro identificador legado importado (número da ficha, número do prontuário antigo, etc.)

Permitido: ler, exibir, pesquisar, filtrar, localizar paciente.

Proibido sem aprovação explícita do usuário:
- UPDATE / upsert / normalização / renumeração / regex de correção
- triggers, migrations ou scripts que escrevam nesses campos
- deduplicação/merge automático que altere ou reescreva esses campos
- gerar novo número para paciente já importado

**Why:** dados históricos oficiais da clínica, já conferidos, usados como referência operacional pela equipe. Qualquer alteração quebra rastreabilidade com o sistema anterior e prontuário físico.

**How to apply:** em Clientes V2, importações, deduplicação e qualquer feature de pacientes — tratar esses campos como read-only. `marcarDuplicados` e afins podem usá-los só como hint visual, nunca como chave de escrita.