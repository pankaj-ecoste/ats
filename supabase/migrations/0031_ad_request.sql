-- Ad request of an opening: optional, one per opening. Empty ({}) means no ad was asked for (leads come from the sheet, as before).
-- openings.ad = {"status": "Requested", "raisedOn": "2026-11-06", "raisedBy": "Name", "startOn": "2026-11-08", "endOn": "", "platform": "Meta",
--                "budget": 20000, "spend": 5000, "link": "https://...", "notes": "...", "withSalary": false}
-- Status moves Requested -> Running -> Paused -> Closed. Leads, screened and hired are not stored: they are counted from the sheet tabs linked to the opening.
-- Only staff can write openings (policy openings_update), and the public careers view lists its columns by name, so this column is never shown to applicants.

create function app.valid_ad_request(a jsonb) returns boolean language sql immutable as $$
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
      and char_length(coalesce(a ->> 'raisedBy', '')) <= 120)), false)
$$;

alter table public.openings add column ad jsonb not null default '{}' check (app.valid_ad_request(ad));
