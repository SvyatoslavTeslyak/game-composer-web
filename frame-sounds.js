/* Composer's sound draft in its own game preview. Composer puts this script first in the page of
   every game it serves (tools/preview.py locally, tools/pages.py when hosted), so it runs before
   the game and its kit. When the page sits in Composer's frame, the sounds.json each of them
   fetches is answered with the manifest the Sounds page shows, the shared draft laid over the
   library, and a sound the team added ("media:<path>") is fetched from the composer-audio bucket.
   A change in Sounds is then heard as soon as the game reloads, before anything is applied,
   committed or rebuilt. Anywhere else (a player's browser, the showcase) it does nothing. */
(function(){
'use strict';
let host=null;
try{host=window.parent!==window&&window.parent.ComposerSoundPreview||null}catch{host=null}
if(!host||typeof window.fetch!=='function')return;
const native=window.fetch.bind(window);
const KIT_MANIFEST=/\/crash-ui\/assets\/audio\/sounds\.json$/,MANIFEST=/\/audio\/sounds\.json$/;

// The kit's panel loads a take by its path under the audio folder, or by an address as it is: a
// sound the team added is handed to it as its address in the composer-audio bucket, so the preview
// plays the added sound itself; everything else follows the draft.
function kitManifest(draft){
 const at=t=>t.media?{...t,file:host.mediaUrl(t.media)}:t;
 return {...draft,events:(draft.events||[]).map(e=>({...e,takes:(e.takes||[]).map(at)}))};
}

window.fetch=async function(input,options){
 const url=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
 if(url.startsWith('media:'))return native(host.mediaUrl(url.slice(6)),options);
 let at;try{at=new URL(url,location.href)}catch{return native(input,options)}
 if(at.origin!==location.origin||!MANIFEST.test(at.pathname))return native(input,options);
 const kit=KIT_MANIFEST.test(at.pathname),built=await native(input,options);
 try{
  const draft=await host.manifest(kit?'kit':'game');
  if(!draft)return built;
  const manifest=kit?kitManifest(draft):draft;
  return new Response(JSON.stringify(manifest),{status:200,headers:{'Content-Type':'application/json'}});
 }catch(error){
  console.warn('Composer: the sound draft was not applied to the preview.',error);
  return built;
 }
};
})();
