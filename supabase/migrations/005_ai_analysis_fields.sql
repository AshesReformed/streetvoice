-- 005_ai_analysis_fields.sql
-- Fields for the one-call AI analyzer (Gemini): a plain-language description
-- per department that the model routes by, and the extra things the model
-- extracts from each complaint.

ALTER TABLE departments ADD COLUMN description text;

ALTER TABLE complaints ADD COLUMN summary text;            -- one-line English summary for officers
ALTER TABLE complaints ADD COLUMN language text;           -- language the caller actually spoke (ISO code)
ALTER TABLE complaints ADD COLUMN review_reason text;      -- why the AI sent it to manual review, if it did

UPDATE departments SET description = 'Drinking water supply, no water, dirty or contaminated water, burst or leaking pipes, water tankers, sewerage lines, blocked drains, overflowing gutters, flooding in streets after rain.'
  WHERE name = 'Water & Sanitation';
UPDATE departments SET description = 'Power outages, load-shedding, low voltage, sparking or damaged transformers, fallen or dangling electric wires, electric poles, meters and electricity bills.'
  WHERE name = 'Electricity';
UPDATE departments SET description = 'Broken roads, potholes, damaged bridges, footpaths, broken or non-working streetlights, traffic signals, encroachments blocking roads.'
  WHERE name = 'Roads & Infrastructure';
UPDATE departments SET description = 'Garbage not collected, rubbish heaps, overflowing bins, dead animals, street sweeping, burning trash, open dumping.'
  WHERE name = 'Sanitation & Waste';
UPDATE departments SET description = 'Anything that does not clearly belong to another department.'
  WHERE name = 'General/Unclassified';
