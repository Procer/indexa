-- Agrega rol de administrador a profiles, para reemplazar el ADMIN_SECRET
-- compartido por login real (Supabase Auth) + chequeo de rol.
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
