-- Store the optional next Monday/Tuesday separately from the saved week.
alter table public."website-weather-snapshots"
  add column lookahead jsonb
  constraint "website-weather-lookahead-shape" check (
    case when lookahead is null then true
      when jsonb_typeof(lookahead) = 'object'
        and jsonb_typeof(lookahead->'captured_at') = 'string'
        and jsonb_typeof(lookahead->'forecast_issued_at') = 'string'
        and jsonb_typeof(lookahead->'days') = 'array'
        then jsonb_array_length(lookahead->'days') between 1 and 2
      else false
    end
  );

-- Preserve the original forecast: the capture service may only update the extension.
grant update (lookahead) on public."website-weather-snapshots" to service_role;
