Aplicar os 6 ajustes de layout em `src/routes/_authenticated/app.fluxo.tsx`:

1. **Grid fixo `grid-cols-7`** em qualquer largura, com `gap-2 sm:gap-3`. Remove os breakpoints que quebravam em 2/3/4 colunas.

2. **Escala fluida mobile-first** de paddings e fontes:
   - Coluna: `p-1.5 sm:p-2`
   - Card: `p-1.5 sm:p-2.5`, `space-y-1 sm:space-y-1.5`
   - Nome: `text-[11px] sm:text-[12px] truncate`
   - Hora: `text-[9px] sm:text-[10px]`
   - Procedimento/médico: `text-[10px] sm:text-[11px]`

3. **Rótulo curto por etapa** (`labelCurto`): "Aguard.", "Recep.", "Caixa", "Triagem", "Atend.", "Exame", "Fim". Alternar com `sm:hidden` / `hidden sm:inline` no cabeçalho da coluna.

4. **Botões compactos no mobile**: barra `gap-0.5 sm:gap-1`, botões `h-6 px-1 sm:px-1.5`, textos "Chamar/Finalizar/Avançar" com `hidden sm:inline` (ícone sempre visível).

5. **Remover restos de scroll horizontal**: tirar qualquer `min-w-[...]`, `overflow-x-auto`, `snap-x` do container das colunas.

6. **Confirmar sem scroll interno nas colunas**: garantir que o corpo da coluna não tem `max-h`/`overflow-y` — a página inteira é quem rola.

Escopo: apenas `src/routes/_authenticated/app.fluxo.tsx`. Nenhuma mudança de lógica, dados ou realtime.