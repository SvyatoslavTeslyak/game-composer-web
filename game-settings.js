// Game settings, a tab of the game's own beside Assets: what the game is called and the picture
// it is shown by. The name, by language, is the draft's `game` section; the thumbnail is the
// `thumbnail` slot a game names in its skins.json (group `game`), kept in the draft's `art`
// section like any other picture, one per tenant. Both reach players through Changes and a
// release (tools/review_assets.py write_game_settings and write_thumbnails).
(()=>{
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LANGS=[['en','English'],['fr','French'],['ht','Haitian Creole']],MAX=60,SLOT='thumbnail',ACCEPT='image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg';
const T=()=>window.ComposerTarget,editors=()=>window.ComposerDraftEditors;
const canEdit=g=>!!editors()?.enabled&&!!window.ComposerAuth?.has('design.edit',g);
const buildUrl=(g,file)=>'games/pixi/'+encodeURIComponent(g)+'/'+file;
// Every tenant the kit knows, Lotomobil (the default brand) first: its picture is the shared one.
const tenants=()=>{const brands=[...new Set(Object.values(window.CrashTokens?.TENANTS||{}))];return brands.includes('default')?['default',...brands.filter(b=>b!=='default')]:brands};
const brandTitle=id=>window.CrashTokens?.BRANDS?.[id]||id;
const report=$('#settings-report'),tab=$('#settings-tab');

report.innerHTML='<header class="game-settings-head"><h2 id="game-settings-title">Game settings</h2><p class="share-note" id="game-settings-note"></p></header>'
 +'<form class="game-settings-card" id="game-settings-name"><h3>Name</h3><p class="share-note">What players, the showcase and a shared link call the game. A language left empty uses the English name.</p><div class="game-settings-names"></div><footer><button type="submit" class="wb-button" id="game-settings-save">Save name</button></footer></form>'
 +'<section class="game-settings-card" id="game-settings-thumbnail" hidden><h3>Thumbnail</h3><p class="share-note">The game’s tile in an app’s lobby, its icon on the showcase and in Composer, and the picture a link to it shows. Square, 512 × 512 px. Lotomobil’s is the shared one: a tenant without its own shows it.</p><div class="game-settings-thumbs"></div></section>'
 +'<p role="status" aria-live="polite" id="game-settings-status"></p>';

let game='',skins=null,art={},title={},busy=false;
const status=(text,error=false)=>{const n=$('#game-settings-status');n.textContent=text;n.classList.toggle('sound-error',error)};

// The picture each tenant shows, as a release picks it: its own (the draft's over the build's),
// else Lotomobil's, else the game's own.
function picture(brand){
 const draft=art[brand]?.slots?.[SLOT];if(draft?.media)return {url:editors().artUrl(draft.media),own:'draft'};
 const built=skins?.brands?.[brand]?.slots?.[SLOT];if(typeof built==='string')return {url:buildUrl(game,built),own:'released'};
 if(brand!=='default')return {...picture('default'),own:''};
 return {url:buildUrl(game,skins.slots.find(s=>s.id===SLOT).file),own:''};
}
function renderThumbs(){
 const slot=skins?.slots?.find(s=>s.id===SLOT);
 $('#game-settings-thumbnail').hidden=!slot;if(!slot)return;
 const editable=canEdit(game);
 $('.game-settings-thumbs').replaceChildren(...tenants().map(brand=>{
  const p=picture(brand),card=document.createElement('figure');card.className='game-settings-thumb';
  const where=p.own==='draft'?'Own · in the draft':p.own==='released'?'Own':brand==='default'?'The game’s own':'Shared (Lotomobil’s)';
  card.innerHTML='<img alt="" width="512" height="512" src="'+esc(p.url)+'"><figcaption><strong>'+esc(brandTitle(brand))+'</strong><small>'+where+'</small></figcaption>'
   +(editable?'<div class="game-settings-thumb-actions"><label class="wb-button">Upload<input type="file" accept="'+ACCEPT+'" hidden></label>'+(p.own==='draft'?'<button type="button" class="wb-button" data-remove>Remove</button>':'')+'</div>':'');
  const input=card.querySelector('input');if(input)input.onchange=()=>{const file=input.files[0];input.value='';if(file)upload(slot,brand,file)};
  const remove=card.querySelector('[data-remove]');if(remove)remove.onclick=()=>removeOwn(brand);
  card.querySelectorAll('input,button').forEach(n=>n.disabled=busy);
  return card;
 }));
}
async function work(task,done){
 if(busy)return;busy=true;renderThumbs();status('Saving…');
 try{await task();art=await editors().readArt(game).catch(()=>art);status(done);window.ComposerUX?.status('saved')}
 catch(error){status(error.message,true)}
 finally{busy=false;renderThumbs()}
}
const upload=(slot,brand,file)=>work(async()=>{
 const {blob}=await window.ComposerArtCheck.prepare(file,slot);
 const media=await editors().uploadArt(game,{brand,theme:'',slot:SLOT},blob);
 await editors().changeArt(game,draft=>{((draft[brand]||={}).slots||={})[SLOT]={media,name:file.name.slice(0,120)};return draft});
},brandTitle(brand)+'’s thumbnail saved in the draft. It reaches players once released from Changes.');
const removeOwn=brand=>work(()=>editors().changeArt(game,draft=>{delete draft[brand]?.slots?.[SLOT];return draft}),brandTitle(brand)+' shows '+(brand==='default'?'the game’s own':'the shared')+' thumbnail again in the draft.');

function renderNames(){
 const editable=canEdit(game),fallback=T().entry(game)?.title||game;
 $('.game-settings-names').replaceChildren(...LANGS.map(([lang,name])=>{
  const label=document.createElement('label');label.innerHTML='<span>'+name+'</span>';
  const input=document.createElement('input');input.name=lang;input.maxLength=MAX;input.autocomplete='off';input.spellcheck=false;input.value=title[lang]||'';input.placeholder=lang==='en'?fallback:title.en||fallback;input.disabled=!editable||busy;
  input.oninput=()=>{if(lang==='en')report.querySelectorAll('.game-settings-names input:not([name=en])').forEach(n=>n.placeholder=input.value.trim()||fallback)};
  label.append(input);return label;
 }));
 $('#game-settings-save').hidden=!editable;
}
$('#game-settings-name').onsubmit=async e=>{
 e.preventDefault();if(busy||!canEdit(game))return;
 const next={};for(const [lang] of LANGS){const v=report.querySelector('.game-settings-names [name='+lang+']').value.trim();if(!v)continue;if(/[<>]/.test(v))return status('A name cannot hold < or >.',true);next[lang]=v}
 if(Object.keys(next).length&&!next.en)return status('Give the English name first: the other languages fall back to it.',true);
 busy=true;$('#game-settings-save').disabled=true;status('Saving…');
 try{await editors().saveGame(game,Object.keys(next).length?{title:next}:{});title=next;T().setTitle(game,next.en||'');paintTitle();status(next.en?'Saved in the draft. The game is called '+next.en+' once released from Changes.':'The game’s own name is back in the draft.');window.ComposerUX?.status('saved')}
 catch(error){status(error.message,true)}
 finally{busy=false;$('#game-settings-save').disabled=false;renderNames()}
};
const paintTitle=()=>{$('#game-settings-title').textContent='Game settings · '+(T().entry(game)?.title||game)};

const active=()=>T()?.workspace==='settings';
async function load(){
 game=T()?.value;if(!game||game==='kit')return;
 $('#game-settings-note').textContent=!editors()?.enabled?'Sign in to the cloud Composer to change these.':canEdit(game)?'Changes are saved in the game’s draft and reach players once released from Changes.':'Only people who may edit this game’s look can change these.';
 paintTitle();status('');skins=null;art={};title={};renderNames();$('#game-settings-thumbnail').hidden=true;
 const g=game;
 const [catalog,draftArt,settings]=await Promise.all([
  fetch(buildUrl(g,'skins.json'),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),
  editors()?.enabled?editors().readArt(g).catch(()=>({})):{},
  editors()?.enabled?editors().readGame(g).catch(()=>({})):{},
 ]);
 if(g!==T()?.value)return;
 skins=catalog;art=draftArt;title=settings.title||{};renderNames();renderThumbs();
}

// The tab is a game's: the shared kit has no name or thumbnail of its own.
function syncTab(){
 const kit=T()?.value==='kit';
 tab.dataset.unavailable=kit?'1':'';tab.disabled=kit;
 tab.hidden=kit||!window.ComposerAuth?.canWorkspace?.('settings');
 if(kit&&active())$('#layout-tab').click();
}
// The name in the draft is the one Composer shows, for whoever may change it.
async function loadTitle(){
 const g=T()?.value;if(!g||g==='kit'||!canEdit(g))return;
 try{const settings=await editors().readGame(g);if(T().value===g)T().setTitle(g,settings.title?.en||'')}catch{}
}
window.addEventListener('composer-workspace',event=>{const on=event.detail==='settings';document.body.classList.toggle('settings-workspace',on);if(on)load()});
window.addEventListener('composer-target',()=>{syncTab();loadTitle();if(active())load()});
window.addEventListener('composer-draft-reset',()=>{loadTitle();if(active())load()});
window.ComposerAuth?.ready?.then(()=>{syncTab();loadTitle()});
document.addEventListener('composer-permissions',()=>{syncTab();loadTitle();if(active())load()});
})();
