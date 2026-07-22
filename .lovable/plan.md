## Objetivo

Renomear rótulos do menu lateral do RH em `src/components/app-shell.tsx` — apenas texto exibido, sem mudança de rota, ícone ou permissão.

## Alterações

Em `src/components/app-shell.tsx` (linhas 182–187):

- Grupo `"RH"` → `"Recursos Humanos"`
- `"RH - Ponto"` → `"Marcação de ponto"`
- `"RH · Contratos"` → `"Contratos"`
- `"RH · Férias"` → `"Férias"`
- `"RH · Holerites"` → `"Holerites"`

Também ajustar as duas guardas (linhas 529 e 711) que comparam `row.label === "RH"` para usar `"Recursos Humanos"`, mantendo o comportamento atual do subsistema "Gestão de Pessoas".

## Fora do escopo

- Não altero rotas, ícones, permissões nem os títulos internos das páginas (ex.: "Bater ponto").
- Não mexo em `RH_TABS`/`RH_META` de `section-tabs.tsx`.

## Clínica-alvo

Mudança puramente de UI (rótulos do menu), sem regra por clínica — aplicar globalmente. Confirma?
