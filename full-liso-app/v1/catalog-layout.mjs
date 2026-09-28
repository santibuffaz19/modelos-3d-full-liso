// Stock is independent of photography. Named gallery photos take precedence
// over variant images: some store variants point to a different color's photo.
const filename=src=>{try{return decodeURIComponent(new URL(src).pathname.split('/').pop()).toLowerCase();}catch{return '';}};
const token=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_');
export function modelPhotos(product){
 const images=[...new Set([...(product.images||[]),product.image].filter(Boolean))];
 const models=images.filter(src=>/(?:^|_)modelo(?:_|-)/.test(filename(src)));
 const lifestyle=images.filter(src=>/(?:^|_)lifestyle(?:_|-)/.test(filename(src)));
 return models.length?[...models,...lifestyle]:lifestyle.length?lifestyle:images.slice(0,1);
}
const aliases={negro_completo:['negro'],azul_marino:['marino'],francia:['azul_francia'],chocolate:['633d0a','chocolate'],gris:['6e6e6e','gris']};
function matchesColor(src,color){
 const names=aliases[token(color)]||[token(color)];
 return names.some(name=>filename(src).includes('_'+name+'_'));
}
export function colorPhoto(product,color,variants=[]){
 const matches=src=>matchesColor(src,color);
 const gallery=(product.images||[]).filter(matches);
 const front=gallery.find(src=>/_(?:frente|frontal)(?:_|-)/.test(filename(src))&&!/_modelo_/.test(filename(src)));
 if(front)return front;
 const variant=variants.find(v=>v.image)?.image;
 // Opaque filenames rely on the store's explicit variant association.
 if(variant&&(!filename(variant).startsWith('p01_')||matches(variant)))return variant;
 return gallery.find(src=>!/_modelo(?:_|-)|_lifestyle_/.test(filename(src)))||null;
}

// Only browse the selected color. A missing model falls back to that color's
// genuine product photographs, never a model wearing a different color.
export function colorModelPhotos(product,color,variants=[]){
 if(!color||color==='Único')return modelPhotos(product);
 const gallery=[...new Set([...(product.images||[]),product.image].filter(Boolean))].filter(src=>matchesColor(src,color));
 const models=gallery.filter(src=>/_modelo(?:_|-)/.test(filename(src)));
 const lifestyle=gallery.filter(src=>/_lifestyle(?:_|-)/.test(filename(src)));
 const plain=gallery.filter(src=>!models.includes(src)&&!lifestyle.includes(src));
 if(gallery.length)return [...models,...lifestyle,...plain];
 const fallback=colorPhoto(product,color,variants);
 return fallback?[fallback]:[];
}
export const isModelPhoto=src=>/_(?:modelo|lifestyle)(?:_|-)/.test(filename(src));
export function catalogImageSources(products){
 return [...new Set(products.flatMap(p=>[p.image,...(p.images||[]),...(p.variants||[]).map(v=>v.image)]).filter(Boolean))];
}
