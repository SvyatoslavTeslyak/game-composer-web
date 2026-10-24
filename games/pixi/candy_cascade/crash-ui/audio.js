/* The game's own sounds, played from its sounds.json: the file Composer's Sounds edits.

   Every game reads the same plan (docs: connecting-a-game, Sounds): events with an id, a level in
   decibels (volume_db), a pitch spread (pitch_jitter) and takes; a play picks one enabled take at
   random (or the next, for an event listed in `rotate`), at gain 10^(volume_db / 20), its rate
   varied by up to the spread. Music is an event named `music` or `music_…`, or in group `music`:
   one enabled take loops while the Music switch is on, eased in and out.

   Takes are fetched with fetch() (Composer's preview answers `media:` names and drafted plans
   that way), by their served path (`assets/` or `public/` dropped) through the game's asset map:
   a WAV the build made into Opus and AAC is asked for in the format this browser plays first. A
   take that is missing or will not decode costs that take only.

   Browsers hold audio until the page is touched: create the player at start, call unlock() on the
   first press. Nothing plays before it. Load this with a script tag (crash-ui/audio.js); it puts
   window.CrashAudio on the page and needs no other kit file. Not wired into any game yet. */
(function(){
'use strict';
const MUSIC=/^music(?:_|$)/;
/** The manifest gives levels in decibels; Web Audio wants a linear gain. */
const gain=db=>Number.isFinite(Number(db))?Math.pow(10,Number(db)/20):1;
/** A take's path in the build: the manifest names it from the game's root. */
const servedPath=file=>/^(?:https?|blob|data|media):/.test(file)?file:String(file).replace(/^(?:public|assets)\//,'');
const isMusic=event=>MUSIC.test(event.id||'')||event.group==='music';
/**
 * What to fetch for a take, in order. `map` is the build's asset map (original → its converted
 * files); `opus` whether this browser plays Opus. A WAV without a map entry is tried as the
 * build would have made it, then as itself; an Ogg is tried as AAC first where Opus does not play.
 */
function candidates(file,{map=null,opus=true}={}){
 const path=servedPath(file);
 if(/^(?:https?|blob|data|media):/.test(path))return [path];
 const mapped=map&&map[path];
 const order=list=>[...list].sort((a,b)=>rank(a)-rank(b));
 const rank=name=>/\.ogg$/i.test(name)?(opus?0:1):/\.m4a$/i.test(name)?(opus?1:0):2;
 if(Array.isArray(mapped)&&mapped.some(name=>/\.(ogg|m4a)$/i.test(name)))return order(mapped);
 if(/\.wav$/i.test(path))return order([path.replace(/\.wav$/i,'.ogg'),path.replace(/\.wav$/i,'.m4a')]).concat(path);
 if(/\.ogg$/i.test(path)&&!opus)return [path.replace(/\.ogg$/i,'.m4a'),path];
 return [path];
}
/** A sample this loud starts the sound; with `normalize`, anything before it is silence. */
const ONSET=0.02;
/** Where a take's sound starts and the gain that brings its peak to full scale. */
function measure(buffer){
 let peak=0,first=buffer.length;
 for(let c=0;c<buffer.numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=0;i<data.length;i++){const v=Math.abs(data[i]);if(v>peak)peak=v;if(v>ONSET&&i<first)first=i}}
 const offset=Math.max(0,first/buffer.sampleRate-0.005);
 return {offset:first<buffer.length?offset:0,norm:peak>0.001?Math.min(4,0.9/peak):1};
}
const tokens=()=>(typeof window!=='undefined'&&window.CrashTokens)||{};

class Player {
 /**
  * {manifest = 'audio/sounds.json', file(path) → URL (the game's asset map; default as it is),
  * assetMap (an object, or the URL of the build's asset-map.json), fetch, prefer: 'auto' | 'opus' |
  * 'aac', voices = 8 (0: no limit), jitter = 0 (the spread when an event names none), rotate: [ids],
  * normalize = false (trim each take's leading silence and bring it to one peak), musicFadeIn,
  * musicFadeOut (ms; the kit's motion tokens by default), pauseHidden = true}
  */
 constructor(options={}){
  this.options={manifest:'audio/sounds.json',voices:8,jitter:0,rotate:[],normalize:false,pauseHidden:true,prefer:'auto',...options};
  this.fetch=this.options.fetch||((...args)=>fetch(...args));
  this.events=new Map();this.clips=new Map();this.bytes=new Map();this.turns=new Map();this.voices=[];this.nextVoice=0;
  this.context=null;this.master=null;this.musicGain=null;this.music=null;this.musicId='';
  this.soundOn=true;this.musicOn=false;this.muted=false;this.unlocked=false;
  this.ready=this.load();
  if(this.options.pauseHidden&&typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',()=>{if(document.hidden)this.sleep();else this.wake()});
 }
 /** What the browser asks for: a path in the build through the game's mapping; an address as it is. */
 url(name){return this.options.file&&!/^(?:https?|blob|data|media):/.test(name)?this.options.file(name):name}
 get opus(){
  if(this.options.prefer==='opus')return true;if(this.options.prefer==='aac')return false;
  try{return typeof Audio==='function'&&new Audio().canPlayType('audio/ogg; codecs=opus')!==''}catch{return true}
 }
 async load(){
  let plan=null;
  try{const response=await this.fetch(this.options.manifest,{cache:'no-store'});plan=response.ok?await response.json():null}catch{plan=null}
  let map=this.options.assetMap||null;
  if(typeof map==='string')try{const response=await this.fetch(map);map=response.ok?await response.json():null}catch{map=null}
  this.map=map&&typeof map==='object'?map:null;
  for(const event of plan?.events||[]){
   if(!event||typeof event.id!=='string'||event.runtime_unused)continue;
   this.events.set(event.id,event);
   // Effects come down at once and are decoded once the context exists; music waits until wanted.
   if(!isMusic(event))for(const take of event.takes||[])if(take.enabled!==false)this.fetchTake(take.file);
  }
  if(this.context)await this.decodeAll();
  return [...this.events.keys()];
 }
 /** The bytes of a take: the first of its candidates that answers. */
 fetchTake(file){
  if(!this.bytes.has(file))this.bytes.set(file,(async()=>{
   for(const name of candidates(file,{map:this.map,opus:this.opus})){
    try{const response=await this.fetch(this.url(name));if(response.ok)return await response.arrayBuffer()}catch{/* the next one */}
   }
   return null;
  })());
  return this.bytes.get(file);
 }
 async decode(file){
  if(this.clips.has(file))return this.clips.get(file);
  const context=this.context,bytes=await this.fetchTake(file);
  if(!context||!bytes)return null;
  try{
   // decodeAudioData detaches its input: decode a copy, so a second pass still has the bytes.
   const buffer=await context.decodeAudioData(bytes.slice(0));
   const clip={buffer,...(this.options.normalize?measure(buffer):{offset:0,norm:1})};
   this.clips.set(file,clip);return clip;
  }catch{return null}
 }
 decodeAll(){return Promise.all([...this.bytes.keys()].map(file=>this.decode(file)))}
 /** The first press: the context starts (browsers refuse audio before one), then the music if it is on. */
 unlock(){
  this.unlocked=true;
  if(!this.context){
   const Context=typeof AudioContext!=='undefined'?AudioContext:typeof webkitAudioContext!=='undefined'?webkitAudioContext:null;
   if(!Context)return;
   this.context=new Context();this.master=this.context.createGain();this.master.connect(this.context.destination);
   this.musicGain=this.context.createGain();this.musicGain.gain.value=0;this.musicGain.connect(this.context.destination);
   this.applyMute();void this.decodeAll();
  }
  if(typeof document==='undefined'||!document.hidden)void this.context.resume?.();
  this.updateMusic();
 }
 /** The page went to the background: everything stops with the context. */
 sleep(){void this.context?.suspend?.()}
 /** Back in front: carries on where it was, once the player had let it play. */
 wake(){if(this.unlocked)void this.context?.resume?.()}
 setSound(on){this.soundOn=!!on;if(!this.soundOn)this.stopAll()}
 setMusic(on,id){if(id)this.musicId=id;this.musicOn=!!on;this.updateMusic()}
 /** One mute over both, as the app's (host.js) or the game's own; the switches stay as they are. */
 mute(value){this.muted=!!value;this.applyMute()}
 applyMute(){if(this.master)this.master.gain.value=this.muted?0:1;if(this.muted)this.stopAll();this.updateMusic()}
 /** The level an event plays at (0 to 1 and more), from the plan. */
 level(id){const event=this.events.get(id);return event?gain(event.volume_db):0}
 /** A kit panel sound of the game's own (config.soundOverrides): {file, volume, jitter}. */
 uiSound(id){
  const event=this.events.get(id),take=event?.takes?.find(t=>t.enabled!==false);
  const name=take?candidates(take.file,{map:this.map,opus:this.opus})[0]:null;
  const url=name?this.url(name):null;
  return {file:url&&typeof location!=='undefined'&&!/^(?:https?|blob|data|media):/.test(url)?new URL(url,location.href).href:url,volume:event&&take?Math.min(1,gain(event.volume_db)):0,jitter:event?.pitch_jitter??this.options.jitter};
 }
 /**
  * Plays one take of an event: {delay (s), rate, volume (a gain on top of the plan's)}. False when
  * nothing played (sound off, muted, not unlocked, no take ready).
  */
 play(id,{delay=0,rate=1,volume=1}={}){
  const context=this.context,event=this.events.get(id);
  if(!context||!this.master||!event||!this.soundOn||this.muted||isMusic(event))return false;
  if(context.state&&context.state!=='running')return false;
  const takes=(event.takes||[]).filter(t=>t.enabled!==false&&this.clips.has(t.file));
  if(!takes.length)return false;
  const turn=this.options.rotate.includes(id)||event.rotate===true;
  const index=turn?(this.turns.set(id,(this.turns.get(id)??-1)+1),this.turns.get(id)%takes.length):Math.floor(Math.random()*takes.length);
  const clip=this.clips.get(takes[index].file),source=context.createBufferSource();
  source.buffer=clip.buffer;
  const jitter=Math.min(0.3,Math.max(0,Number(event.pitch_jitter??this.options.jitter)||0));
  source.playbackRate.value=rate*(1+(Math.random()*2-1)*jitter);
  const node=context.createGain(),level=clip.norm*gain(event.volume_db)*volume,at=context.currentTime+Math.max(0,delay);
  node.gain.value=level;source.connect(node);node.connect(this.master);
  // A limited number of voices: the next one past the limit takes the oldest's place.
  if(this.options.voices>0){const slot=this.nextVoice++%this.options.voices;try{this.voices[slot]?.stop()}catch{/* already over */}this.voices[slot]=source}
  else{this.voices.push(source);source.onended=()=>{this.voices=this.voices.filter(v=>v!==source)}}
  const length=Number(event.max_secs);
  if(length>0){
   // In real time: the event fades out at its limit, so a knock stays one knock.
   const fade=Math.min(length,0.06);node.gain.setValueAtTime?.(level,at+length-fade);node.gain.linearRampToValueAtTime?.(0,at+length);
   source.start(at,clip.offset);source.stop(at+length+0.01);
  }else source.start(at,clip.offset);
  return true;
 }
 stopAll(){for(const voice of this.voices){try{voice?.stop()}catch{/* already over */}}this.voices=[];this.nextVoice=0}
 /** The music event on show: the one named, else `music`, else the first music event. */
 musicEvent(){return this.events.get(this.musicId)||this.events.get('music')||[...this.events.values()].find(isMusic)||null}
 /** Starts or stops the loop to match the switch and the mute, eased in and out. */
 async updateMusic(){
  const context=this.context,event=this.musicEvent(),want=this.musicOn&&!this.muted&&this.unlocked;
  if(!context||!this.musicGain)return;
  const now=context.currentTime,level=event?gain(event.volume_db):0,gainParam=this.musicGain.gain;
  const fadeIn=(this.options.musicFadeIn??tokens().MOTION_MUSIC_FADE_IN_MS??0)/1000,fadeOut=(this.options.musicFadeOut??tokens().MOTION_MUSIC_FADE_OUT_MS??0)/1000;
  if(!want){
   if(!this.music)return;
   const playing=this.music;this.music=null;
   gainParam.cancelScheduledValues?.(now);gainParam.setValueAtTime?.(gainParam.value,now);gainParam.linearRampToValueAtTime?.(0,now+fadeOut);
   try{playing.stop(now+fadeOut+0.05)}catch{/* already over */}
   return;
  }
  if(this.music||!event||this.musicLoading)return;
  const takes=(event.takes||[]).filter(t=>t.enabled!==false);if(!takes.length)return;
  this.musicLoading=true;
  const take=takes[Math.floor(Math.random()*takes.length)];
  this.fetchTake(take.file);const clip=await this.decode(take.file);
  this.musicLoading=false;
  if(!clip||this.music||!(this.musicOn&&!this.muted))return;
  const source=context.createBufferSource();source.buffer=clip.buffer;source.loop=true;source.connect(this.musicGain);
  const at=context.currentTime;gainParam.cancelScheduledValues?.(at);gainParam.setValueAtTime?.(0,at);gainParam.linearRampToValueAtTime?.(level,at+fadeIn);if(!gainParam.linearRampToValueAtTime)gainParam.value=level;
  source.start(at);this.music=source;
 }
}
window.CrashAudio={Player,create:options=>new Player(options),candidates,servedPath,gain,isMusic};
})();
