// ZCredit Admin Panel
// This page only WORKS for one account — but the real enforcement is the
// Supabase RLS policies (see supabase-admin-migration.sql), not this file.
// Anyone could view this page's source; they still can't approve requests
// unless the database itself recognizes their auth.uid() as the admin.

const ADMIN_ID = "cc2be8af-6dc1-4de2-8182-08a45027a0b9";

let adminUser = null;
let depositCache = [];
let transferCache = [];

function money(n){ return "€" + Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

async function adminLogin(){
  const email=document.getElementById("adminEmail").value.trim();
  const password=document.getElementById("adminPassword").value;
  const msg=document.getElementById("loginMessage");
  if(!email || !password){msg.textContent="Enter email and password.";msg.style.color="#b44747";return;}
  msg.textContent="Working...";
  const {error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){msg.textContent=error.message;msg.style.color="#b44747";return;}
  msg.textContent="";
  await checkAdmin();
}

async function adminSignOut(){
  await supabaseClient.auth.signOut();
  adminUser=null;
  render();
}

async function checkAdmin(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  adminUser=user;
  render();
  if(user && user.id===ADMIN_ID){
    await loadRequests();
  }
}

function render(){
  document.getElementById("loginPanel").style.display="none";
  document.getElementById("deniedPanel").style.display="none";
  document.getElementById("adminApp").style.display="none";
  if(!adminUser){
    document.getElementById("loginPanel").style.display="block";
  }else if(adminUser.id!==ADMIN_ID){
    document.getElementById("deniedPanel").style.display="block";
  }else{
    document.getElementById("adminApp").style.display="block";
  }
}

async function loadRequests(){
  await Promise.all([loadDeposits(), loadTransfers()]);
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

document.addEventListener("DOMContentLoaded", checkAdmin);
