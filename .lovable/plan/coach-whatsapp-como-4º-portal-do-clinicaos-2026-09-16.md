# Coach WhatsApp como 4º portal do ClinicaOS

O pacote é grande (12,5 mil linhas de código, sendo 3.408 só na tela principal e 2.377 no roleplay). Fazer tudo de uma vez é arriscado, então proponho **3 etapas**, executando uma por vez e validando cada uma antes de seguir.

## Etapa 1 — Portal, permissões e tabelas (a que executo primeiro)

**Banco (uma migração nova, nada existente é tocado):**
- `coach_analises`, `coach_roleplay_sessions`, `coach_provas`, `coach_tempo_estudo`, `coach_desempenho_metas`, `coach_eventos_seguranca` — mesmas colunas da origem (incluindo `atendente` texto, para o histórico migrado casar pelo nome), mais `clinica_id` obrigatório apontando para as clínicas daqui e `user_id` opcional.
- `coach_config_clinica` — uma linha por clínica com scripts, tabela de serviços e configuração de voz. A tabela `clinicas` deste projeto **não** é alterada.
- Função `coach_registrar_tempo_estudo` (recriação da original).
- Regras de acesso no padrão daqui: tudo isolado por clínica; a atendente lê e grava só o que é dela; quem tem nível de gestão lê tudo da clínica.
- Dados **não** são importados — você importa depois.

**Código:**
- `src/lib/subsystem.ts`: novo portal `coach`, rótulo "Coach WhatsApp", home `/app/coach`, grupos "Treinamento", "Avaliações", "Configurações do Coach".
- `src/components/portal-launcher.tsx`: 4º cartão; grade passa a comportar 4 (2 colunas em tablet, 4 em tela grande).
- `src/lib/permissoes-rotas.ts`: rotas `/app/coach*` → módulo `coach`; `src/routes/_authenticated/app.perfis.tsx` ganha o módulo `coach` (leitura = atendente, escrita = gestor).
- `src/components/app-shell.tsx`: seção de menu do Coach, filtrada pelo portal como já acontece no OS ZAP.
- Rota `/app/coach` provisória, que já roteia por nível (gestor x atendente) com telas ainda vazias.
- `src/lib/coach/` recebe os utilitários sem interface: catálogos de serviços, plano de treinamento, tempo de estudo, proteção de tela, configuração de voz, variedade, data.

## Etapa 2 — Painel da gestora
Análise de conversa (texto colado e áudio), abas Progresso / Conversas / Perfis / Vozes, histórico, evolução por atendente, metas, editor de scripts e checklist, editor de vozes, eventos de segurança. Server function de análise usando o gateway de IA (a chave `LOVABLE_API_KEY` já existe aqui — confirmado).

## Etapa 3 — Trilha da atendente
TraineeHome, roleplay em texto e voz, prova e certificado, minha meta, meu histórico, endpoint de voz em `src/routes/api/coach/tts.ts` com o fallback local.

## O que é descartado (conforme combinado)
`AuthGate`, `useAcesso`, `acessos.functions.ts`, tabela `acessos`, logins `*@atendente.local`, tela "Acessos" e a rota de troca de senha do Coach. Login, perfis e clínica ativa passam a ser os do ClinicaOS; o papel "super" vira o super-admin daqui.

## Riscos e pontos de atenção
- **Nome da atendente**: o histórico antigo casa por nome em texto. Se o nome do usuário no ClinicaOS for diferente do nome usado no Coach, o histórico não aparece para ela. Vale conferir a lista de nomes antes da sua importação.
- **Volume da interface**: a tela principal da origem tem 3.408 linhas com tudo junto; vou quebrá-la em componentes ao trazer, preservando o fluxo.
- **Visual**: adapto ao design system daqui sem mudar o fluxo; algumas telas ficarão com aparência diferente da origem.
- **Nada do OS ZAP, Nina, agenda, financeiro, webhook ou tabelas existentes é alterado.**

## Validação de cada etapa
`bunx tsgo --noEmit`, suíte `permissoes-rotas`, build, e conferência visual (hub com 4 cartões, menu do portal, telas abrindo).
