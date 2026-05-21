alter table clients
  add column if not exists client_email text,
  add column if not exists password_hash text,
  add column if not exists must_change_password boolean default true;
