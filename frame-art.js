/* Composer's picture draft in its own game preview. Composer puts this script first in the page of
   every game it serves (tools/preview.py locally, tools/pages.py when hosted), beside
   frame-sounds.js. A game that lets a tenant replace its pictures reads skins.json before any art;
   inside Composer's frame that request is answered with the built catalog, the draft's pictures
   for every tenant and theme laid in (still in Composer's storage, as absolute URLs), and the
   tenant and theme on Composer's stage as `look`. A picture added in Assets is then seen as soon as
   the game reloads, before anything is applied, committed or rebuilt. Anywhere else (a player's
   browser, the showcase) it does nothing. */
(function(){
'use strict';
let host=null;
try{host=window.parent!==window&&window.parent.ComposerArtPreview||null}catch{host=null}
if(!host||typeof window.fetch!=='function')return;
const native=window.fetch.bind(window);
const CATALOG=/\/skins\.json$/;
window.fetch=async function(input,options){
 const url=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
 let at;try{at=new URL(url,location.href)}catch{return native(input,options)}
 if(at.origin!==location.origin||!CATALOG.test(at.pathname))return native(input,options);
 const built=await native(input,options);
 if(!built.ok)return built;
 try{
  const manifest=await host.manifest(await built.clone().json());
  return new Response(JSON.stringify(manifest),{status:200,headers:{'Content-Type':'application/json'}});
 }catch(error){
  console.warn('Composer: the picture draft was not applied to the preview.',error);
  return built;
 }
};
})();
