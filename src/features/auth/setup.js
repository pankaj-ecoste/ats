/* First sign-in of the first admin: the company details that go on every offer letter. */
"use strict";
const needsSetup=()=>CONNECTED&&isAdmin()&&!String(S.settings.company||'').trim();
function companySetup(){
 modal({title:'Set up your company',size:'w',body:`<p style="margin-top:0">These details appear on every offer letter. You can change them later in Settings.</p>
  <div class="fgrid"><label class="f full">Company name<input class="inp" id="suC" placeholder="e.g. Ecoste Private Limited" autocomplete="organization"></label>
  <label class="f full">Address<input class="inp" id="suA" placeholder="Registered office address"></label>
  <label class="f">Person who signs offer letters<input class="inp" id="suS" placeholder="e.g. Priya Sharma"></label>
  <label class="f">Their title<input class="inp" id="suT" placeholder="e.g. Head of HR"></label></div>`,
 foot:`<button class="btn" data-close>Later</button><button class="btn pri" id="suGo">Save</button>`,
 onMount:el=>{$('#suC',el).focus();$('#suGo',el).onclick=()=>{
  const name=val(el,'#suC');if(!name){toast('Enter the company name','var(--red)');return}
  saveCompanyDetails({company:name,companyAddr:val(el,'#suA'),signatory:val(el,'#suS'),signTitle:val(el,'#suT')});
  closeModal();toast('Company details saved');render()}}});
}
