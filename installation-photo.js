/* Une seule photo JPEG compressée, stockée sous les mêmes droits que le signalement. */
(function(root){
  'use strict';
  const MAX=300000;
  const valid=value=>typeof value==='string' && value.length<=MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  async function compress(file){
    if(!file || !/^image\//.test(file.type)) throw Error('Choisissez une image.');
    if(file.size>20*1024*1024) throw Error('Image trop volumineuse (20 Mo maximum).');
    const url=URL.createObjectURL(file);
    try {
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.8,.65,.5,.35,.2]) {const result=canvas.toDataURL('image/jpeg',quality);if(valid(result))return result;}
      throw Error('Photo trop détaillée. Choisissez une autre image.');
    } finally {URL.revokeObjectURL(url);}
  }
  function html(value){return valid(value)?`<img src="${value}" alt="Photo du signalement" style="display:block;max-width:100%;max-height:360px;object-fit:contain;margin:12px 0;border-radius:12px">`:'';}
  root.InstallationPhoto={valid,compress,html};
})(typeof window==='undefined'?globalThis:window);
