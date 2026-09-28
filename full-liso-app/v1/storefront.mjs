import {parseProduct,parseSitemap} from './store-parser.mjs';
const cache=new Map(),pending=new Map();
async function get(path){const res=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('No se pudo consultar la tienda.');return res.text();}
export async function product(slug,{fresh=false}={}){
 if(!/^[a-z0-9][a-z0-9-]{0,130}$/.test(slug))throw Error('Producto no válido.');
 const old=cache.get(slug);if(old&&Date.now()-old.fetchedAt<(fresh?3000:45000))return old;if(pending.has(slug))return pending.get(slug);
 const job=(async()=>{try{const result=parseProduct(await get('/productos/'+slug+'/'),slug);cache.set(slug,result);return result;}finally{pending.delete(slug);}})();pending.set(slug,job);return job;
}
export async function catalog(){
 const slugs=parseSitemap(await get('/sitemap.xml')),products=[],errors=[];let cursor=0;
 if(!slugs.length||slugs.length>500)throw Error('No se pudo leer el catálogo.');
 await Promise.all(Array.from({length:3},async()=>{while(cursor<slugs.length){const slug=slugs[cursor++];try{products.push(await product(slug));}catch{errors.push({slug});}}}));
 products.sort((a,b)=>a.name.localeCompare(b.name,'es'));
 return {products,errors,complete:errors.length===0,checkedAt:Date.now()};
}
export async function apiFetch(url,options){
 if(url==='/api/catalog')return {ok:true,json:()=>catalog()};
 if(String(url).startsWith('/api/catalog/product/')){const u=new URL(url,location.origin);return {ok:true,json:()=>product(u.pathname.split('/').pop(),{fresh:u.searchParams.get('fresh')==='1'})};}
 if(url==='/api/ai')return {ok:true,json:async()=>({available:false,reason:'Las herramientas con IA todavía no están habilitadas. Podés usar el borrador manual.'})};
 return globalThis.fetch(url,options);
}
