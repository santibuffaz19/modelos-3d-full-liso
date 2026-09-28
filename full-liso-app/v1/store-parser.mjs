// Server-only, read-only storefront adapter. No cart, stock sheet or credentials.
export const STORE='https://full-liso.com.ar';
export const PRODUCT_TTL=45000;
export const decodeHtml=s=>String(s??'').replace(/&(#x[\da-f]+|#\d+|quot|apos|amp|lt|gt|nbsp);/gi,(_,c)=>c[0]==='#'?String.fromCodePoint(Math.min(0x10ffff,parseInt(c.slice(c[1].toLowerCase()==='x'?2:1),c[1].toLowerCase()==='x'?16:10))):({quot:'"',apos:"'",amp:'&',lt:'<',gt:'>',nbsp:' '}[c.toLowerCase()]));
const clean=s=>decodeHtml(String(s??'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attr=(tag,name)=>{const m=tag.match(new RegExp('\\b'+name+'\\s*=\\s*(["\'])([\\s\\S]*?)\\1','i'));return m?decodeHtml(m[2]):null;};
export function productURL(slug){if(!/^[a-z0-9][a-z0-9-]{0,130}$/.test(slug))throw Error('Producto no válido.');return `${STORE}/productos/${slug}/`;}
const slugFrom=url=>{try{const u=new URL(url);return u.origin===STORE&&/^\/productos\/[a-z0-9][a-z0-9-]*\/$/.test(u.pathname)?u.pathname.split('/')[2]:null}catch{return null}};
function imageURL(value){try{const u=new URL(value,STORE);return u.protocol==='https:'&&(/(^|\.)mitiendanube\.com$/.test(u.hostname)||/(^|\.)cloudfront\.net$/.test(u.hostname))?u.href:null}catch{return null}}
export function parseProduct(html,slug,now=Date.now()){
  const url=productURL(slug),schemas=[];
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(attr(m[1],'type')==='application/ld+json'){try{const json=JSON.parse(m[2]);schemas.push(...(Array.isArray(json)?json:[json]));}catch{}}
  const candidates=schemas.flatMap(x=>[x,x.mainEntity,...(x['@graph']||[])]).filter(Boolean);
  const product=candidates.find(x=>x['@type']==='Product'&&[x['@id'],x.offers?.url,x.mainEntityOfPage?.['@id']].some(u=>u&&slugFrom(u)===slug));
  if(!product?.name)throw Error('No se pudo reconocer la ficha del producto.');
  const root=[...html.matchAll(/<[^>]+>/g)].map(m=>m[0]).find(tag=>attr(tag,'id')==='single-product');
  let source=[];try{source=JSON.parse(attr(root||'','data-variants')||'[]');}catch{throw Error('No se pudo interpretar el stock.');}
  if(!Array.isArray(source))throw Error('Variantes no válidas.');
  const options={};
  for(const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)){const id=attr(m[1],'for')?.match(/^variation_(\d+)$/);if(id)options[Number(id[1])-1]=clean(m[2]);}
  const productIds=new Set(source.map(v=>String(v.product_id)));if(productIds.size>1)throw Error('Las variantes no corresponden a una sola ficha.');
  const variants=source.filter(v=>v.is_visible!==false).map(v=>({id:String(v.id),sku:String(v.sku||''),
    options:Object.fromEntries([0,1,2].filter(i=>v['option'+i]!=null).map(i=>[options[i]||'Opción '+(i+1),String(v['option'+i])])),
    stock:Number.isInteger(v.stock)&&v.stock>=0?v.stock:null,available:typeof v.available==='boolean'?v.available:null,
    price:Number.isFinite(v.price_number)?v.price_number:null,image:imageURL(v.image_url)}));
  const images=[];
  for(const m of html.matchAll(/<a\b[^>]*>/gi))if(attr(m[0],'data-fancybox')==='product-gallery'){const src=imageURL(attr(m[0],'href'));if(src&&!images.includes(src))images.push(src);}
  const mainImage=imageURL(Array.isArray(product.image)?product.image[0]:product.image);
  if(!images.length&&mainImage)images.push(mainImage);
  const web=schemas.find(x=>x.mainEntity===product),crumbs=web?.breadcrumb?.itemListElement||[];
  const category=clean(crumbs.length>2?crumbs[crumbs.length-2].name:'Accesorios');
  const price=Number(product.offers?.price),available=variants.some(v=>v.available!==false&&v.stock>0)?'available':variants.length&&variants.every(v=>v.available===false||v.stock===0)?'out':'unknown';
  return {slug,url,id:source.length?String(source[0].product_id):null,name:clean(product.name),description:clean(product.description),category,
    image:images[0]||mainImage,images,price:Number.isFinite(price)&&price>=0?price:null,currency:product.offers?.priceCurrency||'ARS',variants,availability:available,fetchedAt:now};
}
export function parseSitemap(xml){return [...new Set([...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map(m=>slugFrom(decodeHtml(m[1]))).filter(Boolean))].filter(slug=>slug!=='servicio-de-estampado-cm2');}
