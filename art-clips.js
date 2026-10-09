/* Animated clips into sprite sheets, in the browser: for a tenant's hero, what a game's own
   packing tool does for the game's. An image generator (SpriteCook) animates a character still
   into short clips, one animated WebP or GIF each; a game's skins.json says which sheet each clip
   makes, how many frames, and which frames of a clip go to which sheet. Assets (art.js) calls
   these with the files a person picks and saves the sheets they return.
   - decode: every frame of an animated picture, composited, as a canvas;
   - sheet: frames laid on a grid of square cells, left to right, top to bottom;
   - matched: frames scaled and moved so their first frame stands exactly where a reference frame
     stands (a jump animated from a padded copy, put back onto the idle), on a larger cell;
   - padded: a still with room around it, for animating a move that leaves the frame. */
(function(){
'use strict';
function canvas(width,height){const c=document.createElement('canvas');c.width=Math.round(width);c.height=Math.round(height);return c}
function context(c){const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';return ctx}
const TYPES={webp:'image/webp',gif:'image/gif',png:'image/apng',apng:'image/apng'};

async function decode(file){
 if(typeof ImageDecoder==='undefined')throw Error('This browser cannot read animated clips. Open Composer in Chrome or Edge.');
 const type=TYPES[(file.name.split('.').pop()||'').toLowerCase()]||file.type;
 if(!type||!await ImageDecoder.isTypeSupported(type))throw Error(file.name+' is not an animated WebP or GIF.');
 const decoder=new ImageDecoder({data:await file.arrayBuffer(),type});
 try{
  await decoder.tracks.ready;await decoder.completed;
  const count=decoder.tracks.selectedTrack.frameCount,frames=[];
  for(let index=0;index<count;index++){
   const {image}=await decoder.decode({frameIndex:index});
   const c=canvas(image.displayWidth,image.displayHeight);context(c).drawImage(image,0,0);image.close();frames.push(c);
  }
  if(frames.length<2)throw Error(file.name+' holds one picture. Upload the animation itself, as SpriteCook made it (WebP or GIF).');
  return frames;
 }finally{decoder.close()}
}

/** The box around everything not fully transparent, its right and bottom exclusive, or null. */
function bounds(c){
 const {data,width,height}=context(c).getImageData(0,0,c.width,c.height);
 let left=width,top=height,right=0,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){if(x<left)left=x;if(x>=right)right=x+1;if(y<top)top=y;if(y>=bottom)bottom=y+1}
 return right>left?{left,top,right,bottom}:null;
}

/** `count` frames of a clip: all of them when it has exactly that many, else spread evenly over it. */
function spread(frames,count){
 if(frames.length===count)return frames;
 return Array.from({length:count},(_,i)=>frames[Math.round(count>1?i*(frames.length-1)/(count-1):0)]);
}

/** Each frame drawn square into a cell, the cells laid on the grid. */
function sheet(frames,{columns,rows,cell}){
 const out=canvas(columns*cell,rows*cell),ctx=context(out);
 frames.forEach((frame,index)=>{
  // A frame that is not square is fitted into its cell, centred, at its own proportions.
  const scale=Math.min(cell/frame.width,cell/frame.height),w=frame.width*scale,h=frame.height*scale;
  ctx.drawImage(frame,(index%columns)*cell+(cell-w)/2,Math.floor(index/columns)*cell+(cell-h)/2,w,h);
 });
 return out;
}
/** One cell of a frame, as `sheet` draws it. */
function cellOf(frame,cell){return sheet([frame],{columns:1,rows:1,cell})}

/**
 * The frames scaled so the character in the first one is as tall as in `reference` (a cell of
 * the clip it must match), and moved so both stand on the same spot, `reference` centred in a
 * larger cell of `size`: the extra room is what the move needs. Every frame is moved alike.
 */
function matched(frames,reference,size){
 const own=bounds(frames[0]),ref=bounds(reference);
 if(!own||!ref)throw Error('A clip’s first frame is empty, so it cannot be matched to the idle.');
 const scale=(ref.bottom-ref.top)/(own.bottom-own.top),margin=(size-reference.width)/2;
 const dx=Math.round((ref.left+ref.right)/2+margin-(own.left+own.right)/2*scale);
 const dy=Math.round(ref.bottom+margin-own.bottom*scale);
 return frames.map(frame=>{const out=canvas(size,size);context(out).drawImage(frame,dx,dy,frame.width*scale,frame.height*scale);return out});
}

/** The still with room around it: the character at `share` of a square canvas of `side`. */
async function padded(file,share,side=1024){
 const bitmap=await createImageBitmap(file),c=canvas(bitmap.width,bitmap.height);context(c).drawImage(bitmap,0,0);bitmap.close();
 const box=bounds(c);if(!box)throw Error(file.name+' is empty.');
 const w=box.right-box.left,h=box.bottom-box.top,scale=share*side/Math.max(w,h);
 const out=canvas(side,side);
 context(out).drawImage(c,box.left,box.top,w,h,(side-w*scale)/2,(side-h*scale)/2,w*scale,h*scale);
 return out;
}

const png=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('The sheet could not be made.')),'image/png'));
window.ComposerArtClips={decode,bounds,spread,sheet,cellOf,matched,padded,png};
})();
