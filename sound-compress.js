/* Compression before a sound is added. The picked file is decoded here, in the browser, and
   written again as a constant-bitrate MP3 at the quality chosen in a small window, which can
   be heard before it is added. MP3 is the one format every browser decodes, iPhones included,
   and the game builds pass it through untouched, so the size shown is what players download.
   The encoder (vendor/lame.min.js, lamejs 1.2.1) loads only when something is compressed.

   An MP3 starts and ends with a little silence of the encoder's making, which a loop would
   play on every turn. The file therefore opens with a LAME info frame that tells decoders how
   much to drop, as every LAME-made MP3 does; browsers then decode exactly the source length.

     const file=await ComposerSoundCompress.choose(picked,{label:'Background music'});   // a File, or null */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RATE=44100,ENCODER_DELAY=576,QUALITIES=[[64,'Smallest'],[96,'Balanced'],[128,'Clear'],[160,'Best']];

let lame=null;
function loadEncoder(){
 if(window.lamejs?.Mp3Encoder)return Promise.resolve();
 lame??=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='vendor/lame.min.js';
  script.onload=resolve;script.onerror=()=>{lame=null;reject(Error('The MP3 encoder did not load. Reload Composer and try again.'))};
  document.head.append(script);
 });
 return lame;
}

// Decoding through an offline context at 44.1 kHz resamples whatever rate the file has.
async function decode(file){return new OfflineAudioContext(1,1,RATE).decodeAudioData(await file.arrayBuffer())}

function pcm(buffer,channels){
 const length=buffer.length,sources=[...Array(buffer.numberOfChannels)].map((_,c)=>buffer.getChannelData(c));
 const out=[...Array(channels)].map(()=>new Int16Array(length));
 const toInt=v=>Math.max(-32768,Math.min(32767,Math.round(v*32767)));
 if(channels===1){
  for(let i=0;i<length;i++){let sum=0;for(const s of sources)sum+=s[i];out[0][i]=toInt(sum/sources.length)}
 }else for(let c=0;c<2;c++){const s=sources[Math.min(c,sources.length-1)];for(let i=0;i<length;i++)out[c][i]=toInt(s[i])}
 return out;
}

// The MP3 frame header fields this file needs: sample rate, samples and bytes per frame.
const RATES=[[44100,48000,32000],[22050,24000,16000],[11025,12000,8000]];
function header(bytes,at){
 if(bytes[at]!==0xff||(bytes[at+1]&0xe0)!==0xe0)throw Error('The encoder wrote an unreadable MP3.');
 const version=(bytes[at+1]>>3)&3,mpeg1=version===3,rate=RATES[mpeg1?0:version===2?1:2][(bytes[at+2]>>2)&3];
 const mono=(bytes[at+3]>>6)===3,samples=mpeg1?1152:576;
 return {rate,samples,mono,side:mpeg1?(mono?17:32):(mono?9:17),bytes:kbps=>Math.floor(samples/8*kbps*1000/rate)};
}

// LAME lowers the sample rate for a low bitrate (64 kbps stereo is written at 24 kHz). The
// sound is resampled to that rate here first, so the encoder keeps every sample it is given
// and the counts in the info frame are exact.
async function encoderRate(channels,kbps){
 const probe=new window.lamejs.Mp3Encoder(channels,RATE,kbps),silence=new Int16Array(1152*4);
 let out=probe.encodeBuffer(silence,silence);if(!out.length)out=probe.flush();
 return header(new Uint8Array(out.buffer,out.byteOffset,out.length),0).rate;
}
async function resample(buffer,rate){
 if(buffer.sampleRate===rate)return buffer;
 const context=new OfflineAudioContext(buffer.numberOfChannels,Math.ceil(buffer.length*rate/buffer.sampleRate),rate);
 const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start();
 return context.startRendering();
}

async function encode(source,{kbps,mono},progress=()=>{}){
 await loadEncoder();
 const channels=mono||source.numberOfChannels<2?1:2,rate=await encoderRate(channels,kbps);
 const buffer=await resample(source,rate),data=pcm(buffer,channels),total=buffer.length;
 const encoder=new window.lamejs.Mp3Encoder(channels,rate,kbps),parts=[],step=1152*32;
 for(let at=0;at<total;at+=step){
  const out=encoder.encodeBuffer(data[0].subarray(at,at+step),channels>1?data[1].subarray(at,at+step):undefined);
  if(out.length)parts.push(out);
  // Yield now and then so the window can show progress and stay responsive.
  if((at/step)%16===15){progress(at/total);await new Promise(resolve=>setTimeout(resolve))}
 }
 parts.push(encoder.flush());progress(1);
 const body=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
 for(const part of parts){body.set(new Uint8Array(part.buffer,part.byteOffset,part.length),offset);offset+=part.length}
 return withInfoFrame(body,total,kbps);
}

// CRC-16 (polynomial 0x8005, reflected), the checksum LAME puts on its info frame.
const CRC=new Uint16Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xa001:c>>>1;return c});
const crc16=(bytes,end)=>{let c=0;for(let i=0;i<end;i++)c=(c>>>8)^CRC[(c^bytes[i])&255];return c};

// The MP3 with a first, silent frame that carries the Xing "Info" block and LAME's extension:
// frame count, byte count, seek table, and the encoder delay and end padding to discard.
function withInfoFrame(body,samples,kbps){
 const first=header(body,0);let frames=0;
 for(let at=0;at+4<=body.length;frames++)at+=header(body,at).bytes(kbps)+((body[at+2]>>1)&1);
 const size=first.bytes(kbps),frame=new Uint8Array(size),view=new DataView(frame.buffer);
 frame.set(body.subarray(0,4));frame[2]&=~2;
 const total=size+body.length,padding=Math.max(0,Math.min(4095,frames*first.samples-ENCODER_DELAY-samples));
 let at=4+first.side;
 const text=s=>{for(const ch of s)frame[at++]=ch.charCodeAt(0)};
 const u32=v=>{view.setUint32(at,v);at+=4};
 text('Info');u32(0x0f);u32(frames);u32(total);
 for(let i=0;i<100;i++)frame[at++]=Math.floor(i*256/100);
 u32(0);
 text('LAME3.100');frame[at++]=1;at+=1+4+2+2+1;frame[at++]=Math.min(255,kbps);
 frame[at++]=ENCODER_DELAY>>4;frame[at++]=((ENCODER_DELAY&15)<<4)|(padding>>8);frame[at++]=padding&255;
 at+=1+1+2;u32(total);at+=2;
 view.setUint16(at,crc16(frame,at));
 const file=new Uint8Array(total);file.set(frame);file.set(body,size);
 return file;
}

const mb=bytes=>bytes<1e6?Math.max(1,Math.round(bytes/1e3))+' KB':(bytes/1e6).toFixed(bytes<1e7?2:1)+' MB';
const clock=seconds=>{if(seconds<60)return seconds.toFixed(1)+' s';const whole=Math.round(seconds);return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0')};
const glyph=name=>typeof window.icon==='function'?window.icon(name):(name==='stop'?'■':'▶');

let dialog=null;
// Resolves to the file to add — the compressed one or the original — or null when called off.
// The window compares the two side by side: each has a play button, and switching between them
// while one plays carries on from the same moment, so the difference is heard, not guessed.
function choose(file,options={}){
 if(!dialog){dialog=document.createElement('dialog');dialog.className='share-dialog ask-dialog sound-compress';document.body.append(dialog)}
 const stem=file.name.replace(/\.[^.]+$/,'')||'sound',wav=/\.wav$/i.test(file.name);
 const chips=(name,list)=>list.map(([value,title,hint])=>'<label><input type="radio" name="'+name+'" value="'+value+'"><span>'+title+(hint?'<small>'+hint+'</small>':'')+'</span></label>').join('');
 const row=(kind,title)=>'<div class="sound-compress-row" data-row="'+kind+'">'
  +'<button type="button" class="sound-compress-play" data-play="'+kind+'" aria-label="Play the '+kind+'" disabled>'+glyph('play')+'</button>'
  +'<div class="sound-compress-what"><strong>'+title+'</strong><span data-meta="'+kind+'"></span></div>'
  +'<div class="sound-compress-size"><b data-size="'+kind+'"></b><small data-change="'+kind+'"></small></div></div>';
 dialog.innerHTML='<form method="dialog">'
  +'<h2>Add a sound'+(options.label?' to '+esc(options.label):'')+'</h2>'
  +'<p class="sound-compress-file" title="'+esc(file.name)+'">'+esc(file.name)+'</p>'
  +'<div class="sound-compress-compare">'+row('original','Original')+row('compressed','Compressed MP3')+'</div>'
  +'<fieldset class="sound-compress-choice" data-quality disabled><legend>Quality</legend>'+chips('sound-kbps',QUALITIES.map(([kbps,name])=>[kbps,name,kbps+' kbps']))+'</fieldset>'
  +'<fieldset class="sound-compress-choice" data-channels disabled><legend>Channels</legend>'+chips('sound-channels',[['stereo','Stereo'],['mono','Mono']])+'</fieldset>'
  +(wav?'<p class="sound-compress-note">A WAV also works as it is: the game build turns it into Opus and AAC itself.</p>':'')
  +'<div class="ask-actions"><button type="button" class="wb-button" value="cancel">Cancel</button><span class="sound-compress-gap"></span><button type="button" class="wb-button" data-original>Add original</button><button type="submit" class="wb-button primary" value="ok" disabled>Add compressed</button></div></form>';
 const $=s=>dialog.querySelector(s),buttons={original:$('[data-play=original]'),compressed:$('[data-play=compressed]')};
 let buffer=null,busy=false,player=null,playing='',url='';const made=new Map(),originalUrl=URL.createObjectURL(file);
 const settings=()=>({kbps:Number(dialog.querySelector('[name=sound-kbps]:checked')?.value||96),mono:dialog.querySelector('[name=sound-channels]:checked')?.value==='mono'||buffer?.numberOfChannels<2});
 const key=s=>s.kbps+(s.mono?'m':'s');
 const text=(what,value)=>{const node=$(what);if(node)node.textContent=value};
 function stopPlaying(){
  if(player){player.onended=null;player.pause();player=null}
  for(const [kind,button] of Object.entries(buttons)){button.innerHTML=glyph('play');button.setAttribute('aria-label','Play the '+kind);button.classList.remove('is-playing')}
  playing='';
 }
 const lock=on=>{busy=on;for(const node of dialog.querySelectorAll('fieldset,[data-play],[value=ok]'))node.disabled=on||!buffer;if(!buffer)buttons.original.disabled=false};
 function show(){
  if(!buffer)return;
  const s=settings(),bytes=made.get(key(s))?.length,estimate=bytes??Math.round(s.kbps*125*buffer.duration);
  const change=Math.round((1-estimate/file.size)*100);
  text('[data-meta=compressed]',s.kbps+' kbps · '+(s.mono?'mono':'stereo')+(bytes?'':' · made when you play or add it'));
  text('[data-size=compressed]',(bytes?'':'≈ ')+mb(estimate));
  const badge=$('[data-change=compressed]');badge.textContent=change>0?'−'+change+'%':change<0?'+'+(-change)+'%':'same size';
  badge.classList.toggle('is-worse',change<10);
  $('[data-row=compressed]').classList.remove('sound-error');
 }
 async function compressed(){
  const s=settings(),k=key(s);
  if(made.has(k))return made.get(k);
  lock(true);
  try{
   const bytes=await encode(buffer,s,share=>text('[data-meta=compressed]','Compressing… '+Math.round(share*100)+'%'));
   made.set(k,bytes);return bytes;
  }finally{lock(false);show()}
 }
 // `from` is where to start; by default the moment the other version had reached.
 async function play(kind,from=null){
  if(from===null){if(playing===kind)return stopPlaying();from=player?player.currentTime:0}
  stopPlaying();
  let source=originalUrl;
  if(kind==='compressed'){const bytes=await compressed();if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));source=url}
  player=new Audio(source);player.currentTime=from;player.onended=stopPlaying;playing=kind;
  const button=buttons[kind];button.innerHTML=glyph('stop');button.setAttribute('aria-label','Stop');button.classList.add('is-playing');
  await player.play();
 }
 return new Promise(resolve=>{
  const done=value=>{stopPlaying();if(url)URL.revokeObjectURL(url);URL.revokeObjectURL(originalUrl);dialog.onclose=null;if(dialog.open)dialog.close();resolve(value)};
  const fail=error=>{stopPlaying();lock(false);text('[data-meta=compressed]',error.message);$('[data-row=compressed]').classList.add('sound-error')};
  $('[value=cancel]').onclick=()=>done(null);
  dialog.oncancel=e=>{e.preventDefault();if(!busy)done(null)};
  $('[data-original]').onclick=()=>done(file);
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(busy||!buffer)return;compressed().then(bytes=>done(new File([bytes],stem+'.mp3',{type:'audio/mpeg'})),fail)};
  // A new setting is a new file: what was playing as "compressed" restarts from the same moment.
  dialog.onchange=()=>{const again=playing==='compressed'?player.currentTime:null;stopPlaying();show();if(again!==null)play('compressed',again).catch(fail)};
  for(const [kind,button] of Object.entries(buttons))button.onclick=()=>play(kind).catch(fail);
  text('[data-size=original]',mb(file.size));text('[data-meta=original]','Reading the file…');
  dialog.showModal();
  decode(file).then(decoded=>{
   buffer=decoded;
   // Long sounds are music: stereo at a balanced rate. Short effects lose nothing in mono.
   const music=decoded.duration>=10,stereo=decoded.numberOfChannels>1;
   dialog.querySelector('[name=sound-kbps][value="'+(music?96:64)+'"]').checked=true;
   dialog.querySelector('[name=sound-channels][value="'+(music&&stereo?'stereo':'mono')+'"]').checked=true;
   text('[data-meta=original]',clock(decoded.duration)+' · '+(stereo?'stereo':'mono')+' · '+Math.round(file.size*8/decoded.duration/1000)+' kbps');
   lock(false);
   if(!stereo)dialog.querySelector('[name=sound-channels][value=stereo]').disabled=true;
   show();
  },()=>{text('[data-meta=original]','This browser cannot read the file, so it cannot be compressed here.');lock(false)});
 });
}

window.ComposerSoundCompress={choose,encode,decode};
})();
