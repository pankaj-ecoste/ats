-- Fields of their own on an ad request: openings.ad.custom = {"Creative link": "https://...", "Target budget": "20000"} (field name -> value).
-- The same check as 0032, plus: custom is an object of at most 20 fields, each name 1 to 40 characters and each value a text of at most 200.
-- (The column already uses app.valid_ad_request, so replacing the function is enough.)

create or replace function app.valid_ad_request(a jsonb) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(a) = 'object'   -- coalesce: a check passes on NULL, so anything unclear must count as false
     and (a = '{}'::jsonb or (
          coalesce(a ->> 'status', '') in ('Requested', 'Running', 'Paused', 'Closed')
      and coalesce(a ->> 'raisedOn', '') ~ '^\d{4}-\d{2}-\d{2}$'
      and coalesce(a ->> 'startOn', '') ~ '^(\d{4}-\d{2}-\d{2})?$'
      and coalesce(a ->> 'endOn', '') ~ '^(\d{4}-\d{2}-\d{2})?$'
      and (jsonb_typeof(a -> 'budget') is null or (jsonb_typeof(a -> 'budget') = 'number' and (a ->> 'budget')::numeric >= 0))
      and (jsonb_typeof(a -> 'spend') is null or (jsonb_typeof(a -> 'spend') = 'number' and (a ->> 'spend')::numeric >= 0))
      and char_length(coalesce(a ->> 'platform', '')) <= 80
      and char_length(coalesce(a ->> 'link', '')) <= 500
      and char_length(coalesce(a ->> 'notes', '')) <= 2000
      and char_length(coalesce(a ->> 'raisedBy', '')) <= 120
      and (jsonb_typeof(a -> 'sent') is null or (
            jsonb_typeof(a -> 'sent') = 'array'
        and jsonb_array_length(a -> 'sent') <= 20
        and not exists (
              select 1 from jsonb_array_elements(a -> 'sent') e
              where jsonb_typeof(e) <> 'object'
                 or coalesce(e ->> 'channel', '') not in ('Email', 'WhatsApp', 'Copied')
                 or char_length(coalesce(e ->> 'body', '')) > 5000
                 or char_length(coalesce(e ->> 'subject', '')) > 200)))
      and (jsonb_typeof(a -> 'custom') is null or (
            jsonb_typeof(a -> 'custom') = 'object'
        and (select count(*) from jsonb_object_keys(a -> 'custom')) <= 20
        and not exists (
              select 1 from jsonb_each(a -> 'custom') e
              where jsonb_typeof(e.value) <> 'string'
                 or char_length(e.key) not between 1 and 40
                 or char_length(e.value #>> '{}') > 200)))
     )), false)
$$;
