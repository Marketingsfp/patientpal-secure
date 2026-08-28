-- ===================================================================
-- APLICAR NO SQL EDITOR DO LOVABLE — QR Code PIX do Cartão Benefícios
--
-- Cria os dois campos onde fica a chave PIX que RECEBE as mensalidades.
-- Sem eles, a tela de pagamento continua funcionando normalmente: o PIX
-- segue pelo caminho de sempre, só não aparece o QR Code.
--
-- É seguro rodar: só ACRESCENTA duas colunas opcionais, não altera nem
-- apaga nenhum dado existente. Rodar duas vezes não causa problema
-- (o IF NOT EXISTS cuida disso).
-- ===================================================================


-- PASSO 1 — criar os campos
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS pix_beneficiario text;

COMMENT ON COLUMN public.clinicas.pix_chave IS
  'Chave PIX que recebe (CNPJ, e-mail, telefone ou chave aleatória). Usada no campo 01 do BR Code.';

COMMENT ON COLUMN public.clinicas.pix_beneficiario IS
  'Nome exibido no aplicativo de quem paga, até 25 caracteres. Em branco, usa clinicas.nome.';


-- PASSO 2 — conferir que deu certo (deve devolver 2 linhas)
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'clinicas'
   AND column_name IN ('pix_chave', 'pix_beneficiario')
 ORDER BY column_name;


-- PASSO 3 — cadastrar a chave
--
-- Pode ser feito PELA TELA, que é o caminho recomendado:
--   Unidades › botão de editar a clínica › seção "Recebimento por PIX"
--
-- A seção só aparece depois do PASSO 1. Se preferir fazer por aqui, troque
-- os valores abaixo e tire o comentário. A cidade sai de `clinicas.cidade`,
-- que já está preenchida — confira antes, porque ela entra no QR Code.
--
-- UPDATE public.clinicas
--    SET pix_chave = 'COLOQUE A CHAVE AQUI',
--        pix_beneficiario = 'CLINICA MENINO JESUS'   -- até 25 caracteres
--  WHERE id = 'COLOQUE O ID DA CLINICA AQUI';


-- PASSO 4 — conferir o que ficou cadastrado
SELECT id, nome, cidade, pix_chave, pix_beneficiario
  FROM public.clinicas
 WHERE ativo
 ORDER BY nome;


-- -------------------------------------------------------------------
-- Para desfazer (remove os campos e a chave cadastrada):
--
--   ALTER TABLE public.clinicas
--     DROP COLUMN IF EXISTS pix_chave,
--     DROP COLUMN IF EXISTS pix_beneficiario;
-- -------------------------------------------------------------------
