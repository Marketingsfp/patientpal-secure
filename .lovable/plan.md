## Objetivo

Remover a barra de abas (`SectionTabs` com `RH_TABS`) das páginas do módulo **RH**, já que o menu lateral já lista os mesmos submenus — a duplicação polui a tela.

## Escopo (apenas RH)

Arquivos afetados:

- `src/routes/_authenticated/app.hr-ponto.tsx`
- `src/routes/_authenticated/app.hr-ferias.tsx`
- `src/routes/_authenticated/app.hr-holerites.tsx`
- `src/routes/_authenticated/app.treinamentos.tsx`
- `src/routes/_authenticated/app.lms-admin.tsx`
- (Contratos do RH — hoje não usa `SectionTabs`, então nada a mudar)

Em cada arquivo:

1. Remover o import de `SectionTabs`, `RH_TABS`, `RH_META` de `@/components/section-tabs`.
2. Remover o wrapper `*PageWithTabs` e apontar o `component:` da rota diretamente para o componente da página.
3. Manter todo o restante da tela (título interno "Bater ponto", "Férias", etc.) intacto.

## Fora do escopo

- Não mexer em Marketing, Serviços, Segurança & Compliance ou outras seções que também usam `SectionTabs` — o pedido é só sobre o RH. Se quiser aplicar a mesma limpeza nessas outras seções, me avise depois.
- Manter `RH_TABS`/`RH_META` exportados em `section-tabs.tsx` (ainda usados como referência de módulos e não custa nada manter), sem remover o export para evitar efeito colateral.

## Validação

- Verificar visualmente `/app/hr-ponto`, `/app/hr-ferias`, `/app/hr-holerites`, `/app/treinamentos`, `/app/lms-admin` — a faixa de abas deve sumir, e o menu lateral continua sendo a navegação.

## Clínica-alvo

Ajuste é puramente de UI (frontend), sem regra por clínica — aplicar globalmente para todas as clínicas. Confirma?
