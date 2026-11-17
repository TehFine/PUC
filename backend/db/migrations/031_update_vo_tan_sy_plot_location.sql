-- 031_update_vo_tan_sy_plot_location.sql
-- Cập nhật tọa độ định vị thửa EK10-05 của nông hộ Võ Tấn Sỹ về (13.134978, 108.212042).

DO $$
DECLARE
  v_target_lat CONSTANT double precision := 13.134978;
  v_target_lng CONSTANT double precision := 108.212042;
  v_fallback_geojson CONSTANT text := '{"type":"Polygon","coordinates":[[[108.211389747,13.134342795],[108.211389747,13.135613205],[108.212694253,13.135613205],[108.212694253,13.134342795],[108.211389747,13.134342795]]]}';
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    UPDATE plots p
    SET geom = ST_SetSRID(
          ST_Translate(
            p.geom,
            v_target_lng - ST_X(ST_Centroid(p.geom)),
            v_target_lat - ST_Y(ST_Centroid(p.geom))
          ),
          4326
        ),
        updated_at = now()
    WHERE (upper(p.code) = 'EK10-05' OR p.owner_name ILIKE 'Võ Tấn Sỹ')
      AND p.geom IS NOT NULL;

    IF to_regclass('public.plot_signboard_tokens') IS NOT NULL THEN
      UPDATE plot_signboard_tokens pst
      SET center_lat = ROUND(ST_Y(ST_Centroid(p.geom))::numeric, 6),
          center_lng = ROUND(ST_X(ST_Centroid(p.geom))::numeric, 6),
          geometry_json = ST_AsGeoJSON(p.geom)
      FROM plots p
      WHERE upper(pst.plot_code) = upper(p.code)
        AND (upper(p.code) = 'EK10-05' OR p.owner_name ILIKE 'Võ Tấn Sỹ');
    END IF;
  ELSIF to_regclass('public.plot_signboard_tokens') IS NOT NULL THEN
    UPDATE plot_signboard_tokens
    SET center_lat = v_target_lat,
        center_lng = v_target_lng,
        geometry_json = v_fallback_geojson
    WHERE upper(plot_code) = 'EK10-05';
  END IF;
END $$;

