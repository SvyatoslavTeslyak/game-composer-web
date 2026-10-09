/* Assets: the pictures a tenant, or one of its themes, draws in place of a game's own.
   A game names the pictures it lets a tenant replace in its build's skins.json: each slot's
   file, size (and frame grid for a sheet), group and prompt, plus a guide for whoever makes the
   art. Composer names no game: a game without that file simply has nothing to replace here.
   Everything uploaded belongs to the tenant and theme on the stage (the top bar): a theme's
   pictures go over its tenant's, the tenant's over the game's own. Each picture is checked,
   stored as a PNG in the composer-art bucket and saved in the game's draft at once
   (draft-editors.js); the preview draws the draft through frame-art.js. The pictures fill the
   room on the left, with the game beside them on the right; the side panel stays out of the way. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const controls=$('#art-report');
const ACCEPT='image/png,image/webp,.png,.webp';
/** Phones cannot hold a texture larger than this on a side. */
const MAX_SIDE=4096;
/** How far a picture's proportions may stray from the slot's before it is refused. */
const ASPECT_TOLERANCE=0.02;
const game=()=>window.ComposerTarget.value;
const editors=()=>window.ComposerDraftEditors;
const look=()=>({brand:window.ComposerLookPicker?.brand||'default',theme:window.ComposerLookPicker?.theme||''});
const canEdit=()=>!!editors()?.enabled&&!!window.ComposerAuth?.has('design.edit',game());
let catalog=null,catalogFor=null,art={},busy='',note={text:'',error:false},loaded=false;

const buildUrl=(g,file)=>'games/pixi/'+encodeURIComponent(g)+'/'+file;
async function readCatalog(g){
 try{const r=await fetch(buildUrl(g,'skins.json'),{cache:'no-store'});return r.ok?await r.json():null}catch{return null}
}
async function readDraft(g){
 if(!editors()?.enabled)return {};
 try{return await editors().readArt(g)}catch{return {}}
}

// --- The layers: the game's own, the tenant's, the theme's ---------------------------------

function layer(source,brand,theme,create=false){
 if(create){source[brand]||={};if(theme){source[brand].themes||={};return source[brand].themes[theme]||={}}return source[brand].slots||={}}
 return (theme?source[brand]?.themes?.[theme]:source[brand]?.slots)||{};
}
const groupSlots=(group)=>catalog.slots.filter(s=>s.group===group);
// A group that must change whole (the hero's clips) is drawn from a layer only when that layer has
// every one of them, as the game decides (src/platform/skins.ts in a game).
function picked(source,brand,theme,slot){
 const own=layer(source,brand,theme),group=catalog.groups?.find(g=>g.id===slot.group);
 if(!own[slot.id])return null;
 if(group?.together&&!groupSlots(group.id).every(s=>own[s.id]))return null;
 return {picture:own[slot.id]};
}
/** What the stage shows for one slot: where its picture comes from, and the picture. */
function shown(slot,source=art){
 const {brand,theme}=look();
 const found=theme&&picked(source,brand,theme,slot);if(found)return {from:'theme',...found};
 const tenant=picked(source,brand,'',slot);if(tenant)return {from:'tenant',...tenant};
 return {from:'game',picture:null};
}
/** The card's word for where its picture comes from. */
function source(slot,{from}){
 return {theme:'This theme',tenant:look().theme?'From the tenant':'This tenant',game:'Game’s own'}[from];
}
const pictureUrl=(slot,picture)=>picture?editors().artUrl(picture.media):buildUrl(game(),slot.file);

// --- Titles ---------------------------------------------------------------------------------

function lookTitles(){
 const {brand,theme}=look(),b=window.ComposerLook?.catalog?.brands?.[brand];
 return {brand:b?.title||brand,theme:theme?(b?.themes?.[theme]?.title||theme):''};
}
const px=(w,h)=>w+' × '+h+' px';
/** A sprite sheet's frame at the slot's own size: square, the sheet's width over its columns. */
const cell=slot=>slot.size[0]/slot.sheet.columns;
/** What the picture must be: its size, and for a sprite sheet the grid and the size of one frame. */
function spec(slot){
 const [w,h]=slot.size;
 if(!slot.sheet)return '<dt>Size</dt><dd>'+px(w,h)+'</dd>';
 const {columns,rows,frames}=slot.sheet,empty=columns*rows-frames;
 return '<dt>Sheet</dt><dd>'+px(w,h)+'</dd>'
  +'<dt>Frame</dt><dd><b>'+px(cell(slot),cell(slot))+'</b></dd>'
  +'<dt>Grid</dt><dd>'+columns+' columns × '+rows+' rows</dd>'
  +'<dt>Frames</dt><dd>'+frames+(empty?', last '+(empty>1?empty+' cells':'cell')+' empty':'')+'</dd>';
}
// The prompt as the game wrote it, the part a tenant changes marked; copied without the brackets.
const promptHTML=text=>esc(text).replace(/\[([^\]]+)\]/g,'<mark>$1</mark>');
const promptText=text=>text.replace(/\[([^\]]+)\]/g,'$1');
// A text from the game's catalog, escaped, with every tool the catalog links (`links`: name → https
// address) turned into a link to it.
function linked(text){
 let html=esc(text);
 for(const [name,url] of Object.entries(catalog?.links||{})){
  if(!/^https:\/\//.test(url))continue;
  html=html.split(esc(name)).join('<a class="art-link" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(name)+'</a>');
 }
 return html;
}

// --- Drawing --------------------------------------------------------------------------------

function render(){
 if(!controls)return;
 const g=game(),t=lookTitles(),{theme}=look();
 if(!catalog){
  controls.innerHTML='<div class="art-head"><h2>Assets</h2><p>'+esc(window.ComposerTarget.entry().title)+' names no pictures a tenant can replace. A game offers them in a <code>skins.json</code> beside its art; build the game once it has one.</p></div>';
  return;
 }
 const where=theme?'the '+t.theme+' theme of '+t.brand:t.brand;
 // How it all works sits behind the small button beside the title, in a window of its own.
 const head='<div class="art-head"><div class="art-head-row"><h2>Pictures for '+esc(where)+'</h2>'
  +'<button class="art-button art-help" type="button" data-guide title="How to make the pictures" aria-label="How to make the pictures">?</button></div>'
  +(!editors()?.enabled?'<small class="sound-warn">Sign in to the shared workspace to add pictures.</small>':!canEdit()?'<small class="sound-warn">Your role can look at these pictures but not change them.</small>':'')
  +(note.text?'<small id="art-message" role="status" class="'+(note.error?'sound-error':'sound-busy')+'">'+esc(note.text)+'</small>':'<small id="art-message" role="status"></small>')
  +'</div>';
 const groups=(catalog.groups||[]).map(group=>{
  const slots=groupSlots(group.id);if(!slots.length)return '';
  const own=layer(art,look().brand,theme),count=slots.filter(s=>own[s.id]).length;
  const names=esc(slots.map(s=>s.title).join(', '));
  const whole=group.together&&count>0&&count<slots.length?'<p class="art-note sound-warn">'+count+' of '+slots.length+' added. The game keeps drawing '+(theme?'the tenant’s':'its own')+' '+esc(group.title.toLowerCase())+' until '+names+' are all here.</p>':group.together?'<p class="art-note">Replace '+names+' together: the game never mixes two sets.</p>':'';
  return '<details class="art-group" open><summary>'+esc(group.title)+(count?'<small>'+count+' of '+slots.length+' replaced</small>':'')+'</summary>'+whole+clipsPanel(group)+'<ul class="art-grid">'+slots.map(row).join('')+'</ul></details>';
 }).join('');
 controls.innerHTML=head+groups;
 animate();
}
function row(slot){
 const {brand,theme}=look(),{from,picture}=shown(slot),own=layer(art,brand,theme)[slot.id];
 const group=catalog.groups?.find(g=>g.id===slot.group);
 const badge=source(slot,shown(slot));
 const edit=canEdit(),working=busy===slot.id,locked=busy?' disabled':'';
 const url=pictureUrl(slot,picture),[w,h]=slot.size;
 // A sheet's grid is drawn over its picture, so the frames the game cuts can be seen.
 const cells=slot.sheet?'<i class="art-cells" style="--cols:'+slot.sheet.columns+';--rows:'+slot.sheet.rows+'"></i>':'';
 return '<li class="art-card'+(working?' is-busy':'')+'" data-slot="'+esc(slot.id)+'">'
  +'<button class="art-thumb" type="button" data-view title="Look closer"><span class="art-frame" style="--ratio:'+(w/h).toFixed(4)+'"><img alt="" loading="lazy" src="'+esc(url)+'">'+cells+'</span></button>'
  +'<div class="art-card-head"><strong>'+esc(slot.title)+'</strong><span class="art-badge art-from-'+from+'">'+badge+'</span></div>'
  +'<dl class="art-spec">'+spec(slot)+'</dl>'
  +(own?'<p class="art-file" title="'+esc(own.name)+'">Uploaded: '+esc(own.name)+'</p>':'')
  +'<div class="art-actions">'
  +(edit?'<label class="art-button art-primary'+(working||busy?' is-disabled':'')+'">'+(working?'Saving…':own?'Replace':'Upload')+'<input type="file" accept="'+ACCEPT+'" data-upload hidden'+locked+'></label>':'')
  +'<div class="art-pair">'+(slot.prompt?'<button class="art-button" type="button" data-prompt>Prompt</button>':'')+'<a class="art-button" href="'+esc(url)+'" download="'+esc(slot.file.split('/').pop())+'">Download</a>'
  +(edit&&own?'<button class="art-button" type="button" data-remove'+locked+'>Remove</button>':'')+'</div>'
  +(edit&&own&&group?.oneForAll&&groupSlots(slot.group).length>1?'<button class="art-button art-quiet" type="button" data-every'+locked+'>Use for every '+esc(group.title.toLowerCase())+' picture</button>':'')
  +'</div></li>';
}
function say(text,error=false){note={text,error};const node=$('#art-message');if(node){node.textContent=text;node.className=error?'sound-error':text?'sound-busy':''}if(error)window.ComposerUX?.status('error',text)}

// --- A closer look, in a window over the page --------------------------------------------

const viewer=document.createElement('dialog');viewer.className='art-viewer';viewer.setAttribute('aria-label','Picture');document.body.append(viewer);
function view(slot){
 const {from,picture}=shown(slot),url=pictureUrl(slot,picture),[w,h]=slot.size;
 const cells=slot.sheet?'<i class="art-cells" style="--cols:'+slot.sheet.columns+';--rows:'+slot.sheet.rows+'"></i>':'';
 const badge=source(slot,shown(slot));
 viewer.innerHTML='<div class="art-viewer-head"><strong>'+esc(slot.title)+'</strong><span class="art-badge art-from-'+from+'">'+badge+'</span><button class="art-button art-close" type="button" data-close aria-label="Close">×</button></div>'
  +'<div class="art-viewer-stage"><span class="art-frame" style="--ratio:'+(w/h).toFixed(4)+'"><img alt="'+esc(slot.title)+'" src="'+esc(url)+'">'+cells+'</span></div>'
  +'<div class="art-viewer-foot"><dl class="art-spec">'+spec(slot)+'</dl><a class="art-button art-primary" href="'+esc(url)+'" download="'+esc(slot.file.split('/').pop())+'">Download</a></div>';
 viewer.showModal();
}
/** How the layers work and the game's guide for whoever makes the pictures. */
function showGuide(){
 const {theme}=look(),t=lookTitles();
 const layers=theme?'Pictures here belong to the '+t.theme+' theme of '+t.brand+'. Anything the theme leaves out comes from '+t.brand+', and from the game after that.':'Pictures here belong to '+t.brand+'. Anything left out is the game’s own, and a theme of '+t.brand+' can change pictures again on top.';
 viewer.innerHTML='<div class="art-viewer-head"><strong>How to make the pictures</strong><button class="art-button art-close" type="button" data-close aria-label="Close">×</button></div>'
  +'<div class="art-guide-body"><p class="art-prompt-note">'+esc(layers)+' Change the tenant or theme in the top bar.</p>'
  +(catalog.guide||[]).map(section=>'<section><h3>'+esc(section.title)+'</h3><ul>'+(section.lines||[]).map(line=>'<li>'+linked(line)+'</li>').join('')+'</ul></section>').join('')+'</div>';
 viewer.classList.add('is-guide');viewer.showModal();
}
/** The slot's prompt, large and readable, the part a tenant changes marked, with Copy. */
function showPrompt(slot){
 viewer.innerHTML='<div class="art-viewer-head"><strong>'+esc(slot.title)+' · prompt</strong><button class="art-button art-close" type="button" data-close aria-label="Close">×</button></div>'
  +'<div class="art-prompt-body"><p class="art-prompt-text">'+promptHTML(slot.prompt)+'</p>'
  +'<p class="art-prompt-note">Change the <mark>highlighted part</mark> to the tenant’s or theme’s subject and keep the rest: it holds the view, the size and the framing the game needs.</p></div>'
  +'<div class="art-viewer-foot"><dl class="art-spec">'+spec(slot)+'</dl><button class="art-button art-primary" type="button" data-copy-prompt="'+esc(slot.id)+'">Copy prompt</button></div>';
 viewer.classList.add('is-prompt');viewer.showModal();
}
viewer.addEventListener('close',()=>viewer.classList.remove('is-prompt','is-guide'));
viewer.addEventListener('click',event=>{
 const copy=event.target.closest('[data-copy-prompt]');if(!copy)return;
 const slot=catalog.slots.find(s=>s.id===copy.dataset.copyPrompt);
 navigator.clipboard?.writeText(promptText(slot.prompt)).then(()=>{copy.textContent='Copied';setTimeout(()=>{copy.textContent='Copy prompt'},1500)},()=>say('Copy failed.',true));
});
// A click on the dimmed page around the window closes it, as the cross and Escape do.
viewer.addEventListener('click',event=>{if(event.target===viewer||event.target.closest('[data-close]'))viewer.close()});

// --- Checking and storing a picture ---------------------------------------------------------

const isPng=bytes=>bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
/** The picture as the slot needs it, as a PNG, or an error that says what to change. */
async function prepare(file,slot){
 const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const webp=String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP';
 if(!isPng(head)&&!webp)throw Error(file.name+' is not a PNG or WebP picture.');
 let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw Error(file.name+' could not be read as a picture.')}
 const {width,height}=bitmap,[w,h]=slot.size,want=w/h,got=width/height;
 const grid=slot.sheet?' (a '+slot.sheet.columns+' × '+slot.sheet.rows+' grid of square frames, each '+px(cell(slot),cell(slot))+' at that size)':'';
 if(Math.abs(got-want)>want*ASPECT_TOLERANCE){bitmap.close();throw Error(file.name+' is '+width+' × '+height+'. '+slot.title+' needs the proportions of '+w+' × '+h+grid+'; start from Download and keep the canvas size.')}
 if(width>MAX_SIDE||height>MAX_SIDE){bitmap.close();throw Error(file.name+' is '+width+' × '+height+'. Keep each side at '+MAX_SIDE+' pixels or less; '+w+' × '+h+' is enough.')}
 if(slot.sheet&&(width%slot.sheet.columns||height%slot.sheet.rows)){bitmap.close();throw Error(file.name+' is '+width+' × '+height+', which does not split into '+slot.sheet.columns+' × '+slot.sheet.rows+' whole frames. Use '+w+' × '+h+' or another size that divides evenly.')}
 const warning=width<w/2?' It is less than half the size of the current picture, so it may look soft on large screens.':'';
 if(isPng(head)){bitmap.close();return {blob:file,warning}}
 // A WebP is redrawn as a PNG: the release ships PNG, which every browser decodes.
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('The picture could not be converted to PNG.')),'image/png'));
 return {blob,warning};
}

async function change(slotId,work,done){
 if(busy)return;
 busy=slotId;render();say('Saving…');
 try{
  await work();
  art=await readDraft(game());
  say(done);window.ComposerUX?.status('saved');
  // The preview reads the draft again when it reloads.
  window.ComposerLive?.reload();
 }catch(error){say(error.message,true)}
 finally{busy='';render()}
}
function upload(slot,file){
 const {brand,theme}=look(),g=game();
 return change(slot.id,async()=>{
  const {blob,warning}=await prepare(file,slot);
  const media=await editors().uploadArt(g,{brand,theme,slot:slot.id},blob);
  await editors().changeArt(g,draft=>{layer(draft,brand,theme,true)[slot.id]={media,name:file.name.slice(0,120)};return draft});
  note.warning=warning;
 },slot.title+' saved in the draft for '+(theme?'this theme':'this tenant')+'. It reaches players once released from Changes.');
}
function remove(slot){
 const {brand,theme}=look();
 return change(slot.id,()=>editors().changeArt(game(),draft=>{delete layer(draft,brand,theme,true)[slot.id];return draft}),slot.title+' is '+(theme?'the tenant’s':'the game’s own')+' again in the draft.');
}
function everyInGroup(slot){
 const {brand,theme}=look(),group=catalog.groups.find(g=>g.id===slot.group);
 return change(slot.id,()=>editors().changeArt(game(),draft=>{
  const own=layer(draft,brand,theme,true),picture=own[slot.id];
  if(!picture)throw Error('Upload a picture for '+slot.title+' first.');
  for(const other of groupSlots(slot.group))own[other.id]={...picture};
  return draft;
 }),'Every '+group.title.toLowerCase()+' picture is now '+slot.title+'’s.');
}

// --- A group made from animated clips (the hero, in an image generator) --------------------
// The game's skins.json says how: a still, a padded copy for a move that leaves the frame, then
// clips, each making one sheet or split by frames into several. Clips stay on this page until
// their sheets are saved; nothing is stored before Save.

const clipsKit=()=>window.ComposerArtClips;
let clipWork={},timers=[];
function work(groupId){return clipWork[game()+':'+groupId]||={padded:null,clips:{},picks:{},sheets:{},missing:[]}}
const slotById=id=>catalog.slots.find(s=>s.id===id);
const cellCanvas=(slot)=>({columns:slot.sheet.columns,rows:slot.sheet.rows,cell:cell(slot)});
/** The sheets the loaded clips make, and what is still missing for the rest. */
function rebuild(group){
 const w=work(group.id),kit=clipsKit(),spec=group.clips;w.sheets={};w.missing=[];
 for(const clip of spec.list){
  const got=w.clips[clip.id];
  if(!got){w.missing.push('Upload '+clip.title.replace(/^\d+\.\s*/,'')+'.');continue}
  if(clip.slot){const slot=slotById(clip.slot);w.sheets[slot.id]=kit.sheet(kit.spread(got.frames,slot.sheet.frames),cellCanvas(slot));continue}
  const reference=spec.list.find(c=>c.id===clip.match),refGot=reference&&w.clips[reference.id];
  if(!refGot){w.missing.push(clip.title.replace(/^\d+\.\s*/,'')+' is matched to '+reference.title.replace(/^\d+\.\s*/,'')+': upload that one too.');continue}
  const ref=kit.cellOf(refGot.frames[0],cell(slotById(reference.slot)));
  clip.split.forEach((part,index)=>{
   const slot=slotById(part.slot),picked=w.picks[clip.id][index];
   if(picked.length!==slot.sheet.frames){w.missing.push(part.title+': pick '+slot.sheet.frames+' frames ('+picked.length+' picked).');return}
   const frames=kit.matched(got.frames,ref,cell(slot));
   w.sheets[slot.id]=kit.sheet(picked.map(i=>frames[i]),cellCanvas(slot));
  });
 }
}
function thumb(frame){
 if(frame.thumb)return frame.thumb;
 const c=document.createElement('canvas');c.width=c.height=72;c.getContext('2d').drawImage(frame,0,0,72,72*frame.height/frame.width);
 return frame.thumb=c.toDataURL();
}
function picker(clip,got,w){
 const picks=w.picks[clip.id];
 const partOf=i=>picks.findIndex(list=>list.includes(i));
 const counts=clip.split.map((part,index)=>'<span class="art-part is-part-'+index+'">'+esc(part.title)+': <b>'+picks[index].length+' of '+slotById(part.slot).sheet.frames+'</b></span>').join(' ');
 return '<div class="art-pick"><p>Click a frame to put it in <b>'+clip.split.map(p=>esc(p.title)).join('</b>, then <b>')+'</b>, or leave it out. '+counts+'</p>'
  +'<ol class="art-frames">'+got.frames.map((frame,i)=>{const at=partOf(i);return '<li><button type="button" class="art-frame-pick'+(at>=0?' is-part-'+at:'')+'" data-pick="'+esc(clip.id)+':'+i+'" title="Frame '+(i+1)+(at>=0?': '+esc(clip.split[at].title):'')+'"><img alt="" src="'+thumb(frame)+'"><span>'+(i+1)+'</span></button></li>'}).join('')+'</ol>'
  +'<p class="art-step-settings">'+clip.split.map(p=>esc(p.title)+': '+esc(p.about)).join(' ')+'</p></div>';
}
function clipsPanel(group){
 const spec=group.clips;if(!spec||!clipsKit())return '';
 const w=work(group.id),{theme}=look(),t=lookTitles();
 const step=(title,body)=>'<li class="art-step"><h4>'+esc(title)+'</h4>'+body+'</li>';
 const prompt=(text,key)=>'<div class="art-step-prompt"><p>'+promptHTML(text)+'</p><button class="art-button" type="button" data-clip-copy="'+esc(group.id+':'+key)+'">Copy prompt</button></div>';
 const settings=text=>text?'<p class="art-step-settings">'+linked(text)+'</p>':'';
 let steps=step(spec.still.title,prompt(spec.still.prompt,'still')+settings(spec.still.settings));
 if(spec.padded)steps+=step(spec.padded.title,'<p class="art-step-settings">'+linked(spec.padded.about)+'</p><div class="art-step-row"><label class="art-button">'+(w.padded?'Make it again':'Make the padded copy')+'<input type="file" accept="image/png,image/webp,.png,.webp" data-clip-pad="'+esc(group.id)+'" hidden></label>'+(w.padded?'<a class="art-button art-primary" href="'+w.padded+'" download="padded-still.png">Download the padded copy</a>':'')+'</div>');
 for(const clip of spec.list){
  const got=w.clips[clip.id];
  steps+=step(clip.title,prompt(clip.prompt,clip.id)+settings(clip.settings)
   +'<div class="art-step-row"><label class="art-button'+(got?'':' art-primary')+'">'+(got?'Replace the clip':'Upload the clip')+'<input type="file" accept=".webp,.gif,image/webp,image/gif" data-clip="'+esc(group.id)+':'+esc(clip.id)+'" hidden></label>'+(got?'<small>'+esc(got.name)+' · '+got.frames.length+' frames</small>':'')+'</div>'
   +(got&&clip.split?picker(clip,got,w):''));
 }
 const targets=groupSlots(group.id),ready=targets.every(slot=>w.sheets[slot.id]);
 const result=Object.keys(w.sheets).length||w.missing.length?'<div class="art-made"><h4>The sheets these clips make</h4>'
  +'<ul class="art-made-list">'+targets.map(slot=>'<li><canvas class="art-anim" width="120" height="120" data-anim="'+esc(slot.id)+'"></canvas><strong>'+esc(slot.title)+'</strong><small>'+(w.sheets[slot.id]?px(cell(slot),cell(slot))+' frames · '+slot.sheet.frames:'Not made yet')+'</small></li>').join('')+'</ul>'
  +(w.missing.length?'<ul class="art-missing">'+w.missing.map(m=>'<li>'+esc(m)+'</li>').join('')+'</ul>':'')
  +(canEdit()?'<button class="art-button art-primary art-save" type="button" data-clip-save="'+esc(group.id)+'"'+(ready&&!busy?'':' disabled')+'>Save the '+targets.length+' sheets for '+esc(theme?'the '+t.theme+' theme':t.brand)+'</button>':'')+'</div>':'';
 return '<section class="art-clips"><details'+(Object.keys(w.clips).length||w.padded?' open':'')+'><summary>Make the '+esc(group.title.toLowerCase())+' in '+esc(spec.tool)+'</summary><p class="art-step-settings">'+linked(spec.about)+'</p><ol class="art-steps">'+steps+'</ol>'+result+'</details></section>';
}
/** The made sheets play in their little windows at the game's speed. */
function animate(){
 for(const timer of timers)clearInterval(timer);timers=[];
 for(const node of controls.querySelectorAll('canvas[data-anim]')){
  const slot=slotById(node.dataset.anim),group=catalog.groups.find(g=>g.id===slot.group),sheetCanvas=work(group.id).sheets[slot.id];
  if(!sheetCanvas)continue;
  const ctx=node.getContext('2d'),size=cell(slot),{columns,frames,fps=8}=slot.sheet;let frame=0;
  const draw=()=>{ctx.clearRect(0,0,node.width,node.height);ctx.drawImage(sheetCanvas,(frame%columns)*size,Math.floor(frame/columns)*size,size,size,0,0,node.width,node.height);frame=(frame+1)%frames};
  draw();timers.push(setInterval(draw,1000/fps));
 }
}
async function saveClips(group){
 const {brand,theme}=look(),g=game(),w=work(group.id),targets=groupSlots(group.id);
 return change(group.id,async()=>{
  const saved={};
  for(const slot of targets){
   const blob=await clipsKit().png(w.sheets[slot.id]);
   saved[slot.id]={media:await editors().uploadArt(g,{brand,theme,slot:slot.id},blob),name:slot.title+' (from clips)'};
  }
  await editors().changeArt(g,draft=>{Object.assign(layer(draft,brand,theme,true),saved);return draft});
 },'The '+group.title.toLowerCase()+'’s '+targets.length+' sheets saved in the draft for '+(theme?'this theme':'this tenant')+'. They reach players once released from Changes.');
}
async function clipInput(input){
 const file=input.files?.[0];input.value='';if(!file)return;
 try{
  if(input.dataset.clipPad){
   const group=catalog.groups.find(g=>g.id===input.dataset.clipPad),w=work(group.id);
   const out=await clipsKit().padded(file,group.clips.padded.share);
   if(w.padded)URL.revokeObjectURL(w.padded);
   w.padded=URL.createObjectURL(await clipsKit().png(out));say('Padded copy ready: download it and animate the jump from it.');
  }else{
   const [groupId,clipId]=input.dataset.clip.split(':'),group=catalog.groups.find(g=>g.id===groupId),clip=group.clips.list.find(c=>c.id===clipId),w=work(groupId);
   say('Reading '+file.name+'…');
   const frames=await clipsKit().decode(file);
   w.clips[clipId]={frames,name:file.name};
   if(clip.split)w.picks[clipId]=clip.split.map(part=>part.frames.filter(i=>i<frames.length));
   rebuild(group);say(file.name+': '+frames.length+' frames read.'+(clip.frames&&frames.length!==clip.frames?' The game expects '+clip.frames+'; '+(clip.split?'check the picked frames.':'they are spread evenly over the sheet.'):''));
  }
 }catch(error){say(error.message,true)}
 render();
}
function pick(button){
 const [clipId,index]=button.dataset.pick.split(':'),i=Number(index);
 const group=catalog.groups.find(g=>g.clips?.list.some(c=>c.id===clipId)),w=work(group.id),picks=w.picks[clipId];
 const at=picks.findIndex(list=>list.includes(i));
 if(at>=0)picks[at]=picks[at].filter(x=>x!==i);
 const next=at+1;if(next<picks.length)picks[next]=[...picks[next],i].sort((a,b)=>a-b);
 rebuild(group);render();
}

controls?.addEventListener('change',event=>{
 if(event.target.matches('[data-clip],[data-clip-pad]')){clipInput(event.target);return}
 const input=event.target.closest('[data-upload]');if(!input?.files?.[0])return;
 const slot=catalog?.slots.find(s=>s.id===input.closest('[data-slot]')?.dataset.slot),file=input.files[0];input.value='';
 if(slot)upload(slot,file).then(()=>{if(note.warning&&!note.error)say(note.text+note.warning);note.warning=''});
});
controls?.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if('guide' in button.dataset){showGuide();return}
 if(button.dataset.pick){pick(button);return}
 if(button.dataset.clipSave){saveClips(catalog.groups.find(g=>g.id===button.dataset.clipSave));return}
 if(button.dataset.clipCopy){
  const [groupId,key]=button.dataset.clipCopy.split(':'),spec=catalog.groups.find(g=>g.id===groupId).clips;
  const text=key==='still'?spec.still.prompt:spec.list.find(c=>c.id===key).prompt;
  navigator.clipboard?.writeText(promptText(text)).then(()=>say('Prompt copied.'),()=>say('Copy failed.',true));return;
 }
 const slot=catalog?.slots.find(s=>s.id===button.closest('[data-slot]')?.dataset.slot);if(!slot)return;
 if('view' in button.dataset)view(slot);
 if('remove' in button.dataset)remove(slot);
 if('every' in button.dataset)everyInGroup(slot);
 if('prompt' in button.dataset)showPrompt(slot);
});

// --- Loading, and following the game and the look ------------------------------------------

async function load(){
 const g=game();
 const [found,draft]=await Promise.all([catalogFor===g&&catalog?catalog:readCatalog(g),readDraft(g)]);
 if(g!==game())return;
 catalog=found;catalogFor=g;art=draft;loaded=true;render();
}
const active=()=>window.ComposerTarget?.workspace==='art';
window.addEventListener('composer-workspace',event=>{
 const on=event.detail==='art';
 document.body.classList.toggle('art-workspace',on);$('#room').classList.toggle('art-workspace',on);
 if(on){note={text:'',error:false};load()}
});
window.addEventListener('composer-target',()=>{catalog=null;catalogFor=null;art={};for(const timer of timers)clearInterval(timer);timers=[];if(active())load()});
window.addEventListener('composer-draft-reset',()=>{if(loaded)load()});
// Another tenant or theme on the stage: its pictures, in the list and in the game.
window.addEventListener('composer-look',()=>{
 if(active())render();
 if(catalogFor===game()&&catalog&&Object.keys(art).length)window.ComposerLive?.reload();
});

// The game preview asks here which pictures to draw (frame-art.js): the build's catalog with the
// draft's pictures for every tenant and theme, and the tenant and theme on the stage.
window.ComposerArtPreview={
 async manifest(built){
  const g=game(),draft=await readDraft(g);
  if(g===game()){art=draft;if(!catalog){catalog=built;catalogFor=g}}
  const brands={};
  const urls=slots=>Object.fromEntries(Object.entries(slots||{}).map(([id,p])=>[id,editors().artUrl(p.media)]));
  for(const [brand,entry] of Object.entries(draft)){
   brands[brand]={slots:urls(entry.slots),themes:Object.fromEntries(Object.entries(entry.themes||{}).map(([t,s])=>[t,urls(s)]))};
  }
  // Signed out, the build's own released pictures stay as they are.
  return {...built,brands:editors()?.enabled?brands:built.brands||{},look:look()};
 }
};
})();
