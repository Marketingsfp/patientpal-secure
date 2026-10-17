# Área do Paciente — recuperação e validação de 17/10/2026

## Antes / Depois
- A fase 2 existia parcialmente no banco e estava ausente das telas. Recuperados seletivamente arquivos ausentes e trechos do commit `279405b`, sem checkout, reset, reversão ou reaplicação da migração antiga.
- Documentos liberados, financeiro somente leitura e resumo inicial voltaram ao portal.
- Anexos/fotos mantêm tipos `anexo` e `foto`; finalidade independente `interno`/`clinico`, interno por padrão. A equipe classifica explicitamente; nenhum nome ou extensão determina finalidade clínica.
- Pedidos de exame possuem histórico próprio, catálogo ou texto livre, médico/equipe, vínculo opcional ao agendamento, PDF privado gerado no servidor, liberação e cancelamento sem apagar o pedido.
- A ficha do paciente tem **Documentos e anexos**. A tela do médico tem **Opções → Pedido de exame**.
- Downloads do paciente revalidam domínio, consentimento, sessão, paciente, clínica, finalidade, status e liberação em cada abertura; validade máxima de cinco minutos. Não entregam endereços privados do armazenamento ao paciente.

## Migração e condição dos uploads
- Aplicada `drizzle/migrations/0035_portal_anexos_clinicos_pedidos_exame.sql`, equivalente ao SQL aprovado, exceto espaço final acrescentado pela ferramenta.
- Escritor encontrado: `ArquivosPacienteDialog` em `src/components/medico/paciente-dialogs.tsx`. Caminho exato `{clinica_id}/{paciente_id}/{tipo}/{uuid}.{ext}`.
- A pesquisa no código atual e no commit de referência não encontrou outros escritores de `paciente_arquivos` em OS ZAP, Nina, importações ou funções do servidor. Isso não comprova processos externos ao repositório.
- A validação de caminho foi restrita à classificação clínica/liberação, preservando inserts internos em formato legado e por `service_role` sem `auth.uid()`.
- A auditoria aceita ator nulo para upload interno sem usuário; liberação continua exigindo responsável válido. Testado com a migração real em PostgreSQL isolado, incluindo os dois gatilhos de auditoria.
- Tabelas alteradas: `paciente_arquivos`, `portal_links`; nova `pedidos_exame`. Comentário de configuração atualizado em `portal_paciente_config`; privilégios de chamada direta dos três gatilhos antigos fechados como previsto no SQL aprovado.
- `documentos_emitidos` e `paciente_arquivos` tinham zero registros na reconferência anterior à migração. Nenhum backfill ou cópia por inferência realizada.
- Nenhuma cobrança, pagamento, nota fiscal, prontuário ou identificador legado foi alterado. Nenhuma publicação realizada. O banco da prévia é compartilhado com o site publicado; a migração já afeta ambos.

## Validação executada
- `bun test src/lib/portal-paciente`: **37 testes aprovados** em três arquivos.
- Testes abrangem expiração exatamente em cinco minutos, mesma sessão, isolamento dos dados do paciente, RLS dos pedidos, tipos internos, carimbo padrão vazio, upload interno sem usuário com caminho legado, vínculo cruzado recusado, liberação/retirada, imutabilidade e cancelamento, seis papéis autorizados.
- Lint nos arquivos alterados: zero erros; dois avisos já existentes em exports do diálogo médico.
- Sinal automático da prévia: `build OK`.
- Navegação autenticada até Configurações → Área do Paciente: a conta disponível recebeu **Acesso negado**. A proteção foi preservada, não contornada.
- Endpoint de download recusou link inválido; navegações observadas não produziram erros de página.
- **Não validado ponta a ponta:** emissão real do PDF, classificação/liberação por conta autorizada e acesso por paciente fictício. Nenhum paciente real foi usado e nenhum dado de teste foi gravado no banco compartilhado.
- Não executado typecheck manual: verificação automática da prévia foi utilizada. Testes unitários não substituem validação de tipos ou o fluxo completo.

## Como testar na prévia
Use uma conta com acesso às Configurações e um paciente adulto **fictício**, com CPF válido, cadastro único na clínica e e-mail fictício. Não alterar dados reais. A criação de dados de teste no banco compartilhado deve ser autorizada pela clínica.

1. Selecione Consulta Hoje. Em **Configurações → Área do Paciente**, confira portal ligado e todos os tipos de liberação automática desligados.
2. Em **Pacientes → ficha → Documentos e anexos**, envie PDF/imagem fictício com finalidade **Interno / administrativo**. Confira que não há botão de liberação.
3. Classifique somente o arquivo clínico fictício como **Clínico** e clique **Liberar ao paciente**. Veja data/responsável.
4. Em **Pedidos de exame**, escolha profissional, acrescente exame do catálogo ou texto livre e emita. Baixe o PDF para conferir o conteúdo; libere o pedido.
5. Abra a Área do Paciente na prévia com `?clinica=<identificador da clínica selecionada>`. No domínio próprio a clínica vem do endereço, sem esse parâmetro.
6. No portal, informe o CPF fictício e clique **Receber código** para abrir o campo de código. **Depois disso**, em outra aba da equipe, gere o **Código de teste** para esse mesmo paciente em Configurações. Não solicite novo código após gerar: o novo pedido substitui o código anterior.
7. Digite o código, aceite o termo e confira **Documentos**, **Financeiro** e o resumo inicial. Apenas documentos liberados devem aparecer; financeiro não permite pagar.
8. Abra um documento. Retire sua liberação pela equipe e tente abrir novamente o mesmo endereço: deve recusar imediatamente. A lista atualiza ao retornar à aba ou em até 15 segundos.
9. Cancele o pedido e confira que permanece na ficha como cancelado, mas não está mais acessível ao paciente. Outro navegador/sessão não deve abrir o endereço gerado; após cinco minutos, também deve recusar.
10. Confira os eventos em **Configurações → Área do Paciente → Últimos acessos**. Não apague auditoria ou histórico clínico dos testes; a retirada dos dados fictícios depende de autorização e procedimento seguro da clínica.

## Pendências
- Validação completa com conta autorizada, paciente fictício e autorização para gravações de teste no banco compartilhado.
- Configuração do e-mail e revisão jurídica do termo permanecem pendentes, separadas desta entrega.
- Se o PDF for enviado e o registro do pedido falhar, pode restar um objeto privado sem registro; ele não é liberado nem aparece no portal. Não removido automaticamente para respeitar a governança de exclusões.