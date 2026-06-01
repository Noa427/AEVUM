CREATE TABLE student_profiles (
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  card_exp TIMESTAMPTZ,
  last_lms_activity TIMESTAMPTZ,
  phone TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (client_id, email)
);

CREATE INDEX idx_student_profiles_card_exp
  ON student_profiles(client_id, card_exp)
  WHERE card_exp IS NOT NULL;

CREATE INDEX idx_student_profiles_lms
  ON student_profiles(client_id, last_lms_activity)
  WHERE last_lms_activity IS NOT NULL;
