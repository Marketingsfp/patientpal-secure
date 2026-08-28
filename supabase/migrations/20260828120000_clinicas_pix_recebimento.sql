-- Dados de recebimento por PIX da clínica.
--
-- Servem para montar o QR Code de cobrança das mensalidades do Cartão
-- Benefícios. Ficam em `clinicas` porque são dados de cadastro da própria
-- clínica, do mesmo naipe de CNPJ e endereço.
--
-- NÃO são segredo: a chave PIX existe justamente para ser mostrada a quem vai
-- pagar, e é lida pelo navegador na tela de pagamento. Por isso não vai para
-- `integration_secrets` e não precisa de policy nova — as policies de
-- `clinicas` já limitam a leitura aos membros da clínica.
--
-- As duas colunas são opcionais. Sem elas preenchidas, o pagamento por PIX
-- continua funcionando como antes; apenas não sai o QR Code.

ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS pix_beneficiario text;

COMMENT ON COLUMN public.clinicas.pix_chave IS
  'Chave PIX que recebe (CNPJ, e-mail, telefone ou chave aleatória). Usada no campo 01 do BR Code.';

COMMENT ON COLUMN public.clinicas.pix_beneficiario IS
  'Nome exibido no aplicativo de quem paga, até 25 caracteres. Em branco, usa clinicas.nome.';
