/* Tenant and theme pictures: which picture a game draws in place of its own.

   A game's `skins.json` (in its served root) names every picture a tenant (an operator's brand)
   or one of its themes may replace, by the file the game ships with. Composer's release writes
   each tenant's and theme's pictures into its `brands`; the game ships some there itself.
   The game keeps asking for its own file: `CrashSkins.art(file)` hands back the theme's
   picture, else the tenant's, else the file itself. Only pictures change, never sizes, places
   or rules.

   Inside Composer's preview the same `skins.json` comes back with the unreleased draft laid
   over it (absolute https addresses in Composer's storage) and `look` naming the tenant and
   theme on Composer's stage. Elsewhere the page says which: `data-brand` and `data-theme` on
   <html>.

     await CrashSkins.load({file: asset})          // once, before any art loads
     Assets.load(CrashSkins.art('art/background.png'))

   `file` maps a path in the build to what the browser loads (a game's asset map: WebP or PNG);
   without it a path is loaded as it is. A slot with `css` names a custom property: `load`
   sets it on <html> to the replaced picture, with a `data-skin-<id>` attribute, so a
   stylesheet can draw it and fall back to the game's own file without it.

   Framework-free and token-free: plain JavaScript, `window.CrashSkins` (or `globalThis` in a
   test). Load it with a script tag before the game's own module. */
(function(root){
'use strict';
let replaced=new Map(),toFile=path=>path;
const remote=picture=>/^https?:/.test(picture);

/* The replacements for one look, game file → picture. A layer that changes only part of a group
   that must change whole (`together`: a hero's sheets) changes none of it, so a group is never
   drawn from two sets. The theme's pictures go over the tenant's slot by slot. */
function resolve(manifest,look){
 const slots=(manifest&&manifest.slots)||[];
 const together=new Set(((manifest&&manifest.groups)||[]).filter(g=>g.together).map(g=>g.id));
 const brand=manifest&&manifest.brands&&manifest.brands[look.brand];
 const layers=[(brand&&brand.slots)||{},(look.theme&&brand&&brand.themes&&brand.themes[look.theme])||{}];
 const chosen={};
 for(const layer of layers){
  const complete=group=>slots.filter(s=>s.group===group).every(s=>typeof layer[s.id]==='string');
  for(const slot of slots){
   const picture=layer[slot.id];
   if(typeof picture!=='string'||!picture)continue;
   if(together.has(slot.group)&&!complete(slot.group))continue;
   chosen[slot.id]=picture;
  }
 }
 return new Map(slots.filter(s=>chosen[s.id]).map(s=>[s.file,chosen[s.id]]));
}

/* The tenant and theme the page was opened with. */
function pageLook(){
 const data=typeof document==='undefined'?{}:document.documentElement.dataset;
 return {brand:data.brand||'default',theme:data.theme||''};
}

/* The picture to load for one of the game's own files. */
function art(path){
 const picture=replaced.get(path);
 if(!picture)return toFile(path);
 return remote(picture)?picture:toFile(picture);
}

/* Reads skins.json once. Without it (a dev server, an old build) every picture is the game's own. */
async function load(options){
 const opts=options||{};
 if(typeof opts.file==='function')toFile=opts.file;
 try{
  const response=await fetch(opts.url||'skins.json',{cache:'no-store'});
  if(!response.ok)return;
  const manifest=await response.json();
  const look=manifest.look||opts.look||pageLook();
  replaced=resolve(manifest,{brand:look.brand||'default',theme:look.theme||''});
  if(typeof document!=='undefined')
   for(const slot of manifest.slots||[])
    if(slot.css&&replaced.has(slot.file)){
     document.documentElement.style.setProperty(slot.css,'url("'+new URL(art(slot.file),location.href).href+'")');
     document.documentElement.setAttribute('data-skin-'+slot.id,'');
    }
 }catch(error){
  // No catalog or an unreadable one: the game's own pictures.
 }
}

root.CrashSkins={
 load,
 art,
 resolve,
 /* Whether a tenant or a theme draws its own picture for this file. */
 isReplaced:path=>replaced.has(path),
 /* For tests: forget the replacements (or set them) and the file mapping. */
 reset(map,file){replaced=map instanceof Map?map:new Map();toFile=typeof file==='function'?file:path=>path},
};
})(typeof window!=='undefined'?window:globalThis);
