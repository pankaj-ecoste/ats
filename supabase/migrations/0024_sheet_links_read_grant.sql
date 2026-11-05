-- 0024 Fix: signed-in people could not read sheet_tabs and sheet_links, so an opening's Lead sheets tab found no tabs to link. This project does not give
-- table privileges to new tables by itself (0004 grants them one set at a time), and 0023 forgot the read grant. The row policies (staff only, and an
-- active account) still decide who sees a row; writes still go only through the functions of 0023. 0023 is applied and unchanged.

grant select on public.sheet_tabs, public.sheet_links to authenticated;
