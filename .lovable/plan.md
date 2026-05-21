## Objetivo

Reorganizar o layout do `AppShell` movendo elementos da sidebar para o header superior fixo.

## Mudanças no header (`src/components/app-shell.tsx`)

O header superior (`<header>`) passará a conter, da esquerda para a direita:

1. **Nome do usuário** (avatar + nome) — atualmente fica no rodapé da sidebar, será movido para o início do header. Inclui o botão de sair (LogOut) ao lado.
2. **Logo da clínica** — atualmente exibida em um card branco no topo da sidebar, será movida para o header (tamanho reduzido, ex: `h-9`, dentro de um card branco compacto).
3. **Seletor de clínica** (Select "Consulta Hoje / Menino Jesus / São Francisco") — atualmente abaixo da logo na sidebar, será movido para o header ao lado da logo.
4. **Espaçador flexível** (`flex-1`).
5. **Sino de notificações** + avatar atual (mantidos como estão).

## Mudanças na sidebar

Remover da sidebar:
- O bloco do card branco com a logo da clínica.
- O `Select` de seleção de clínica (o `VoiceInput` permanece, ou também sobe? — assumindo que **permanece** na sidebar, já que o usuário não mencionou).
- O bloco do rodapé com avatar/nome/botão de sair.

A sidebar fica mais limpa: header com logo "ClinicaOS" + toggle collapse, busca por voz, e a navegação.

## Comportamento responsivo

- Em telas pequenas (quando a sidebar está colapsada), o nome do usuário no header pode truncar ou esconder apenas o texto, mantendo o avatar.
- Logo da clínica e seletor permanecem visíveis no header em todos os tamanhos.

## Não muda

- Cores das clínicas, lógica de `useClinica`, navegação, rotas, ou qualquer lógica de negócio.
- Apenas reposicionamento visual de componentes existentes.
