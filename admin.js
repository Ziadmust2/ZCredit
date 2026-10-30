// ZCredit Admin Panel
// This page only WORKS for one account — but the real enforcement is the
// Supabase RLS policies (see supabase-admin-migration.sql), not this file.
// Anyone could view this page's source; they still can't approve requests
// unless the database itself recognizes their auth.uid() as the admin.

// Admins: yousef67 and ziadmust2. Keep in sync with is_zcredit_admin() in the SQL.
const ADMIN_IDS = [
  "47b47d7b-32dd-4ad6-975b-3dfbb0697c84", // yousef67
  "5f65415b-a349-4f73-8bcd-8f0f82aeebd9"  // ziadmust2
];

let adminUser = null;
let depositCache = [];
let transferCache = [];

function money(n){ return "€" + Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

async function adminLogin(){
  const email=document.getElementById("adminEmail").value.trim();
  const password=document.getElementById("adminPassword").value;
  const msg=document.getElementById("loginMessage");
  if(!email || !password){msg.textContent="Enter email and password.";msg.style.color="var(--neg)";return;}
  msg.textContent="Working...";
  const {error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){msg.textContent=error.message;msg.style.color="var(--neg)";return;}
  msg.textContent="";
  await checkAdmin();
}

async function adminSignOut(){
  await supabaseClient.auth.signOut();
  unsubscribeAdminRealtime();
  adminUser=null;
  render();
}

let adminRealtimeChannel=null;

// Live-refreshes the pending lists the instant a new request comes in, or
// gets approved/rejected from elsewhere (e.g. another admin tab).
function subscribeAdminRealtime(){
  if(adminRealtimeChannel) return;
  adminRealtimeChannel=supabaseClient.channel("zcredit-admin")
    .on("postgres_changes",{event:"*",schema:"public",table:"deposit_requests"},loadDeposits)
    .on("postgres_changes",{event:"*",schema:"public",table:"transfer_requests"},loadTransfers)
    .on("postgres_changes",{event:"*",schema:"public",table:"giveaways"},loadGiveaways)
    .on("postgres_changes",{event:"*",schema:"public",table:"giveaway_claims"},loadGiveaways)
    .subscribe();
}

function unsubscribeAdminRealtime(){
  if(adminRealtimeChannel){
    supabaseClient.removeChannel(adminRealtimeChannel);
    adminRealtimeChannel=null;
  }
}

async function checkAdmin(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  adminUser=user;
  render();
  if(user && ADMIN_IDS.includes(user.id)){
    await loadRequests();
    subscribeAdminRealtime();
  }
}

function render(){
  document.getElementById("loginPanel").style.display="none";
  document.getElementById("deniedPanel").style.display="none";
  document.getElementById("adminApp").style.display="none";
  if(!adminUser){
    document.getElementById("loginPanel").style.display="block";
  }else if(!ADMIN_IDS.includes(adminUser.id)){
    document.getElementById("deniedPanel").style.display="block";
  }else{
    document.getElementById("adminApp").style.display="block";
  }
}

async function loadRequests(){
  await Promise.all([loadDeposits(), loadTransfers(), loadGiveaways()]);
}

async function loadDeposits(){
  const list=document.getElementById("depositList");
  list.innerHTML='<div class="empty">Loading…</div>';
  const {data,error}=await supabaseClient
    .from("deposit_requests")
    .select("*, profiles(username,cardholder_name)")
    .eq("status","pending")
    .order("created_at",{ascending:true});
  if(error){list.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;return;}
  depositCache=data||[];
  document.getElementById("depositCount").textContent=depositCache.length?`${depositCache.length} pending`:"All caught up";
  if(!depositCache.length){list.innerHTML='<div class="empty">No pending deposit requests.</div>';return;}
  list.innerHTML=depositCache.map(r=>`
    <div class="request-row">
      <div class="request-main">
        <div class="transaction-icon">↓</div>
        <div class="request-info"><b>${escapeHtml(r.profiles?.cardholder_name || "Unknown user")}</b><small>@${escapeHtml(r.profiles?.username||"?")} • ${escapeHtml(new Date(r.created_at).toLocaleString())}</small></div>
        <div class="amount positive">${money(r.amount)}</div>
      </div>
      <div class="admin-actions">
        <button class="primary" onclick="approveDeposit(${r.id})">Approve</button>
        <button class="secondary" onclick="rejectDeposit(${r.id})">Reject</button>
      </div>
    </div>`).join("");
}

async function loadTransfers(){
  const list=document.getElementById("transferList");
  list.innerHTML='<div class="empty">Loading…</div>';
  const {data,error}=await supabaseClient
    .from("transfer_requests")
    .select("*, sender:profiles!transfer_requests_sender_id_fkey(username,cardholder_name), recipient:profiles!transfer_requests_recipient_id_fkey(username,cardholder_name)")
    .eq("status","pending")
    .order("created_at",{ascending:true});
  if(error){list.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;return;}
  transferCache=data||[];
  document.getElementById("transferCount").textContent=transferCache.length?`${transferCache.length} pending`:"All caught up";
  if(!transferCache.length){list.innerHTML='<div class="empty">No pending transfer requests.</div>';return;}
  list.innerHTML=transferCache.map(r=>`
    <div class="request-row">
      <div class="request-main">
        <div class="transaction-icon">↗</div>
        <div class="request-info"><b>@${escapeHtml(r.sender?.username||"?")} → @${escapeHtml(r.recipient?.username||"?")}</b><small>${escapeHtml(new Date(r.created_at).toLocaleString())}</small></div>
        <div class="amount negative">${money(r.amount)}</div>
      </div>
      <div class="admin-actions">
        <button class="primary" onclick="approveTransfer(${r.id})">Approve</button>
        <button class="secondary" onclick="rejectTransfer(${r.id})">Reject</button>
      </div>
    </div>`).join("");
}

async function approveDeposit(id){
  const req=depositCache.find(r=>r.id===id);
  if(!req)return;
  if(!confirm(`Approve ${money(req.amount)} deposit for @${req.profiles?.username||"?"}?`))return;

  const {error:reqErr}=await supabaseClient.from("deposit_requests").update({status:"completed"}).eq("id",id);
  if(reqErr){alert(reqErr.message);return;}

  const {data:profile,error:profErr}=await supabaseClient.from("profiles").select("balance").eq("id",req.user_id).maybeSingle();
  if(profErr || !profile){alert(profErr?.message||"Could not load user balance.");return;}

  const {error:balErr}=await supabaseClient.from("profiles").update({balance:Number(profile.balance)+Number(req.amount)}).eq("id",req.user_id);
  if(balErr){alert(balErr.message);return;}

  const {error:txErr}=await supabaseClient.from("transactions").insert({
    user_id:req.user_id, type:"deposit", title:"Balance request approved", amount:req.amount
  });
  if(txErr){alert(txErr.message);return;}

  await loadDeposits();
}

async function rejectDeposit(id){
  if(!confirm("Reject this deposit request?"))return;
  const {error}=await supabaseClient.from("deposit_requests").update({status:"rejected"}).eq("id",id);
  if(error){alert(error.message);return;}
  await loadDeposits();
}

async function approveTransfer(id){
  const req=transferCache.find(r=>r.id===id);
  if(!req)return;
  if(!confirm(`Approve ${money(req.amount)} transfer from @${req.sender?.username||"?"} to @${req.recipient?.username||"?"}?`))return;

  const {error:reqErr}=await supabaseClient.from("transfer_requests").update({status:"completed"}).eq("id",id);
  if(reqErr){alert(reqErr.message);return;}

  const {data:profiles,error:profErr}=await supabaseClient.from("profiles").select("id,balance").in("id",[req.sender_id,req.recipient_id]);
  if(profErr || !profiles || profiles.length<2){alert(profErr?.message||"Could not load both balances.");return;}
  const senderProfile=profiles.find(p=>p.id===req.sender_id);
  const recipientProfile=profiles.find(p=>p.id===req.recipient_id);
  const amount=Number(req.amount);

  if(Number(senderProfile.balance)<amount){
    if(!confirm("Sender's balance is lower than the transfer amount. Approve anyway?"))return;
  }

  const {error:senderErr}=await supabaseClient.from("profiles").update({balance:Number(senderProfile.balance)-amount}).eq("id",req.sender_id);
  if(senderErr){alert(senderErr.message);return;}

  const {error:recipientErr}=await supabaseClient.from("profiles").update({balance:Number(recipientProfile.balance)+amount}).eq("id",req.recipient_id);
  if(recipientErr){alert(recipientErr.message);return;}

  await supabaseClient.from("transactions").insert([
    {user_id:req.sender_id, type:"transfer", title:`Transfer to @${req.recipient?.username||"?"}`, amount},
    {user_id:req.recipient_id, type:"deposit", title:`Transfer from @${req.sender?.username||"?"}`, amount}
  ]);

  await loadTransfers();
}

async function rejectTransfer(id){
  if(!confirm("Reject this transfer request?"))return;
  const {error}=await supabaseClient.from("transfer_requests").update({status:"rejected"}).eq("id",id);
  if(error){alert(error.message);return;}
  await loadTransfers();
}

document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("gwStartInput").value=toLocalInputValue(new Date());
  setInterval(renderGiveaways,30000);   // keep Live/Expired badges honest without refetching
  checkAdmin();
});

// ───────────── Giveaways ─────────────
// Players claim through the claim_giveaway() database function (atomic, one claim per person,
// honours the start/expiry/spot limit). This panel only creates and manages the giveaways.
let giveawayCache=[];

function toLocalInputValue(d){
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function giveawayLink(code){
  const u=new URL("index.html",location.href);
  u.search=""; u.hash="";
  u.searchParams.set("giveaway",code);
  return u.toString();
}

function giveawayStatus(g){
  const now=Date.now();
  if(g.cancelled) return "cancelled";
  if(now<new Date(g.starts_at).getTime()) return "scheduled";
  if(now>=new Date(g.expires_at).getTime()) return "expired";
  if(g.max_claims!=null && g.claims>=g.max_claims) return "full";
  return "active";
}

async function loadGiveaways(){
  const list=document.getElementById("giveawayList");
  const {data,error}=await supabaseClient
    .from("giveaways")
    .select("*, giveaway_claims(count)")
    .order("created_at",{ascending:false})
    .limit(50);
  if(error){list.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;return;}
  giveawayCache=(data||[]).map(g=>({...g, claims:g.giveaway_claims?.[0]?.count ?? 0}));
  renderGiveaways();
}

function renderGiveaways(){
  const list=document.getElementById("giveawayList");
  if(!list) return;
  const live=giveawayCache.filter(g=>["active","scheduled"].includes(giveawayStatus(g))).length;
  document.getElementById("giveawayCount").textContent=live?`${live} live or scheduled`:"Schedule a money drop with an expiring link";
  if(!giveawayCache.length){list.innerHTML='<div class="empty">No giveaways yet.</div>';return;}
  const label={active:"Live",scheduled:"Scheduled",expired:"Expired",cancelled:"Cancelled",full:"Fully claimed"};
  list.innerHTML=giveawayCache.map(g=>{
    const st=giveawayStatus(g);
    const claims=g.max_claims!=null?`${g.claims}/${g.max_claims} claimed`:`${g.claims} claimed`;
    const canCancel=st==="active"||st==="scheduled";
    return `
    <div class="request-row">
      <div class="request-main">
        <div class="transaction-icon">★</div>
        <div class="request-info"><b>${money(g.amount)} per person · ${escapeHtml(claims)}</b><small>${escapeHtml(new Date(g.starts_at).toLocaleString())} → ${escapeHtml(new Date(g.expires_at).toLocaleString())}</small></div>
        <span class="badge badge-${st}">${label[st]}</span>
      </div>
      <div class="admin-actions">
        <button class="secondary" onclick="copyGiveawayLink(${g.id})">Copy link</button>
        ${canCancel?`<button class="secondary" onclick="cancelGiveaway(${g.id})">Cancel</button>`:""}
      </div>
    </div>`;
  }).join("");
}

async function createGiveaway(){
  const msg=document.getElementById("gwCreateMessage"), btn=document.getElementById("gwCreateBtn");
  const amount=Number(document.getElementById("gwAmountInput").value);
  const maxRaw=document.getElementById("gwMaxInput").value.trim();
  const startRaw=document.getElementById("gwStartInput").value;
  const dur=Number(document.getElementById("gwDurInput").value);
  const unit=Number(document.getElementById("gwUnitInput").value);
  const fail=t=>{msg.textContent=t;msg.style.color="var(--neg)";};

  if(!(amount>0)) return fail("Enter an amount greater than 0.");
  if(Math.abs(Math.round(amount*100)-amount*100)>1e-6) return fail("Use at most 2 decimal places.");
  if(maxRaw && !(Number.isInteger(Number(maxRaw)) && Number(maxRaw)>0)) return fail("Max people must be a whole number, or leave it empty.");
  if(!(dur>0)) return fail("Enter how long the link stays valid.");

  const start=startRaw?new Date(startRaw):new Date();
  if(isNaN(start)) return fail("Pick a valid start time.");
  const expires=new Date(start.getTime()+dur*unit);
  if(expires<=new Date()) return fail("That giveaway would already be over — pick a later start or longer duration.");

  btn.disabled=true; msg.textContent="Creating..."; msg.style.color="var(--muted)";
  const {data,error}=await supabaseClient.from("giveaways").insert({
    amount: Math.round(amount*100)/100,
    max_claims: maxRaw?Number(maxRaw):null,
    starts_at: start.toISOString(),
    expires_at: expires.toISOString()
  }).select().single();
  btn.disabled=false;
  if(error){return fail(error.message);}

  const link=giveawayLink(data.code);
  let copied=false;
  try{await navigator.clipboard.writeText(link);copied=true;}catch{}
  msg.style.color="var(--pos)";
  msg.textContent=copied?"Giveaway created — link copied to your clipboard.":"Giveaway created. Link: "+link;
  document.getElementById("gwAmountInput").value="";
  document.getElementById("gwMaxInput").value="";
  document.getElementById("gwStartInput").value=toLocalInputValue(new Date());
  await loadGiveaways();
}

async function copyGiveawayLink(id){
  const g=giveawayCache.find(x=>x.id===id); if(!g) return;
  const link=giveawayLink(g.code);
  try{await navigator.clipboard.writeText(link);alert("Link copied:\n"+link);}
  catch{prompt("Copy this link:",link);}
}

async function cancelGiveaway(id){
  if(!confirm("Cancel this giveaway? The link will stop working. Anyone who already claimed keeps their money."))return;
  const {error}=await supabaseClient.from("giveaways").update({cancelled:true}).eq("id",id);
  if(error){alert(error.message);return;}
  await loadGiveaways();
}
