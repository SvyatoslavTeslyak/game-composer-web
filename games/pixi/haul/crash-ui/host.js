/* The Lotomobil host frame: how a game talks to the app that embeds it in an iframe.

   The app (the parent) opens the game with query parameters and speaks the agoro-core
   PostMessageService protocol: every message is JSON text {type, payload}. The parent sends
   AUTH with the player's tokens, NAVIGATION NAVIGATE_BACK for a hardware back,
   SETTINGS_CHANGE SOUNDS for mute and ACTION safe-area for its insets; the game answers with
   APP_READY / APP_FAILED, NAVIGATION NAVIGATE_HOME, SETTINGS_CHANGE SOUNDS and
   ACTION SHOW_BALANCE_ERROR. There is no demo mode: an embedded game always plays for money.

   The frame is the host only when the URL carries the host's parameters (origin, baseUrl or
   tenantId). Composer and the showcase embed games too, without them, and are left alone.
   Load this before ui.js: it picks the tenant's brand before the kit and the splash draw. */
(function(){
'use strict';
const query=new URLSearchParams(location.search);
const active=window.parent!==window&&['origin','baseUrl','tenantId'].some(key=>query.has(key));
const TYPES=['AUTH','ACTION','APP_READY','APP_FAILED','DATA','NAVIGATION','SETTINGS_CHANGE','SWITCH_TO_REAL_MONEY'];
// The tenant is the operator's brand; the kit's brands carry the same three.
const TENANT_BRANDS={LotomobilPlayers:'default',NumbaGhanaPlayers:'numba-ghana',NumbaNigeriaPlayers:'numba-nigeria'};
const flag=key=>{try{return JSON.parse(query.get(key)||'false')===true}catch{return false}};
const local=host=>host==='localhost'||host==='127.0.0.1'||host==='[::1]';
// The parent's origin is where replies go; without it the protocol falls back to '*'.
let parentOrigin='*';
try{const value=query.get('origin');if(value)parentOrigin=new URL(value).origin}catch{}
// The API base: https, or http only on this machine. A base that is neither is ignored.
let baseUrl='';
try{const value=query.get('baseUrl');if(value){const url=new URL(value);if(url.protocol==='https:'||(url.protocol==='http:'&&local(url.hostname)))baseUrl=url.href.replace(/\/?$/,'/')}}catch{}
const tenant=query.get('tenantId')||'LotomobilPlayers';
const brand=TENANT_BRANDS[tenant]||'default';
// Inside the app the tenant decides the brand, even over a ?brand= left in a link copied from
// Composer's share dialog: a Numba player never sees Lotomobil's colours.
const tenantBrand=active&&query.has('tenantId')?brand:'';
if(tenantBrand){if(tenantBrand==='default')delete document.documentElement.dataset.brand;else document.documentElement.dataset.brand=tenantBrand}

const listeners={auth:new Set(),back:new Set(),sound:new Set(),insets:new Set()};
const emit=(name,value)=>{for(const fn of listeners[name])try{fn(value)}catch(error){console.error(error)}};
let tokens=null,attached=null,muted=null,refreshing=null;
let resolveAuthorized;
const authorized=new Promise(resolve=>{resolveAuthorized=resolve});

function post(type,payload){
 if(!active)return;
 try{window.parent.postMessage(JSON.stringify({type,payload}),parentOrigin)}catch(error){console.warn('Host message not sent:',error.message)}
}
/** A message from the parent: JSON text or an object, a known type and a payload. */
function parse(event){
 if(event.source!==window.parent)return null;
 if(parentOrigin!=='*'&&event.origin!==parentOrigin)return null;
 let data=event.data;
 if(typeof data==='string'){if(!/^\s*[{[]/.test(data))return null;try{data=JSON.parse(data)}catch{return null}}
 if(!data||typeof data!=='object'||!TYPES.includes(data.type)||!data.payload)return null;
 return data;
}

// Safe-area insets in CSS pixels. The kit's stylesheet reads --safe-area-*, falling back to
// env(), which reads 0 inside a frame; the panels move and the kit reports the scene's new band.
const insets={top:0,bottom:0,left:0,right:0};
function setInsets(values){
 let changed=false;
 for(const side of Object.keys(insets)){
  const value=Number(values[side]);
  if(!Number.isFinite(value)||value<0||value===insets[side])continue;
  insets[side]=value;changed=true;
  document.documentElement.style.setProperty('--safe-area-'+side,value+'px');
 }
 if(!changed)return;
 attached?.layout?.();
 emit('insets',{...insets});
}
if(active){
 const values={};
 for(const side of Object.keys(insets)){const raw=query.get('safeArea'+side[0].toUpperCase()+side.slice(1));if(raw!==null)values[side]=raw}
 if(Object.values(values).some(value=>Number(value)>0))setInsets(values);
}

function setTokens(payload){
 if(typeof payload.auth!=='string'||!payload.auth||typeof payload.refresh!=='string'||!payload.refresh)return false;
 tokens={auth:payload.auth,refresh:payload.refresh,otpAuth:typeof payload.otpAuth==='string'?payload.otpAuth:'',agent:typeof payload.agent==='string'?payload.agent:''};
 return true;
}
// Local work: ?debugger with tokens already in this origin's storage needs no AUTH.
if(active&&query.has('debugger')){
 try{if(setTokens({auth:localStorage.getItem('Authentication'),refresh:localStorage.getItem('Refresh'),otpAuth:localStorage.getItem('OTP-Authentication')||''}))resolveAuthorized()}catch{}
}

function home(){post('NAVIGATION',{type:'NAVIGATE_HOME'})}
/** Hardware back: the game's own handlers first, then the kit closes what is open, then home. */
function back(){
 for(const fn of listeners.back)try{if(fn()===true)return}catch(error){console.error(error)}
 if(attached?.back?.())return;
 home();
}

window.addEventListener('message',event=>{
 if(!active)return;
 const data=parse(event);if(!data)return;
 const payload=data.payload;
 if(data.type==='AUTH'){if(setTokens(payload)){resolveAuthorized();emit('auth',undefined)}return}
 if(data.type==='NAVIGATION'&&payload.type==='NAVIGATE_BACK'){back();return}
 if(data.type==='SETTINGS_CHANGE'&&payload.type==='SOUNDS'&&typeof payload.value==='boolean'){muted=payload.value;emit('sound',muted);return}
 if(data.type==='ACTION'&&payload.infoType==='safe-area'){setInsets({top:payload.safeAreaTop,bottom:payload.safeAreaBottom,left:payload.safeAreaLeft,right:payload.safeAreaRight});return}
});

const failure=(message,extra)=>Object.assign(Error(message),extra);
async function call(url,options){
 let response;
 try{response=await fetch(url,{...options,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)})}
 catch{throw failure('Connection lost. Please try again.',{offline:true})}
 let data=null;
 const text=await response.text().catch(()=>'');
 if(text)try{data=JSON.parse(text)}catch{if(response.ok)throw failure('The service returned an invalid response.',{status:response.status})}
 return {response,data};
}
/** A new pair of tokens for the expired one; one refresh at a time, shared by every caller. */
function refresh(){
 if(!refreshing)refreshing=(async()=>{
  const expired=tokens;
  if(!expired?.refresh||!baseUrl)return false;
  try{
   const {response,data}=await call(new URL('login/refresh',baseUrl),{method:'POST',headers:{'Content-Type':'application/json',Authentication:expired.auth},body:JSON.stringify({refreshToken:expired.refresh,expiredToken:expired.auth})});
   const next=data?.tokens;
   if(!response.ok||typeof next?.Authentication!=='string'||!next.Authentication)return false;
   // A newer AUTH from the parent while this was on its way wins.
   if(tokens===expired)tokens={...expired,auth:next.Authentication,refresh:typeof next.Refresh==='string'&&next.Refresh?next.Refresh:expired.refresh,otpAuth:typeof next['OTP-Authentication']==='string'?next['OTP-Authentication']:expired.otpAuth};
   return true;
  }catch{return false}
 })().finally(()=>{refreshing=null});
 return refreshing;
}
/**
 * A JSON request to the game's API under baseUrl, sent with the player's token once AUTH has
 * arrived. An expired token is refreshed once and the request sent again. A failure carries
 * status and the API's code (error.payment.noMoney when the balance is short), or offline.
 */
async function request(path,options={}){
 await authorized;
 if(!baseUrl)throw failure('The game was opened without an API address.',{});
 const url=new URL(String(path).replace(/^\/+/,''),baseUrl);
 const send=()=>call(url,{...options,headers:{...options.headers,Authentication:tokens.auth}});
 let {response,data}=await send();
 if((response.status===401||response.status===403)&&await refresh())({response,data}=await send());
 if(!response.ok)throw failure(data?.message||data?.code||(response.status===401||response.status===403?'Your session has ended. Open the game again.':'The service is unavailable.'),{status:response.status,code:data?.code});
 return data;
}

window.CrashHost={
 active,parentOrigin,tenant,brand,
 /** The tenant's brand when the app named a tenant, else '': the kit and the splash take it first. */
 tenantBrand,
 /** The API base the parent named, or '' (the game then supplies its own). */
 get baseUrl(){return baseUrl},
 set baseUrl(value){if(!query.has('baseUrl'))try{const url=new URL(value);if(url.protocol==='https:'||(url.protocol==='http:'&&local(url.hostname)))baseUrl=url.href.replace(/\/?$/,'/')}catch{}},
 /** Reviewer mode (?rm=true); the protocol defines the flag, the games do not act on it yet. */
 reviewer:flag('rm'),
 debug:query.has('debugger'),
 get authorized(){return authorized},
 get signedIn(){return !!tokens},
 /** The parent's last mute (true muted, false sound on), or null until it sends one. */
 get muted(){return muted},
 get insets(){return {...insets}},
 request,
 ready(){post('APP_READY',true)},
 failed(){post('APP_FAILED',false)},
 home,
 balanceError(){post('ACTION',{type:'SHOW_BALANCE_ERROR',data:null})},
 /** The player muted (true) or unmuted (false) in the game. */
 soundChanged(value){muted=!!value;post('SETTINGS_CHANGE',{type:'SOUNDS',value:!!value})},
 on(name,fn){listeners[name]?.add(fn);return()=>listeners[name]?.delete(fn)},
 /** The kit's GameUI hands itself over, so back can close its windows and insets relayout it. */
 attach(ui){attached=ui},
};
})();
