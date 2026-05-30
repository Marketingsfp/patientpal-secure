# Vídeo: Fluxo completo do menu Agendas

Vídeo Remotion estilo agência (1920x1080, 30fps) demonstrando todas as etapas operacionais do menu **Agendas** do ClinicaOS — sem incluir a abertura de agenda. Renderizado como MP4 para `/mnt/documents/`.

## Direção criativa

- **Estética**: Tech Product — UI mockada limpa, layout asimétrico, cursor animado, microinterações snappy. Reaproveita a paleta e tipografia já existentes em `remotion/src/theme.ts` (`C` palette + Inter/DM Sans) para manter consistência com os outros vídeos do projeto (`agendamento`, `triagem`, `atendimento`).
- **Motion system**: entrada padrão spring snappy (`damping: 18`); transições entre cenas alternando `slide(from-right)` e `fade` (mesmo padrão de `AgendamentoVideo.tsx`); cursor guiado por `interpolate()`.
- **Duração-alvo**: ~28s, dividido em 7 cenas curtas (média 4s cada).

## Cenas (na ordem)

1. **Filtro de profissional + data** (~4s) — Header da Agenda, dropdown de Profissional abrindo e selecionando "Dr. Roberto Lima", depois Popover de Calendário avançando do dia atual para uma data futura. Grade da agenda re-renderiza com slots novos.
2. **Novo agendamento de paciente** (~5s) — Clique em "+ Novo", dialog abre, busca de paciente ("Maria Souza"), seleção de procedimento ("Consulta Cardiológica"), confirmação. Toast "Agendamento criado".
3. **Pagamento do paciente agendado** (~4s) — Linha do agendamento criado, ação "Pagamento" → LancamentoDialog com resumo (R$ 250,00), seleção PIX, "Pagamento aprovado". Status da linha muda para com ícone $.
4. **Check-in** (~3s) — Outra linha com status "Agendado"; menu de ações → "Check-in"; badge passa para "Confirmado" com brilho verde.
5. **Reagendamento** (~4s) — Linha existente → menu "Reagendar"; dialog mostra novo seletor de data/hora; nova data destacada; toast "Reagendado para 22/05 às 10:30".
6. **Pagamento de vários clientes (lote)** (~4s) — Checkboxes na grade selecionam 3 linhas; barra de ações em lote aparece com "Pagar selecionados"; LancamentoDialog agrupado mostra total R$ 750,00; aprovação coletiva.
7. **Histórico** (~4s) — Clique em um paciente abre painel/dialog de histórico; lista cronológica com atendimentos anteriores, valores pagos, status. Scroll suave revela 3 eventos.

Encerramento: fade rápido com logo/wordmark "ClinicaOS · Agendas".

## Arquivos a criar

```text
remotion/src/AgendasVideo.tsx              # composição principal (TransitionSeries)
remotion/src/scenes/AgendaSceneFiltro.tsx
remotion/src/scenes/AgendaSceneNovo.tsx
remotion/src/scenes/AgendaScenePagamento.tsx
remotion/src/scenes/AgendaSceneCheckin.tsx
remotion/src/scenes/AgendaSceneReagendar.tsx
remotion/src/scenes/AgendaSceneLote.tsx
remotion/src/scenes/AgendaSceneHistorico.tsx
remotion/scripts/render-agendas.mjs        # script de render headless → /mnt/documents/clinicaos-agendas.mp4
```

Atualizações:
- `remotion/src/Root.tsx`: registrar `<Composition id="agendas" ... durationInFrames=~840 />`.

Reaproveita `Frame`/`Cursor` (`remotion/src/components/Frame.tsx`) e tokens de `theme.ts`. Sem áudio (`muted: true`) para evitar dependência de TTS, como nos outros vídeos.

## Render

```bash
cd remotion && node scripts/render-agendas.mjs
# saída: /mnt/documents/clinicaos-agendas.mp4
```

Verificação: spot-check com `bunx remotion still` em 2-3 frames-chave antes do render final; depois confirmar tamanho/duração do MP4.

## Fora do escopo

- Abertura/configuração de agenda (explícito do usuário).
- Voiceover/áudio.
- Mudanças no app React real — somente arquivos sob `remotion/`.
