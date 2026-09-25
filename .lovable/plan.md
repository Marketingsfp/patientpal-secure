# Integração de chamada de senhas com as TVs (LUMEN)

**Tipo:** integração externa + banco (senhas é área crítica) + uma tela nova de configuração.

## O que muda para a clínica
Quando alguém **chama** uma senha, o sistema avisa o LUMEN, que mostra a chamada nas TVs. Emitir, chamar e atender senhas continua igual. Se o LUMEN estiver fora do ar, a senha funciona normalmente e só o aviso à TV se perde.

## Escopo
- **Dentro:** 2 tabelas novas, 1 gatilho novo em `senhas`, 1 tela nova de configuração, a configuração inicial da POLICLINICA SAO FRANCISCO DE PAULA.
- **Fora:** nenhuma tela, regra, função ou tabela existente muda. Hoje `senhas` não tem nenhum gatilho, então não há nada para conflitar.

## 1. Banco (uma migração)
- `lumen_tv_config`: exatamente as colunas pedidas, índice único por `clinica_id`. Acesso (ler e gravar) só para quem administra a clínica (`can_manage_clinica`, mesma regra de `integration_secrets`). Nada para `anon`.
- `lumen_tv_envios`: `id`, `clinica_id`, `senha_id`, `codigo`, `enviado_em`, `request_id`. Só leitura, e só para quem administra a clínica. Só o gatilho grava.
- Gatilho `AFTER UPDATE OF status` em `senhas`, com condição `WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'chamada')`. Assim ele nem roda nas outras atualizações.
- Função `SECURITY DEFINER` com `search_path = public`, com tudo dentro de `EXCEPTION WHEN OTHERS THEN NULL`. Ela busca a configuração ativa (se não houver, sai sem fazer nada), monta `code`, `desk`, `patientName` (só se `enviar_nome`) e `screenPairCodes` (só se houver códigos), chama `net.http_post` com um limite de 5 s (é assíncrono e não segura a chamada) e grava em `lumen_tv_envios`.
- **Limpeza dos 30 dias:** uma rotina diária com `pg_cron`, que já está ligado. Fica fora do gatilho para não pesar na chamada da senha.
- O `pg_net` já está habilitado. A migração só usa `create extension if not exists`.

## 2. Botão de teste
Uma função de servidor, liberada só para quem administra a clínica, que lê a configuração pelo servidor e faz um POST de teste com o código `TESTE`. Ela mostra o status HTTP e a resposta. O token nunca volta para o navegador.

## 3. Tela
Nova aba **"TVs (LUMEN)"** dentro de Configurações → Painel/Totem, seguindo as abas que já existem. Ela tem:
- endereço;
- token em campo de senha (depois de salvo, só aparecem os últimos 4 caracteres, e o campo vazio mantém o token atual);
- códigos de pareamento;
- chave "Ativo";
- chave "Enviar nome do paciente", desligada por padrão, com um aviso destacado: "A TV fica na sala de espera; ligar isto mostra o nome do paciente para todos os presentes";
- botão "Enviar chamada de teste";
- lista dos últimos 20 envios, com o status da resposta vindo do `pg_net`.

O token só é lido pela função de servidor, que mostra ao navegador apenas os 4 últimos caracteres.

## 4. Configuração inicial
Insiro o registro da POLICLINICA SAO FRANCISCO DE PAULA com os valores informados (url, token, pair_codes nulo, enviar_nome falso, ativo).

## 5. Verificação (sem tocar em senha real)
Não vou mudar senhas finalizadas antigas: isso alteraria o histórico e poderia aparecer no painel de senhas de hoje. No lugar disso:
1. Crio uma senha de teste com o código `TESTE-LUMEN`, numa data antiga (2000-01-01), com o status "emitida", e passo para "chamada". Mostro a linha em `lumen_tv_envios` e a resposta no `pg_net` (esperado: HTTP 200 `{"ok":true,"screens":0}`).
   - **Atenção:** a TV do LUMEN pode chegar a exibir "TESTE-LUMEN" por um instante, se alguma tela já estiver ligada.
2. Aponto a url para um endereço inválido, repito com outra senha de teste e mostro que a atualização conclui normalmente. Depois volto a url correta.
3. Apago as senhas de teste e os registros de envio delas.

Mostro todos os resultados antes de dizer que está pronto. Nada é publicado.

## Riscos e como desfazer
- **Risco baixo:** o envio é assíncrono e qualquer erro é engolido.
- **Para desligar na hora:** desmarcar "Ativo" na tela.
- **Para desfazer tudo:** `drop trigger` em `senhas`.
- O token fica gravado no banco, como você pediu. Só administradores da clínica conseguem lê-lo.
