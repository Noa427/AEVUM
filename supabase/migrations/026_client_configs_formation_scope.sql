-- Une config par (client_id, config_type, formation_id) : les templates (template_*)
-- deviennent personnalisables par formation, le reste (piliers/addons/sender_name...)
-- reste global au client (formation_id NULL).

-- a) Normaliser : seuls les types "template_*" restent rattachés à une formation
UPDATE client_configs
SET formation_id = NULL
WHERE config_type NOT LIKE 'template_%';

-- b) Ancienne contrainte (008) qui ignorait formation_id
ALTER TABLE client_configs DROP CONSTRAINT IF EXISTS uq_client_config;

-- c) Colonne générée : NULL -> sentinel fixe, clé stable pour l'unicité (NULL <> NULL en SQL)
ALTER TABLE client_configs
  ADD COLUMN formation_key UUID GENERATED ALWAYS AS
    (COALESCE(formation_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

-- d) Une config par (client, type, formation) ; NULL = bucket global partagé
ALTER TABLE client_configs
  ADD CONSTRAINT uq_client_config_formation UNIQUE (client_id, config_type, formation_key);
