-- Narrow, validated public intake functions keep browser-facing writes usable
-- without exposing a privileged Supabase key to the application runtime.

create or replace function public."website-record-analytics-event"(
  p_workspace_id uuid,
  p_anonymous_id uuid,
  p_event_name text,
  p_page_path text,
  p_analytics_key text default null,
  p_section text default null,
  p_package_slug text default null,
  p_device_class text default null,
  p_active_seconds integer default 0,
  p_attribution jsonb default '{}'::jsonb,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_attribution jsonb := coalesce(p_attribution, '{}'::jsonb);
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
  v_landing_path text := coalesce(nullif(v_attribution ->> 'landing_path', ''), p_page_path);
  v_referrer_domain text := nullif(v_attribution ->> 'referrer_domain', '');
  v_utm jsonb := coalesce(v_attribution -> 'utm', '{}'::jsonb);
begin
  if p_workspace_id <> '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'Invalid workspace' using errcode = '22023';
  end if;
  if p_anonymous_id is null then
    raise exception 'Anonymous identifier is required' using errcode = '22023';
  end if;
  if p_event_name not in (
    'page_view', 'cta_click', 'pricing_view', 'package_select',
    'form_start', 'enquiry_submit', 'heartbeat', 'scroll_depth'
  ) then
    raise exception 'Invalid analytics event' using errcode = '22023';
  end if;
  if p_page_path is null or left(p_page_path, 1) <> '/' or char_length(p_page_path) > 300 then
    raise exception 'Invalid page path' using errcode = '22023';
  end if;
  if char_length(v_landing_path) > 300
    or char_length(coalesce(v_referrer_domain, '')) > 253
    or char_length(coalesce(p_analytics_key, '')) > 180
    or char_length(coalesce(p_section, '')) > 100
    or char_length(coalesce(p_package_slug, '')) > 100 then
    raise exception 'Analytics field exceeds its limit' using errcode = '22023';
  end if;
  if p_device_class is not null and p_device_class not in ('mobile', 'tablet', 'desktop') then
    raise exception 'Invalid device class' using errcode = '22023';
  end if;
  if p_active_seconds < 0 or p_active_seconds > 86400 then
    raise exception 'Invalid active duration' using errcode = '22023';
  end if;
  if pg_column_size(v_attribution) > 8192
    or pg_column_size(v_properties) > 8192
    or pg_column_size(v_utm) > 4096 then
    raise exception 'Analytics payload exceeds its limit' using errcode = '22023';
  end if;

  insert into public."website-analytics-sessions" (
    workspace_id,
    anonymous_id,
    active_seconds,
    landing_path,
    referrer_domain,
    utm,
    device_class,
    viewport_bucket
  )
  values (
    p_workspace_id,
    p_anonymous_id,
    case when p_event_name = 'heartbeat' then p_active_seconds else 0 end,
    v_landing_path,
    v_referrer_domain,
    v_utm,
    p_device_class,
    p_device_class
  )
  on conflict (workspace_id, anonymous_id) do update set
    last_seen_at = now(),
    active_seconds = case
      when p_event_name = 'heartbeat' then greatest(
        public."website-analytics-sessions".active_seconds,
        excluded.active_seconds
      )
      else public."website-analytics-sessions".active_seconds
    end
  returning id into v_session_id;

  insert into public."website-analytics-events" (
    workspace_id,
    session_id,
    anonymous_id,
    event_name,
    page_path,
    analytics_key,
    section,
    package_slug,
    properties
  )
  values (
    p_workspace_id,
    v_session_id,
    p_anonymous_id,
    p_event_name,
    p_page_path,
    nullif(p_analytics_key, ''),
    nullif(p_section, ''),
    nullif(p_package_slug, ''),
    v_properties
  );

  return v_session_id;
end;
$$;

create or replace function public."website-create-public-enquiry"(
  p_workspace_id uuid,
  p_name text,
  p_business_name text,
  p_email text,
  p_phone text,
  p_package_id uuid,
  p_pricing_version_id uuid,
  p_message text,
  p_source_path text,
  p_attribution jsonb,
  p_analytics_anonymous_id uuid,
  p_consent_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry_id uuid := gen_random_uuid();
  v_session_id uuid;
  v_published_version_id uuid;
  v_attribution jsonb := coalesce(p_attribution, '{}'::jsonb);
begin
  if p_workspace_id <> '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'Invalid workspace' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120
    or position('@' in p_email) <= 1
    or char_length(p_email) > 254
    or char_length(coalesce(p_business_name, '')) > 160
    or char_length(coalesce(p_phone, '')) > 40
    or char_length(coalesce(p_message, '')) > 5000 then
    raise exception 'Invalid enquiry details' using errcode = '22023';
  end if;
  if p_source_path is null or left(p_source_path, 1) <> '/' or char_length(p_source_path) > 300 then
    raise exception 'Invalid source path' using errcode = '22023';
  end if;
  if p_consent_at is null or p_consent_at > now() + interval '5 minutes' then
    raise exception 'Invalid consent time' using errcode = '22023';
  end if;
  if pg_column_size(v_attribution) > 8192 then
    raise exception 'Attribution payload exceeds its limit' using errcode = '22023';
  end if;

  if p_package_id is null then
    if p_pricing_version_id is not null then
      raise exception 'Pricing version requires a package' using errcode = '22023';
    end if;
  else
    select package.version_id
      into v_published_version_id
    from public."website-pricing-packages" as package
    join public."website-pricing-versions" as version
      on version.id = package.version_id
    join public."website-settings" as settings
      on settings.workspace_id = package.workspace_id
    where package.id = p_package_id
      and package.workspace_id = p_workspace_id
      and package.is_active
      and version.status = 'published'
      and settings.show_pricing;

    if v_published_version_id is null or v_published_version_id <> p_pricing_version_id then
      raise exception 'Invalid or unavailable package' using errcode = '22023';
    end if;
  end if;

  if p_analytics_anonymous_id is not null then
    select id into v_session_id
    from public."website-analytics-sessions"
    where workspace_id = p_workspace_id
      and anonymous_id = p_analytics_anonymous_id;
  end if;

  insert into public."website-enquiries" (
    id,
    workspace_id,
    package_id,
    pricing_version_id,
    name,
    business_name,
    email,
    phone,
    message,
    source_path,
    attribution,
    analytics_anonymous_id,
    analytics_session_id,
    consent_at,
    status
  )
  values (
    v_enquiry_id,
    p_workspace_id,
    p_package_id,
    p_pricing_version_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_business_name, '')), ''),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''),
    p_source_path,
    v_attribution,
    p_analytics_anonymous_id,
    v_session_id,
    p_consent_at,
    'new'
  );

  if p_analytics_anonymous_id is not null then
    insert into public."website-analytics-events" (
      workspace_id,
      session_id,
      anonymous_id,
      event_name,
      page_path,
      properties
    )
    values (
      p_workspace_id,
      v_session_id,
      p_analytics_anonymous_id,
      'enquiry_submit',
      p_source_path,
      jsonb_build_object('enquiryId', v_enquiry_id)
    );
  end if;

  return v_enquiry_id;
end;
$$;

revoke all on function public."website-record-analytics-event"(
  uuid, uuid, text, text, text, text, text, text, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public."website-record-analytics-event"(
  uuid, uuid, text, text, text, text, text, text, integer, jsonb, jsonb
) to anon;

revoke all on function public."website-create-public-enquiry"(
  uuid, text, text, text, text, uuid, uuid, text, text, jsonb, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public."website-create-public-enquiry"(
  uuid, text, text, text, text, uuid, uuid, text, text, jsonb, uuid, timestamptz
) to anon;
