-- ============================================================
-- SC CENTRAL — NOVOS NÍVEIS DE ACESSO DO PAINEL
-- Administrador / Editor / Cadastrador
-- Execute UMA VEZ no SQL Editor do Supabase.
-- ============================================================

BEGIN;

-- Converte os papéis antigos, caso existam.
UPDATE public.users
SET role = 'editor',
    updated_at = NOW()
WHERE role = 'manager';

UPDATE public.users
SET role = 'cadastrador',
    updated_at = NOW()
WHERE role = 'attendant';

-- Atualiza a regra da coluna role.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','editor','cadastrador'));

COMMENT ON COLUMN public.users.role IS
  'Nível do painel SC Central: admin, editor ou cadastrador.';

COMMIT;

-- Validação.
SELECT
  role,
  COUNT(*) AS usuarios
FROM public.users
GROUP BY role
ORDER BY role;
