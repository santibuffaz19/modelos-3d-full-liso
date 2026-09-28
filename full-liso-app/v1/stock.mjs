export const STOCK_MAX_AGE=90000;
export const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function variantStatus(v){if(v.available===false||v.stock===0)return 'out';if(v.available!==false&&Number.isInteger(v.stock)&&v.stock>0)return 'available';return 'unknown';}
export function optionValue(v,kind){return Object.entries(v.options).find(([key])=>kind==='color'?normalize(key)==='color':/^(talle|tamano|talla)$/.test(normalize(key)))?.[1]||null;}
export function isFresh(product,now=Date.now()){return !!product&&!product.stale&&Number.isFinite(product.fetchedAt)&&now-product.fetchedAt<STOCK_MAX_AGE&&now-product.fetchedAt>=-5000;}
const colorAlias={negro:'negro',blanco:'blanco',marino:'marino',azulmarino:'marino',grismelange:'grismelange'};
const sizeAlias={'3xl':'xxxl','2xl':'xxl'};
export function findVariant(product,color,size){
  const colorKey=colorAlias[normalize(color)]||normalize(color),sizeKey=sizeAlias[normalize(size)]||normalize(size);
  const found=product?.variants.filter(v=>(colorAlias[normalize(optionValue(v,'color')||'Único')]||normalize(optionValue(v,'color')||'Único'))===colorKey&&(sizeAlias[normalize(optionValue(v,'size')||Object.entries(v.options).filter(([k])=>normalize(k)!=='color').map(([,v])=>v).join(' · ')||'Único')]||normalize(optionValue(v,'size')||Object.entries(v.options).filter(([k])=>normalize(k)!=='color').map(([,v])=>v).join(' · ')||'Único'))===sizeKey)||[];
  return found.length===1?found[0]:null;
}
export function selectedTotal(state,color,size){return ['plain','custom'].reduce((sum,mode)=>sum+(state.quantitiesByMode?.[mode]?.[color]?.[size]||0),0);}
export function capacity(product,color,size,now=Date.now()){
  if(!isFresh(product,now))return {known:false,max:0,label:'Sin verificar'};
  const variant=findVariant(product,color,size);if(!variant)return {known:true,max:0,label:'No disponible'};
  if(variantStatus(variant)==='out')return {known:true,max:0,label:'Sin stock',variant};
  if(variantStatus(variant)==='unknown')return {known:false,max:0,label:'Consultar stock',variant};
  return {known:true,max:variant.stock,label:variant.stock===1?'Última unidad':`${variant.stock} disponibles`,variant};
}
export function checkQuantity(state,product,color,size,mode,value,now=Date.now()){
  if(!Number.isInteger(value)||value<0||value>999)return 'Ingresá una cantidad entera entre 0 y 999.';
  const current=state.quantitiesByMode?.[mode]?.[color]?.[size]||0;if(value<=current)return null;
  const stock=capacity(product,color,size,now);if(!stock.known)return 'Necesitamos verificar el stock antes de sumar prendas.';
  const other=selectedTotal(state,color,size)-current;
  return value+other>stock.max?(stock.max?`${stock.max===1?'Queda 1 unidad':'Quedan '+stock.max+' unidades'} de esta variante, entre lisas y estampadas.`:'Esta combinación no tiene stock.'):null;
}
export function stockIssues(state,product,now=Date.now()){
  const seen=new Set(),issues=[];
  for(const group of Object.values(state.quantitiesByMode||{}))for(const [color,quantities]of Object.entries(group))for(const [size,n]of Object.entries(quantities)){
    const key=color+'|'+size;if(!n||seen.has(key))continue;seen.add(key);
    const total=selectedTotal(state,color,size),stock=capacity(product,color,size,now);
    if(!stock.known||total>stock.max)issues.push({color,size,total,max:stock.max,known:stock.known,message:stock.known?`Pediste ${total}; hay ${stock.max}.`:'Disponibilidad sin verificar.'});
  }
  return issues;
}
