# Endereço de acesso próprio por clínica (teste: CLINICA CONSULTA HOJE)

Classificação: dados + permissão/RLS + visual/UX. Área sensível (login e seleção de unidade). Sem publicar.

## O que muda para quem usa
- Entrando por `sistema.clinicaX.com.br` (depois de cadastrado) ou por `/login?clinica=<id>`, a tela de login mostra logo, nome e cores da clínica: "Acesso ao sistema – CLINICA CONSULTA HOJE". A aba do navegador também mostra o nome e, se houver, a logo.
- Depois do login, a unidade ativa já vem nessa clínica **se o usuário tiver acesso a ela**. Se não tiver, aparece um aviso claro e ele escolhe entre as unidades que já tem. Nenhuma permissão nova é liberada.
- Endereços sem cadastro (patientpal-secure.lovable.app, prévia, localhost) ficam exatamente como hoje.
- Configurações → nova tela "Domínios de acesso" (só admin): listar, adicionar e remover endereços de cada clínica, com a instrução de conectar o domínio em Project Settings → Domains e não marcar nenhum como primário.

## Banco (uma migração nova, aditiva)
- Tabela `clinica_dominios`: id, clinica_id (FK clinicas), hostname (único, gravado em minúsculas sem `www.` e sem porta — normalizado por gatilho), ativo (padrão true), created_at.
- GRANT só para `authenticated` e `service_role`; RLS ligado; leitura/escrita apenas para admin (admin da clínica via `has_role`/padrão existente, ou admin da plataforma).
- Função `clinica_por_dominio(_hostname text)` SECURITY DEFINER, `search_path = public`, executável por anon: devolve só clinica_id, nome, logo_url, primary, accent (de `clinicas.branding`), apenas se o domínio estiver ativo. Nada de CNPJ, token ou outros campos.
- O fallback `?clinica=<id>` reutiliza a função pública já existente `resolver_clinica_publica` (só se ela devolver apenas dados não sensíveis; caso contrário, uma segunda função irmã com o mesmo retorno restrito).

## Telas
- Novo módulo pequeno "clínica do acesso": lê `window.location.hostname` (ou `?clinica=` na URL de login) depois de carregar a página, consulta uma vez e guarda na sessão do navegador (sessionStorage).
- `login.tsx`: cabeçalho com marca/cores da clínica quando houver; sem mudança no fluxo de senha.
- `use-clinica.tsx`: na primeira carga após login, se houver clínica do acesso e ela estiver nas memberships do usuário, seleciona-a; se não estiver, mostra aviso e mantém a escolha normal.
- Título/favicon da aba trocados no navegador quando houver clínica do acesso.
- Nova rota `app.configuracoes.dominios.tsx` + link no menu de Configurações (só admin).

## Links de autenticação
- Conferido: login (`/reset-password`) e cadastro (`/app`) já usam `window.location.origin`. Vou só reconferir `reset-password.tsx` e eventuais outros pontos; nenhum endereço fixo de autenticação foi achado.

## Fora do escopo
- Não cadastro domínio real, não conecto DNS, não publico, não altero dados existentes nem outras clínicas.
- Links fixos de SEO/sitemap e webhook (patientpal-secure.lovable.app) continuam como estão.

## Validação prevista
- Tipos + testes existentes; teste novo da normalização do endereço.
- Prévia: `/login?clinica=e9e41341-0e53-4216-8284-caeeaf6fb887` mostra a marca; login com usuário com e sem acesso à clínica.

## Ponto para confirmar
- "Admin" para a tela de domínios: proponho admin ativo da própria clínica **ou** admin da plataforma. Se quiser só admin da plataforma, avise.
