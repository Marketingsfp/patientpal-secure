# Análise: domínios por clínica (somente leitura, nada alterado)

## A) O que depende do endereço do app

| Ponto | Como monta o endereço | Muda com o novo domínio? |
|---|---|---|
| Webhook WhatsApp (Meta) `/api/public/whatsapp/<clinica>` | Tela da Nina mostra URL fixa `patientpal-secure.lovable.app` | Não quebra. Meta continua chamando o lovable.app (segue conectado). Não trocar |
| Webhook NFS-e (Focus) `/api/public/focusnfe.webhook` | Cadastrado no provedor; código lê o próprio pedido | Não quebra |
| Rotinas automáticas (confirmação de consultas, backup, Francisco, watchdog/carga da Nina) | URL fixa `project--9cab...lovable.app` gravada no banco | Não quebra (endereço fixo do projeto) |
| Painel TV (Lumen) | URL fixa externa `display-mate.lovable.app` | Não muda |
| API v1 de integração / intake (site, Consulta Hoje, SFP) | Chamadores externos com chave; CORS `*` | Não quebra |
| Voz da Nina (`/api/nina-ligacao`) | Exige origem = mesmo endereço da página | Funciona em qualquer domínio conectado |
| TTS / vozes | CORS `*` | Não muda |
| Recuperar senha | `window.location.origin` | Funciona, se o novo domínio estiver na lista de retorno permitida do login (não confirmei essa lista; conferir antes) |
| Confirmar cadastro (signup) | `window.location.origin` | Idem |
| Convites / OAuth (Google etc.) | Não há no código | Nada a fazer |
| Link do contrato `/p/contrato/<token_publico>` | `window.location.origin` | Paciente recebe o domínio de quem gerou. Funciona; com a trava do item B, rota pública não pode ser bloqueada |
| QR "foto pelo celular" (orçamento), certificado `/verificar`, link do totem | `window.location.origin` | Funciona; idem acima |
| Paytime/PIX, Evolution, 55PBX | Não achei URL de retorno no código (só citações em contratos) | Nada a fazer pelo que foi encontrado; confirmar no painel dos provedores |
| SEO: sitemap, canonical/og de `/`, `/login`, `/signup`, `/privacy`, `/lp/*` | URL fixa lovable.app | Não quebra; buscadores tratam o novo domínio como cópia do lovable.app (aceitável para tela interna) |
| Iframe/embed do agendamento | Nenhum bloqueio de iframe encontrado | Não muda |

Resumo: nada quebra. Único ponto a conferir antes: lista de endereços de retorno permitidos do login precisa incluir `https://sistema.clinicaconsultahoje.com.br/**`.

## B) Restringir acesso por domínio (proposta, não implementar)

O endereço é controlado pelo navegador, então isso é organização de uso, não segurança. O isolamento real continua nas regras do banco.

1. Domínio de clínica: depois de entrar, se o usuário não tem vínculo ativo com a clínica do domínio, sair e mostrar "Este endereço é da clínica X". Se tem, seletor de unidade travado nela.
2. lovable.app só para admins: depois de entrar, quem não é admin vê aviso com o endereço da sua clínica e é desconectado.

Como fazer com segurança:
- Decisão no servidor (função que recebe o endereço e responde "pode entrar / travar em X"), usada pela tela; nunca liberar dados por causa do domínio.
- Gerar no servidor o recorte da clínica ativa a partir do domínio (opcional, segunda etapa) para que o filtro das telas não dependa só do navegador.
- Exceções obrigatórias: rotas públicas (`/p/*`, `/verificar`, foto pelo celular, totem/painel, agendamento pelo site, `/api/*`), prévia e localhost.
- Ligar por interruptor, começando só com a Consulta Hoje.

Riscos:
- Links de e-mail (senha) caem no domínio de quem pediu; se for o lovable.app e o usuário não for admin, fica bloqueado. Saída: tela de redefinir senha sempre liberada.
- Links já enviados a pacientes com lovable.app continuam funcionando (rotas públicas liberadas).
- Usuários de várias unidades: precisam usar o domínio de cada clínica ou ser admin. Clínicas sem domínio cadastrado (SFP, Menino Jesus) ficariam sem endereço próprio: a regra 2 só pode valer depois que todas tiverem domínio, senão a recepção delas fica sem acesso.
- Webhooks e rotinas automáticas não passam pela tela, não são afetados.
- Lovable.app é o endereço que a Meta e os provedores usam; não pode sair do ar.

## Pontos para decidir
- "Admin" no lovable.app: admin de plataforma só, ou também admin de clínica? Sugestão: ambos.
- Regra 2 só depois de todas as clínicas terem domínio próprio?
