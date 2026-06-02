-- Add UUID column to student_profiles table
ALTER TABLE student_profiles
  ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE student_profiles
  ADD CONSTRAINT student_profiles_id_unique UNIQUE (id);

CREATE INDEX idx_student_profiles_id ON student_profiles(id);
