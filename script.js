let isLoginMode = false;
let currentUser = null;

const state = {
  name: "YOUR NAME",
  number: "",
  expiry: "09/30",
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
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
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
  const email=document.getElementById("authEmail").value.trim();
  const password=document.getElementById("authPassword").value;
  const name=document.getElementById("authName").value.trim();
  const msg=document.getElementById("authMessage");
  if(!email || !password || (!isLoginMode && !name)){msg.textContent="Please complete all fields.";msg.style.color="#b44747";return;}

  msg.textContent="Working...";
  if(isLoginMode){
    const {error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error){msg.textContent=error.message;msg.style.color="#b44747";return;}
  }else{
    const {data,error}=await supabaseClient.auth.signUp({email,password});
    if(error){msg.textContent=error.message;msg.style.color="#b44747";return;}
    if(data.user) {
      const {error: profileError}=await supabaseClient.from("profiles").upsert({
        id:data.user.id,
        username: email.split("@")[0],
        cardholder_name:name
      });
      if(profileError){msg.textContent=profileError.message;msg.style.color="#b44747";return;}
    }
    msg.textContent="Account created. If email confirmation is enabled, check your email before logging in.";
    msg.style.color="#287548";
    return;
  }
  await loadUser();
  showPage("dashboard");
}

async function loadUser(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  currentUser=user;
  if(!user){
    document.getElementById("authNav").textContent="Login / Sign Up";
    return;
  }
  document.getElementById("authNav").textContent="My Account";
  const {data:profile}=await supabaseClient.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(profile){
    state.name=profile.cardholder_name || "YOUR NAME";
    state.number=profile.card_number || "";
    state.expiry=profile.expiry || "09/30";
    state.balance=Number(profile.balance || 0);
    state.username=profile.username || "";
  }
  const {data:tx}=await supabaseClient.from("transactions").select("*").eq("user_id",user.id).order("created_at",{ascending:true});
  state.transactions=(tx||[]).map(t=>({
    type:t.type, title:t.title, amount:Number(t.amount),
    date:new Date(t.created_at).toLocaleString()
  }));
  updateHero();
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

  if(!name){
    msg.textContent="Enter a cardholder name.";
    msg.style.color="#b44747";
    return;
  }

  state.name=name;
  state.number=generateCardNumber();
  state.expiry="09/30";

  const {error}=await supabaseClient
    .from("profiles")
    .update({
      cardholder_name: state.name,
      card_number: state.number,
      expiry: state.expiry
    })
    .eq("id", currentUser.id);

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
  ["dashExpiry","detailExpiry"].forEach(id=>document.getElementById(id).textContent=state.expiry||"--/--");
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
  if(!amount || amount<=0){msg.textContent="Enter a valid amount.";msg.style.color="#b44747";return;}
  const {error}=await supabaseClient.from("deposit_requests").insert({
    user_id:currentUser.id, amount, status:"pending"
  });
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
  if(!recipient || !amount || amount<=0){msg.textContent="Enter a username and a valid amount.";msg.style.color="#b44747";return;}
  if(amount>state.balance){msg.textContent="Insufficient ZCredit balance.";msg.style.color="#b44747";return;}

  const {data:target,error:targetError}=await supabaseClient.from("profiles").select("id,username").eq("username",recipient).maybeSingle();
  if(targetError || !target){msg.textContent="User not found.";msg.style.color="#b44747";return;}
  if(target.id===currentUser.id){msg.textContent="You cannot transfer money to yourself.";msg.style.color="#b44747";return;}

  const {error}=await supabaseClient.from("transfer_requests").insert({
    sender_id:currentUser.id, recipient_id:target.id, amount, status:"pending"
  });
  if(error){msg.textContent=error.message;msg.style.color="#b44747";return;}

  msg.textContent=`Transfer request for ${money(amount)} to @${recipient} submitted for Zaual verification.`;
  msg.style.color="#287548";
  document.getElementById("recipient").value="";
  document.getElementById("transferAmount").value="";
}

async function updateUsername(){
  if(!currentUser){showPage("auth");return;}
  const msg=document.getElementById("usernameMessage");
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
  const {error}=await supabaseClient.from("profiles").update({username:newUsername}).eq("id",currentUser.id);
  if(error){
    if(error.code==="23505" || /duplicate/i.test(error.message)){
      msg.textContent="That username is already taken.";
    }else{
      msg.textContent=error.message;
    }
    msg.style.color="#b44747";
    return;
  }

  state.username=newUsername;
  msg.textContent="Username updated.";
  msg.style.color="#287548";
}

async function signOut(){
  await supabaseClient.auth.signOut();
  currentUser=null;
  state.name="YOUR NAME";state.number="";state.balance=0;state.transactions=[];
  updateHero();
  showPage("home");
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(session) await loadUser();
  else updateHero();
});
