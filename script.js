let isLoginMode = false;
let currentUser = null;

const state = {
  name: "YOUR NAME",
  number: "",
  balance: 0,
  username: "",
  transactions: []
};

function generateCardNumber(){
  let digits = "5428";
  for(let i=0;i<12;i++) digits += Math.floor(Math.random()*10);
  return digits.match(/.{1,4}/g).join(" ");
}
function money(n){ return "€" + Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

function showPage(id){
  if(id==="dashboard" && !currentUser){
    id="auth";
    document.getElementById("authMessage").textContent="Log in to view your dashboard.";
    document.getElementById("authMessage").style.color="#65707c";
  }
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll("nav button").forEach(b=>b.classList.remove("nav-active"));
  const navMap={home:"navHome",request:"navRequest",dashboard:"navDashboard"};
  if(navMap[id]) document.getElementById(navMap[id]).classList.add("nav-active");
  if(id==="dashboard") renderDashboard();
  window.scrollTo({top:0,behavior:"smooth"});
}

function toggleAuthMode(){
  isLoginMode=!isLoginMode;
  document.getElementById("authTitle").textContent=isLoginMode?"Log in":"Create account";
  document.getElementById("authButton").textContent=isLoginMode?"Log In":"Create Account";
  document.getElementById("authName").style.display=isLoginMode?"none":"block";
  document.getElementById("authNameLabel").style.display=isLoginMode?"none":"block";
  document.getElementById("authToggle").textContent=isLoginMode?"Need an account? Sign up":"Already have an account? Log in";
  document.getElementById("authMessage").textContent="";
}

async function handleAuth(){
  const username=document.getElementById("authUsername").value.trim().toLowerCase();
  const password=document.getElementById("authPassword").value;
  const name=document.getElementById("authName").value.trim();
  const msg=document.getElementById("authMessage");
  if(!username || !password || (!isLoginMode && !name)){msg.textContent="Please complete all fields.";msg.style.color="#b44747";return;}
  if(!/^[a-z0-9_]{3,20}$/.test(username)){
    msg.textContent="Username must be 3-20 characters: letters, numbers, or underscores only.";
    msg.style.color="#b44747";
    return;
  }

  // Supabase Auth needs an email under the hood, so we derive one from the
  // username instead of asking for it. Users only ever see/enter a username.
  const email=username+"@zcredit.local";
  const btn=document.getElementById("authButton");

  msg.textContent="Working...";
  btn.disabled=true;
  if(isLoginMode){
    const {error}=await supabaseClient.auth.signInWithPassword({email,password});
    btn.disabled=false;
    if(error){
      if(/confirm/i.test(error.message)){
        msg.textContent="This account isn't confirmed yet. Ask the site admin to disable email confirmation in Supabase, or confirm this account manually in the Supabase dashboard.";
      }else{
        msg.textContent="Incorrect username or password.";
      }
      console.error("Login error:", error.message);
      msg.style.color="#b44747";
      return;
    }
  }else{
    const {data:existing}=await supabaseClient.from("profiles").select("id").eq("username",username).maybeSingle();
    if(existing){btn.disabled=false;msg.textContent="That username is already taken.";msg.style.color="#b44747";return;}

    const {data,error}=await supabaseClient.auth.signUp({email,password});
    if(error){
      btn.disabled=false;
      msg.textContent=/registered|exists/i.test(error.message)?"That username is already taken.":error.message;
      msg.style.color="#b44747";
      return;
    }
    if(data.user) {
      const {error: profileError}=await supabaseClient.from("profiles").upsert({
        id:data.user.id,
        username: username,
        cardholder_name:name
      });
      if(profileError){btn.disabled=false;msg.textContent=profileError.message;msg.style.color="#b44747";return;}
    }
    msg.textContent="Account created. If email confirmation is enabled on your Supabase project, this will fail to confirm — see note below.";
    msg.style.color="#287548";
    btn.disabled=false;
    return;
  }
  await loadUser();
  showPage("dashboard");
}

function updateAuthNav(){
  const btn=document.getElementById("authNav");
  if(currentUser){
    btn.textContent="Sign Out";
    btn.onclick=signOut;
  }else{
    btn.textContent="Login / Sign Up";
    btn.onclick=()=>showPage("auth");
  }
}

let realtimeChannel=null;

async function loadUser(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  currentUser=user;
  if(!user){
    updateAuthNav();
    unsubscribeRealtime();
    return;
  }
  updateAuthNav();
  await refreshAccountData(user.id);
  subscribeRealtime(user.id);
}

async function refreshAccountData(userId){
  const {data:profile}=await supabaseClient.from("profiles").select("*").eq("id",userId).maybeSingle();
  if(profile){
    state.name=profile.cardholder_name || "YOUR NAME";
    state.number=profile.card_number || "";
    state.balance=Number(profile.balance || 0);
    state.username=profile.username || "";
  }
  const {data:tx}=await supabaseClient.from("transactions").select("*").eq("user_id",userId).order("created_at",{ascending:true});
  state.transactions=(tx||[]).map(t=>({
    type:t.type, title:t.title, amount:Number(t.amount),
    date:new Date(t.created_at).toLocaleString()
  }));
  updateHero();
  if(document.getElementById("dashboard").classList.contains("active")) renderDashboard();
}

// Subscribes to live changes on this user's profile (balance) and
// transactions, so the dashboard updates itself without a manual refresh —
// e.g. the moment an admin approves a deposit or transfer.
function subscribeRealtime(userId){
  if(realtimeChannel) return;
  realtimeChannel=supabaseClient.channel("zcredit-account-"+userId)
    .on("postgres_changes",{event:"*",schema:"public",table:"profiles",filter:`id=eq.${userId}`},()=>refreshAccountData(userId))
    .on("postgres_changes",{event:"*",schema:"public",table:"transactions",filter:`user_id=eq.${userId}`},()=>refreshAccountData(userId))
    .subscribe();
}

function unsubscribeRealtime(){
  if(realtimeChannel){
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel=null;
  }
}

function updateHero(){
  document.getElementById("heroCardName").textContent=state.name || "YOUR NAME";
  if(state.number) document.getElementById("heroCardNumber").textContent=state.number;
}

async function createCard(){
  if(!currentUser){
    showPage("auth");
    return;
  }

  const name=document.getElementById("setupName").value.trim();
  const msg=document.getElementById("cardSetupMessage");
  const btn=document.getElementById("createCardBtn");

  if(!name){
    msg.textContent="Enter a cardholder name.";
    msg.style.color="#b44747";
    return;
  }

  btn.disabled=true;
  state.name=name;
  state.number=generateCardNumber();

  const {error}=await supabaseClient
    .from("profiles")
    .update({
      cardholder_name: state.name,
      card_number: state.number
    })
    .eq("id", currentUser.id);

  btn.disabled=false;

  if(error){
    msg.textContent=error.message;
    msg.style.color="#b44747";
    return;
  }

  msg.textContent="Your ZCredit card has been created.";
  msg.style.color="#287548";

  updateHero();
  renderDashboard();
}

function renderDashboard(){
  if(!currentUser){
    document.getElementById("cardSetupPanel").style.display="none";
    return;
  }
  const hasCard=!!state.number;
  document.getElementById("cardSetupPanel").style.display=hasCard?"none":"block";
  const name=state.name || "YOUR NAME";
  document.getElementById("dashName").textContent=name==="YOUR NAME"?"there":name.split(" ")[0];
  document.getElementById("usernameInput").value=state.username||"";
  document.getElementById("balanceDisplay").textContent=money(state.balance);
  document.getElementById("availableDisplay").textContent=money(state.balance);
  ["dashCardName","detailName"].forEach(id=>document.getElementById(id).textContent=name);
  ["dashCardNumber","detailNumber"].forEach(id=>document.getElementById(id).textContent=state.number||"CARD NOT CREATED");
  document.getElementById("transactions").innerHTML=state.transactions.length
    ? state.transactions.slice().reverse().map(t=>`
      <div class="transaction">
        <div class="transaction-icon">${t.type==="deposit"?"↓":"↑"}</div>
        <div><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.date)}</small></div>
        <div class="amount ${t.type==="deposit"?"positive":"negative"}">${t.type==="deposit"?"+":"−"}${money(t.amount)}</div>
      </div>`).join("")
    : '<div class="empty">No transactions yet.</div>';
}

async function submitRequest(){
  if(!currentUser){showPage("auth");return;}
  const amount=Number(document.getElementById("requestAmount").value);
  const msg=document.getElementById("requestMessage");
  const btn=document.getElementById("requestSubmitBtn");
  if(!amount || amount<=0){msg.textContent="Enter a valid amount.";msg.style.color="#b44747";return;}
  btn.disabled=true;
  const {error}=await supabaseClient.from("deposit_requests").insert({
    user_id:currentUser.id, amount, status:"pending"
  });
  btn.disabled=false;
  if(error){msg.textContent=error.message;msg.style.color="#b44747";return;}
  msg.textContent=`Request for ${money(amount)} recorded. Give ${money(amount)} in fictional Money Life cash to Zaual IRL.`;
  msg.style.color="#287548";
  document.getElementById("requestAmount").value="";
}

async function sendMoney(){
  if(!currentUser){showPage("auth");return;}
  const recipient=document.getElementById("recipient").value.trim().replace(/^@/,"");
  const amount=Number(document.getElementById("transferAmount").value);
  const msg=document.getElementById("transferMessage");
  const btn=document.getElementById("transferSubmitBtn");
  if(!recipient || !amount || amount<=0){msg.textContent="Enter a username and a valid amount.";msg.style.color="#b44747";return;}
  if(amount>state.balance){msg.textContent="Insufficient ZCredit balance.";msg.style.color="#b44747";return;}

  btn.disabled=true;
  const {data:target,error:targetError}=await supabaseClient.from("profiles").select("id,username").eq("username",recipient).maybeSingle();
  if(targetError || !target){btn.disabled=false;msg.textContent="User not found.";msg.style.color="#b44747";return;}
  if(target.id===currentUser.id){btn.disabled=false;msg.textContent="You cannot transfer money to yourself.";msg.style.color="#b44747";return;}

  const {error}=await supabaseClient.from("transfer_requests").insert({
    sender_id:currentUser.id, recipient_id:target.id, amount, status:"pending"
  });
  btn.disabled=false;
  if(error){msg.textContent=error.message;msg.style.color="#b44747";return;}

  msg.textContent=`Transfer request for ${money(amount)} to @${recipient} submitted for Zaual verification.`;
  msg.style.color="#287548";
  document.getElementById("recipient").value="";
  document.getElementById("transferAmount").value="";
}

async function updateUsername(){
  if(!currentUser){showPage("auth");return;}
  const msg=document.getElementById("usernameMessage");
  const btn=document.getElementById("usernameSaveBtn");
  const newUsername=document.getElementById("usernameInput").value.trim().toLowerCase();

  if(!newUsername){msg.textContent="Enter a username.";msg.style.color="#b44747";return;}
  if(!/^[a-z0-9_]{3,20}$/.test(newUsername)){
    msg.textContent="Use 3-20 characters: letters, numbers, or underscores only.";
    msg.style.color="#b44747";
    return;
  }
  if(newUsername===state.username){
    msg.textContent="That's already your username.";
    msg.style.color="#65707c";
    return;
  }

  msg.textContent="Saving...";
  btn.disabled=true;
  const {error}=await supabaseClient.from("profiles").update({username:newUsername}).eq("id",currentUser.id);
  btn.disabled=false;
  if(error){
    if(error.code==="23505" || /duplicate/i.test(error.message)){
      msg.textContent="That username is already taken.";
    }else{
      msg.textContent=error.message;
    }
    msg.style.color="#b44747";
    return;
  }

  // Keep the login email (which is derived from the username) in sync,
  // so the user can still log in with their new username afterward.
  await supabaseClient.auth.updateUser({email:newUsername+"@zcredit.local"});

  state.username=newUsername;
  msg.textContent="Username updated.";
  msg.style.color="#287548";
}

async function signOut(){
  await supabaseClient.auth.signOut();
  unsubscribeRealtime();
  currentUser=null;
  state.name="YOUR NAME";state.number="";state.balance=0;state.transactions=[];
  updateHero();
  updateAuthNav();
  showPage("home");
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(session) await loadUser();
  else updateHero();
});
