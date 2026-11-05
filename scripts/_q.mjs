import { connect } from './db.mjs';
const c = connect(); await c.connect();
const q = async (s) => console.log(JSON.stringify((await c.query(s)).rows));
await q("select map, extra, known from sheet_links");
await q("select c.name, c.email, a.answers from applications a join candidates c on c.id=a.candidate_id order by a.created_at limit 3");
await q("select answers->>'form_name' f, answers->>'campaign_name' cn, count(*) from applications group by 1,2 order by 3 desc limit 15");
await c.end();
