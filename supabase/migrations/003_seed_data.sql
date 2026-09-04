-- 003_seed_data.sql
-- Seed departments for StreetVoice

INSERT INTO departments (name, keywords, contact_info) VALUES
  ('Water & Sanitation', ARRAY['water','sewage','drainage','pipeline'], 'water@streetvoice.pk'),
  ('Electricity', ARRAY['electricity','power','outage','transformer','wire'], 'electricity@streetvoice.pk'),
  ('Roads & Infrastructure', ARRAY['road','pothole','bridge','streetlight'], 'roads@streetvoice.pk'),
  ('Sanitation & Waste', ARRAY['garbage','trash','waste','cleaning'], 'waste@streetvoice.pk'),
  ('General/Unclassified', ARRAY[]::text[], 'general@streetvoice.pk');
