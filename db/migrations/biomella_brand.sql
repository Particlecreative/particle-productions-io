-- Add Biomella brand + set default colors/fonts for all brands
-- Run: docker exec -i particleproductionsio-db-1 psql -U cpanel cpanel < db/migrations/biomella_brand.sql

-- Create Biomella brand if it doesn't exist
INSERT INTO brands (id, name) VALUES ('biomella', 'Biomella')
ON CONFLICT (id) DO NOTHING;

-- Set default colors and fonts for each brand
INSERT INTO settings (brand_id, colors, fonts) VALUES
  ('particle', '{"bg":"#f4f5f7","primary":"#030b2e","secondary":"#0808f8","accent":"#0808f8"}', '{"title":"Sofia Sans Extra Condensed","secondary":"Sofia Sans","body":"Inter"}')
ON CONFLICT (brand_id) DO UPDATE SET colors = EXCLUDED.colors, fonts = EXCLUDED.fonts;

INSERT INTO settings (brand_id, colors, fonts) VALUES
  ('biomella', '{"bg":"#f0f7f4","primary":"#0d4a2e","secondary":"#1a8c5c","accent":"#22c55e"}', '{"title":"Inter","secondary":"Inter","body":"Inter"}')
ON CONFLICT (brand_id) DO UPDATE SET colors = EXCLUDED.colors, fonts = EXCLUDED.fonts;

INSERT INTO settings (brand_id, colors, fonts) VALUES
  ('blurr', '{"bg":"#F5F5F5","primary":"#B842A9","secondary":"#862F7B","accent":"#F86EE6"}', '{"title":"Avenir Next Condensed","secondary":"Proxima Nova ExtraBold","body":"Avenir"}')
ON CONFLICT (brand_id) DO UPDATE SET colors = EXCLUDED.colors, fonts = EXCLUDED.fonts;
