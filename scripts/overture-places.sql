-- Export US market places from an Overture Maps release for
-- `node scripts/register-enrich.mjs overture --input overture_us.json`.
-- Run with DuckDB (pip install duckdb, or the duckdb CLI); takes about six minutes.
-- Releases: https://stac.overturemaps.org/catalog.json
INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
COPY (
  SELECT id, names.primary AS name, taxonomy.primary AS cat, operating_status, confidence,
         websites, socials, phones,
         addresses[1].locality AS city, addresses[1].region AS region, addresses[1].country AS country,
         bbox.xmin AS lon, bbox.ymin AS lat
  FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*')
  WHERE bbox.xmin BETWEEN -170 AND -66 AND bbox.ymin BETWEEN 18 AND 72
    AND (taxonomy.primary IN ('farmers_market', 'public_market', 'farm_stand', 'produce_market', 'pick_your_own_farm')
         OR names.primary ILIKE '%farmers market%'
         OR names.primary ILIKE '%farmers'' market%'
         OR names.primary ILIKE '%farmer''s market%')
) TO 'overture_us.json' (FORMAT JSON, ARRAY true);
