-- Phase 2.3E pre-implementation leak check. READ-ONLY: three SELECTs, no writes.
-- Run against STAGING first, then PRODUCTION. Closes the gap the scout could not
-- reach: the public catalog API only exposes ACTIVE concepts with active variants,
-- so an inactive-but-historically-referenced concept would not have shown up there.
--
-- Run via Railway (pin the environment explicitly; never print the connection string):
--   railway run -e staging    --service Postgres bash -c 'psql "$DATABASE_PUBLIC_URL" -f phase-2.3e-leak-check.sql'
--   railway run -e production --service Postgres bash -c 'psql "$DATABASE_PUBLIC_URL" -f phase-2.3e-leak-check.sql'
--
-- HOW TO READ THE RESULT: query 1 is the one that matters. Zero rows = no live
-- leak, the 2.3E fix stays preventive. Any rows = clinical records are reaching
-- vets that were explicitly marked not-vet-visible, which is a live privacy
-- incident, not preventive work. Send me the output either way.

-- 1. THE ONE THAT MATTERS: clinical concepts marked not-vet-visible, whether or
--    not they are still active, that actually have records attached and would
--    therefore surface in a vet share today.
SELECT
  c.id            AS concept_id,
  c.key           AS concept_key,
  c.type          AS record_type,
  c.is_active     AS concept_active,
  COUNT(r.id)     AS attached_record_count
FROM pet_record_type_concepts c
JOIN pet_records r
  ON r.concept_id = c.id
 AND r.deleted_at IS NULL
WHERE c.is_vet_visible = false
  AND c.type IN ('symptom', 'medication', 'vet_visit')
GROUP BY c.id, c.key, c.type, c.is_active
ORDER BY attached_record_count DESC;

-- 2. Same clinical concepts, regardless of whether any records reference them.
--    Shows latent exposure: nothing leaking yet, but it would the moment someone
--    logs one of these.
SELECT
  c.id, c.key, c.type, c.is_active, c.is_vet_visible
FROM pet_record_type_concepts c
WHERE c.is_vet_visible = false
  AND c.type IN ('symptom', 'medication', 'vet_visit')
ORDER BY c.type, c.key;

-- 3. Sizes the fail-closed decision: clinical records with NO resolvable concept.
--    These are the records that will be hidden from vets (with an omission signal)
--    under the agreed fail-closed rule. If this number is large, that is worth
--    knowing before shipping.
SELECT
  r.record_type,
  COUNT(*) AS unresolvable_clinical_records
FROM pet_records r
WHERE r.concept_id IS NULL
  AND r.deleted_at IS NULL
  AND r.record_type IN ('symptom', 'medication', 'vet_visit')
GROUP BY r.record_type
ORDER BY unresolvable_clinical_records DESC;
