/* View registry VIEWS and render() */
/* ---------- render ---------- */
const VIEWS={dashboard:[vDashboard,bindDashboard],openings:[vOpenings,bindOpenings],opening:[vOpening,r=>{$$('[data-tab]',r).forEach(b=>b.onclick=()=>{R.tab=b.dataset.tab;render()});bindAppTable(r);bindIntTable(r);bindOfferTable(r)}],
 applications:[vApplications,bindApplications],candidates:[vCandidates,bindCandidates],candidate:[vCandidate,r=>{$$('[data-tab]',r).forEach(b=>b.onclick=()=>{R.tab=b.dataset.tab;render()});bindCandidate(r)}],
 interviews:[vInterviews,bindInterviews],offers:[vOffers,bindOffers],onboarding:[vOnboarding,bindOnboarding],tasks:[vTasks,bindTasks],reports:[vReports,()=>{}],ai:[vAI,bindAI],settings:[vSettings,bindSettings]};
function render(){
 const navView={opening:'openings',candidate:'candidates'}[R.view]||R.view;const real=R.view;R.view=navView;renderSide();R.view=real;
 renderTop();const name=VIEWS[R.view]?R.view:'dashboard';const [v,b]=VIEWS[name];const root=$('#content');root.innerHTML=v();b(root);runBindHooks(name,root);
}
