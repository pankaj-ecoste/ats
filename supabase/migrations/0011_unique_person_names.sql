-- 0011 Two people cannot share a name.
-- The app tells people apart by name (who an opening belongs to, who is on a panel, who gets a notification), so a name must point to one account.
-- The name shown is the full name, or the username when there is none.
create unique index profiles_name_unique on public.profiles (lower(coalesce(nullif(btrim(full_name), ''), username)));
