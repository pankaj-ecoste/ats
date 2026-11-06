-- The briefs sent to marketing are kept on the ad: openings.ad.sent = [{"ts": 1762400000000, "by": "Name", "channel": "Email", "to": "...", "subject": "...", "body": "..."}].
-- The same check as 0031, plus: sent is a list of at most 20, each with a known channel and a body of at most 5000 characters.
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
     )), false)
$$;
