-- 1. Create the auth user (Supabase internal table)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role
)
VALUES (
  gen_random_uuid(),
  'g@arcandanchor.com',
  crypt('admin!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Your Name"}',
  'authenticated'
);

-- 2. Set super_admin on the auto-created profile
UPDATE profiles
SET
  super_admin = TRUE,
  full_name   = 'Alex'
WHERE email = 'g@arcandanchor.com';