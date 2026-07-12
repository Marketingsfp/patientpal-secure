---
name: URL de publicação imutável
description: A URL Lovable do projeto (patientpal-secure.lovable.app) nunca deve ser alterada em nenhuma circunstância
type: constraint
---
A URL de publicação deste projeto é **fixa**: `https://patientpal-secure.lovable.app`.

**Proibido:**
- Passar o parâmetro `slug` na ferramenta `preview_ui--publish`.
- Sugerir renomear a URL Lovable, mesmo em mensagens do tipo "você pode renomear se quiser".
- Alterar o slug em `publish_settings`.
- Recomendar mudança de URL em nenhuma comunicação — nem como opção, nem como sugestão.

**Permitido:**
- Conectar domínio customizado (isso não altera a URL Lovable subjacente).
- Publicar/republicar mantendo a mesma URL.

**Why:** a URL já está divulgada, indexada e integrada com outros sistemas. Alterar quebra links externos, integrações e materiais publicados.

**How to apply:** ao publicar, chamar `preview_ui--publish` sem argumentos. Ao reportar sucesso, mencionar apenas visibilidade e domínio customizado — nunca "renomear URL".
