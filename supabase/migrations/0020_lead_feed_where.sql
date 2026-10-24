-- 0020 Fix: Supabase refuses an UPDATE without a WHERE clause when it comes through the API (pg_safeupdate). ingest_leads and lead_feed_save
-- update the single settings row, so they now say `where singleton`. Found by the live end-to-end test; 0018 is applied and unchanged.

create or replace function public.ingest_leads(p_token text, p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  f public.lead_feed;
  r jsonb; res jsonb; results jsonb := '[]'; per jsonb := '{}';
  n_read int := 0; n_added int := 0; n_existing int := 0; n_dup int := 0; n_skip int := 0;
  k text; v text;
begin
  select * into f from public.lead_feed;
  if f.token_hash is null or f.enabled is not true or f.token_hash <> encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex') then
    -- a note of the refused try, but never more than a few per ten minutes, so nobody can fill the log
    if (select count(*) from public.intake_batches where source = 'sheet' and error like 'Refused%' and received_at > now() - interval '10 minutes') < 5 then
      insert into public.intake_batches (source, rows_read, rows_skipped, error) values ('sheet', 0, 0, 'Refused: the token is wrong, or the live lead sheet is switched off');
    end if;
    return jsonb_build_object('ok', false, 'message', 'This connection is not valid, or the live lead sheet is switched off. Ask an admin for a new script.');
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then return jsonb_build_object('ok', false, 'message', 'The rows must be sent as a list.'); end if;
  if jsonb_array_length(p_rows) > 500 then return jsonb_build_object('ok', false, 'message', 'Send at most 500 rows at a time.'); end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    n_read := n_read + 1;
    begin
      res := app.ingest_one_lead(r, f);
    exception when others then
      res := jsonb_build_object('status', 'skipped', 'why', 'Could not save this row: ' || sqlerrm);
    end;
    case res ->> 'status'
      when 'added' then n_added := n_added + 1;
      when 'existing' then n_existing := n_existing + 1;
      when 'duplicate' then n_dup := n_dup + 1;
      else n_skip := n_skip + 1;
    end case;
    if res ->> 'status' in ('added', 'existing') then
      per := per || jsonb_build_object(res ->> 'opening', coalesce((per ->> (res ->> 'opening'))::int, 0) + 1);
    end if;
    results := results || jsonb_build_array(jsonb_build_object('status', res ->> 'status', 'why', coalesce(res ->> 'why', '')));
  end loop;

  if n_read > 0 then
    insert into public.intake_batches (source, rows_read, rows_added, rows_skipped, detail)
      values ('sheet', n_read, n_added + n_existing, n_dup + n_skip, jsonb_build_object('added', n_added, 'existing', n_existing, 'duplicates', n_dup, 'skipped', n_skip));
    update public.lead_feed set last_received_at = now() where singleton;
    -- tell each opening's recruiter, once per batch
    for k, v in select key, value from jsonb_each_text(per) loop
      insert into public.notifications (user_id, text, link)
        select o.recruiter_id, v || ' new lead' || case when v = '1' then '' else 's' end || ' from the lead sheet for ' || o.title, jsonb_build_array('candidates')
          from public.openings o where o.id = k and o.recruiter_id is not null;
      insert into public.activity (text, type) select v || ' lead' || case when v = '1' then '' else 's' end || ' added from the lead sheet for ' || o.title, 'application' from public.openings o where o.id = k;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'added', n_added, 'existing', n_existing, 'duplicates', n_dup, 'skipped', n_skip, 'rows', results);
end $$;

create or replace function public.lead_feed_save(p_opening text, p_source text, p_enabled boolean, p_new_token boolean default false) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare tok text; src text := left(btrim(coalesce(p_source, '')), 80); first_time boolean;
begin
  if not app.is_admin() then raise exception 'Only an admin can change the lead sheet settings'; end if;
  if coalesce(p_opening, '') <> '' and not exists (select 1 from public.openings where id = p_opening) then raise exception 'That opening does not exist'; end if;
  insert into public.lead_feed (singleton) values (true) on conflict do nothing;
  first_time := (select token_hash is null from public.lead_feed);
  if p_new_token or first_time then
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.lead_feed set token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex'), token_made_at = now() where singleton;
    insert into public.activity (text, type, actor_id) values (case when first_time then 'The live lead sheet was set up' else 'A new lead sheet token was made; the old script stopped working' end, 'info', auth.uid());
  end if;
  update public.lead_feed set opening_id = nullif(p_opening, ''), source = case when src = '' then 'Ad campaign' else src end, enabled = coalesce(p_enabled, false) where singleton;
  return jsonb_build_object('token', tok);
end $$;
