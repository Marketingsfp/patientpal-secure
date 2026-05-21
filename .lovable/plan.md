## Objetivo

Unificar de vez clínica + unidade física: remover a aba **Unidades físicas** de `/app/unidades` e mover todos os campos do formulário de unidade física para o diálogo de **Nova/Editar clínica**.

## Mudanças

### 1. `src/routes/_authenticated/app.unidades.tsx`
- Remover `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` e o componente `UnidadesFisicasTab` inteiro (e imports não usados: `Table*`, `Search`, tipo `Unidade`).
- A página passa a renderizar diretamente `ClinicasTab` (renomear para o componente da página), mantendo header **Unidades** + subtítulo ajustado ("Cadastre suas unidades com endereço e geolocalização para bater ponto").
- Expandir o `Dialog` de clínica (`DialogContent` com `max-w-2xl`) para incluir os campos da foto, além dos atuais (Nome, CNPJ):
  - **Endereço** (linha inteira)
  - **Cidade / UF / CEP** (grid 3 colunas — UF maxLength 2, uppercase)
  - **Telefone**
  - Seção **Geolocalização (para bater ponto)** com botão **Usar minha localização** (usa `navigator.geolocation`)
    - **Latitude / Longitude / Raio (m)** (grid 3 colunas, raio default 200)
  - Checkbox **Ativa**
- Estado `form` ganha: `endereco`, `cep`, `latitude`, `longitude`, `raio_metros` (string, default "200"), `ativo` (bool, default `true`). `cidade`/`estado`/`telefone` já existem.

### 2. Persistência
- **Criação:** continuar chamando RPC `criar_clinica_com_admin` (com os args atuais: `_nome`, `_cnpj`, `_telefone`, `_cidade`, `_estado`). Logo após receber o `clinicaId`, fazer um `update` em `public.clinicas` com os campos extras (`endereco`, `cep`, `latitude`, `longitude`, `raio_metros`, `ativo`) — assim não precisa alterar a RPC.
  - Se algum desses campos não existir na tabela `clinicas`, criar migration `ALTER TABLE public.clinicas ADD COLUMN ...` (endereço text, cep text, latitude numeric, longitude numeric, raio_metros integer default 200, ativo boolean default true). Verificar via schema antes; pedir aprovação da migration se necessário.
- **Edição:** `update` direto em `clinicas` com todos os campos (já é o padrão atual, só adicionando os novos).
- `openEdit` carrega também os novos campos do `select`.

### 3. Rota antiga `app.unidades` (página de unidades físicas separada)
- Não existe mais rota separada — o conteúdo de unidades físicas é descartado da UI. A tabela `unidades` no banco **permanece intacta** (nenhuma migration de drop). Apenas a UI deixa de expor.
- Se houver outros lugares no app que leem `unidades` para bater ponto (ex.: `app.hr-ponto.tsx`), eles continuam funcionando — fora do escopo desta mudança.

### 4. `PendenciasAlert` / outros
- Sem mudanças. O atalho já aponta para `/app/unidades`.

## Arquivos

- `src/routes/_authenticated/app.unidades.tsx` — reescrita removendo Tabs e expandindo dialog de clínica.
- (condicional) Migration adicionando colunas em `public.clinicas` se faltarem.

## Pergunta antes de implementar

A tabela `public.clinicas` provavelmente **não** tem ainda as colunas `endereco`, `cep`, `latitude`, `longitude`, `raio_metros`, `ativo`. Posso confirmar via schema e, se faltarem, rodar uma migration para adicioná-las? Sem essas colunas o salvar dos novos campos vai falhar.
