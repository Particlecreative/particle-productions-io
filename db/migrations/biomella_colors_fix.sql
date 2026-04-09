UPDATE settings SET
  colors = '{"bg":"#f9f7f5","primary":"#C41E1E","secondary":"#8B1515","accent":"#C41E1E"}'::jsonb,
  fonts = '{"title":"Epilogue","secondary":"Epilogue","body":"Epilogue"}'::jsonb
WHERE brand_id = 'biomella';
