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

let game='',skins=null,art={},title={},busy=false,loading=false;
// A thumbnail being stored, by tenant: its card says so beside the picture already shown.
const uploading=new Set();
const S=()=>window.ComposerSkeleton;
const status=(text,error=false)=>{const n=$('#game-settings-status');n.textContent=text;n.classList.toggle('sound-error',error)};

// What the page shows, per game: the build's skins.json (it does not change while Composer is
// open) and the draft's pictures and name, read in one go. A game's state is fetched as soon as
// the game is picked, so the tab opens on it at once and only freshens it.
const builds=new Map(),known=new Map();
const readSkins=g=>{if(!builds.has(g))builds.set(g,fetch(buildUrl(g,'skins.json'),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>{builds.delete(g);return null}));return builds.get(g)};
async function fetchState(g){
 const [catalog,payload]=await Promise.all([readSkins(g),editors()?.enabled?editors().readDraft(g).catch(()=>null):{}]);
 const state={skins:catalog,art:payload?.art||known.get(g)?.art||{},title:payload?payload.game?.title||{}:known.get(g)?.title||{}};
 known.set(g,state);return state;
}
const remember=()=>{known.set(game,{skins,art,title});showIcon(game,art)};
// Lotomobil's thumbnail in the draft is the game's picture in the picker and the rail, for whoever
// may change it, until it is released and becomes the game's icon.
const showIcon=(g,pictures)=>{if(!canEdit(g))return;const media=pictures?.default?.slots?.[SLOT]?.media;T().setIcon?.(g,media?editors().artUrl(media):'')};

// The picture each tenant shows, as a release picks it: its own (the draft's over the build's),
// else Lotomobil's, else the game's own. A picture just chosen shows from this computer until
// the stored one has loaded.
const previews={};
function picture(brand){
 const draft=art[brand]?.slots?.[SLOT];if(draft?.media)return {url:previews[brand]||editors().artUrl(draft.media),own:'draft'};
 if(previews[brand])return {url:previews[brand],own:'draft'};
 const built=skins?.brands?.[brand]?.slots?.[SLOT];if(typeof built==='string')return {url:buildUrl(game,built),own:'released'};
 if(brand!=='default')return {...picture('default'),own:''};
 return {url:buildUrl(game,skins.slots.find(s=>s.id===SLOT).file),own:''};
}
// A picture already on show is swapped only once the next one has loaded, so it never blanks.
function setImage(img,url){
 if(img.dataset.url===url)return;img.dataset.url=url;
 if(!img.getAttribute('src')){img.src=url;return}
 const next=new Image();next.onload=()=>{if(img.dataset.url===url)img.src=url};next.src=url;
}
const cards=new Map();
function renderThumbs(){
 const slot=skins?.slots?.find(s=>s.id===SLOT);
 $('#game-settings-thumbnail').hidden=!slot;if(!slot)return;
 const editable=canEdit(game),list=$('.game-settings-thumbs');
 list.replaceChildren(...tenants().map(brand=>{
  let card=cards.get(game+':'+brand);
  if(!card){card=document.createElement('figure');card.className='game-settings-thumb';card.innerHTML='<img alt="" width="512" height="512"><figcaption><strong></strong><small></small></figcaption><div class="game-settings-thumb-actions"></div>';cards.set(game+':'+brand,card)}
  const p=picture(brand);
  setImage(card.querySelector('img'),p.url);
  card.querySelector('strong').textContent=brandTitle(brand);
  const small=card.querySelector('small');if(uploading.has(game+':'+brand))small.innerHTML=S().spinner('Uploading…');else small.textContent=p.own==='draft'?'Own · in the draft':p.own==='released'?'Own':brand==='default'?'The game’s own':'Shared (Lotomobil’s)';
  const actions=card.querySelector('.game-settings-thumb-actions');actions.hidden=!editable;
  actions.innerHTML=editable?'<label class="wb-button">Upload<input type="file" accept="'+ACCEPT+'" hidden></label>'+(art[brand]?.slots?.[SLOT]?'<button type="button" class="wb-button" data-remove>Remove</button>':''):'';
  const input=actions.querySelector('input');if(input)input.onchange=()=>{const file=input.files[0];input.value='';if(file)upload(slot,brand,file)};
  const remove=actions.querySelector('[data-remove]');if(remove)remove.onclick=()=>removeOwn(brand);
  actions.querySelectorAll('input,button').forEach(n=>n.disabled=busy);
  return card;
 }));
}
async function work(task,done){
 if(busy)return;busy=true;renderThumbs();status('Saving…');const g=game;
 // A save finishing after another game was picked is kept for its own game, not drawn over this one.
 try{const saved=await task();const savedArt=saved?.payload?saved.payload.art||{}:null;if(g===game){if(savedArt)art=savedArt;remember();status(done)}else if(savedArt){if(known.has(g))known.set(g,{...known.get(g),art:savedArt});showIcon(g,savedArt)}window.ComposerUX?.status('saved')}
 catch(error){status(error.message,true)}
 finally{busy=false;renderThumbs()}
}
const upload=(slot,brand,file)=>{
 const g=game,key=g+':'+brand;
 return work(async()=>{
  const {blob}=await window.ComposerArtCheck.prepare(file,slot);
  // Shown at once from this computer while it is stored, its card saying it is on its way.
  uploading.add(key);
  try{
   if(previews[brand])URL.revokeObjectURL(previews[brand]);previews[brand]=URL.createObjectURL(blob);if(g===game)renderThumbs();
   const media=await editors().uploadArt(g,{brand,theme:'',slot:SLOT},blob);
   const saved=await editors().changeArt(g,draft=>{((draft[brand]||={}).slots||={})[SLOT]={media,name:file.name.slice(0,120)};return draft});
   // The stored copy takes over once it has loaded.
   const local=previews[brand],stored=new Image();stored.onload=stored.onerror=()=>{if(previews[brand]===local){delete previews[brand];if(g===game)renderThumbs()}setTimeout(()=>URL.revokeObjectURL(local),1000)};stored.src=editors().artUrl(media);
   return saved;
  }catch(error){URL.revokeObjectURL(previews[brand]);delete previews[brand];throw error}
  finally{uploading.delete(key)}
 },brandTitle(brand)+'’s thumbnail saved in the draft. It reaches players once released from Changes.');
};
const removeOwn=brand=>work(()=>editors().changeArt(game,draft=>{delete draft[brand]?.slots?.[SLOT];return draft}),brandTitle(brand)+' shows '+(brand==='default'?'the game’s own':'the shared')+' thumbnail again in the draft.');

function renderNames(){
 const editable=canEdit(game),fallback=T().entry(game)?.title||game;
 $('.game-settings-names').replaceChildren(...LANGS.map(([lang,name])=>{
  const label=document.createElement('label');label.innerHTML='<span>'+name+'</span>';
  const input=document.createElement('input');input.name=lang;input.maxLength=MAX;input.autocomplete='off';input.spellcheck=false;input.value=title[lang]||'';input.placeholder=lang==='en'?fallback:title.en||fallback;input.disabled=!editable||busy||loading;if(loading)input.placeholder='Loading…';
  input.oninput=()=>{if(lang==='en')report.querySelectorAll('.game-settings-names input:not([name=en])').forEach(n=>n.placeholder=input.value.trim()||fallback)};
  label.append(input);return label;
 }));
 $('#game-settings-save').hidden=!editable;$('#game-settings-save').disabled=busy||loading;$('#game-settings-name').setAttribute('aria-busy',String(loading));
}
$('#game-settings-name').onsubmit=async e=>{
 e.preventDefault();if(busy||loading||!canEdit(game))return;
 const next={};for(const [lang] of LANGS){const v=report.querySelector('.game-settings-names [name='+lang+']').value.trim();if(!v)continue;if(/[<>]/.test(v))return status('A name cannot hold < or >.',true);next[lang]=v}
 if(Object.keys(next).length&&!next.en)return status('Give the English name first: the other languages fall back to it.',true);
 const save=$('#game-settings-save');busy=true;save.disabled=true;save.innerHTML=S().spinner('Saving…');status('Saving…');
 try{await editors().saveGame(game,Object.keys(next).length?{title:next}:{});title=next;remember();T().setTitle(game,next.en||'');paintTitle();status(next.en?'Saved in the draft. The game is called '+next.en+' once released from Changes.':'The game’s own name is back in the draft.');window.ComposerUX?.status('saved')}
 catch(error){status(error.message,true)}
 finally{busy=false;save.textContent='Save name';renderNames()}
};
const paintTitle=()=>{$('#game-settings-title').textContent='Game settings · '+(T().entry(game)?.title||game)};

const active=()=>T()?.workspace==='settings';
// Typing in a name is never written over by a refresh.
const typing=()=>[...report.querySelectorAll('.game-settings-names input')].some(n=>n===document.activeElement||n.value!==(title[n.name]||''));
function show(state){
 skins=state.skins;art=state.art;loading=false;
 if(!typing()){title=state.title;renderNames()}
 renderThumbs();
}
async function load(){
 const g=T()?.value;if(!g||g==='kit')return;
 const switched=g!==game;game=g;
 $('#game-settings-note').textContent=!editors()?.enabled?'Sign in to the cloud Composer to change these.':canEdit(g)?'Changes are saved in the game’s draft and reach players once released from Changes.':'Only people who may edit this game’s look can change these.';
 paintTitle();
 if(switched){status('');title={};renderNames()}
 // What is known shows at once; the draft is read again behind it.
 // A game seen for the first time shows the shape of its thumbnails, and its names wait, until
 // they are here.
 const seen=known.get(g);if(seen)show(seen);else{status('');loading=true;if(!typing())renderNames();$('#game-settings-thumbnail').hidden=false;$('.game-settings-thumbs').innerHTML=S().cards(3,'Loading the thumbnails…')}
 const state=await fetchState(g);
 if(g!==game)return;
 show(state);
 if(canEdit(g)&&!typing())T().setTitle(g,state.title.en||'');
 showIcon(g,state.art);
}
// The tab is a game's: the shared kit has no name or thumbnail of its own.
function syncTab(){
 const kit=T()?.value==='kit';
 tab.dataset.unavailable=kit?'1':'';tab.disabled=kit;
 tab.hidden=kit||!window.ComposerAuth?.canWorkspace?.('settings');
 if(kit&&active())$('#layout-tab').click();
}
// A picked game's settings are fetched straight away: the name in the draft is the one Composer
// shows, for whoever may change it, and the tab then opens on what is already here.
async function prefetch(){
 const g=T()?.value;if(!g||g==='kit')return;
 const state=await fetchState(g).catch(()=>null);
 if(state&&T().value===g&&canEdit(g)){T().setTitle(g,state.title.en||'');showIcon(g,state.art)}
}
window.addEventListener('composer-workspace',event=>{const on=event.detail==='settings';document.body.classList.toggle('settings-workspace',on);if(on)load()});
// The name above the page follows the game's name as Composer shows it (a name just saved, or read).
window.addEventListener('composer-catalog',()=>{if(game)paintTitle()});
window.addEventListener('composer-target',()=>{syncTab();if(active())load();else prefetch()});
window.addEventListener('composer-draft-reset',event=>{known.delete(event.detail?.game);if(active())load();else prefetch()});
window.ComposerAuth?.ready?.then(()=>{syncTab();prefetch()});
document.addEventListener('composer-permissions',()=>{syncTab();if(active())load();else prefetch()});
})();
