alter table client_configs
  add constraint uq_client_config unique (client_id, config_type);
