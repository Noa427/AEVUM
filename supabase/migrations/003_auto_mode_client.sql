-- Mode auto par client (activé par défaut)
alter table clients add column if not exists auto_mode boolean not null default true;
