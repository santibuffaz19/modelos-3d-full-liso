export function properties(item){const p=item.properties||{};return Array.isArray(p)?Object.fromEntries(p.map(x=>[x.name||x.key,x.value])):p;}
export function cartItems(cart){return cart.products||cart.items||[];}
// Read the native cart page. An empty POST to /cart/update/ is rejected with
// empty_quantities; it is not a cart read API. Parse data, never execute scripts.
export function parseCartPage(html){
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 const source=scripts.find(s=>/\bLS\.cart\s*=\s*\{/.test(s));
 if(!source)throw Error('La tienda no devolvió los datos del carrito.');
 let i=source.search(/\bLS\.cart\s*=\s*\{/);i=source.indexOf('{',i);
 const fail=()=>{throw Error('No se pudieron leer los datos del carrito.');},space=()=>{while(/\s/.test(source[i]||'')&&i<source.length)i++;};
 function string(){
  const quote=source[i++];let out='';
  while(i<source.length){const ch=source[i++];if(ch===quote)return out;
   if(ch==='\\'){const esc=source[i++],simple={'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f',"'":"'",'"':'"','\\':'\\','/':'/'};
    if(esc==='u'||esc==='x'){const n=esc==='u'?4:2,hex=source.slice(i,i+n);if(!new RegExp('^[0-9a-fA-F]{'+n+'}$').test(hex))fail();out+=String.fromCharCode(parseInt(hex,16));i+=n;}
    else if(Object.hasOwn(simple,esc))out+=simple[esc];else fail();
   }else{if(ch<' ')fail();out+=ch;}
  }fail();
 }
 function value(depth=0){
  if(depth>30)fail();space();const ch=source[i];
  if(ch==='"'||ch==="'")return string();
  if(ch==='{'||ch==='['){const object=ch==='{',out=object?Object.create(null):[],end=object?'}':']';i++;space();
   while(source[i]!==end){
    if(object){let key;if(source[i]==='"'||source[i]==="'")key=string();else{const match=source.slice(i).match(/^[A-Za-z_$][\w$]*/);if(!match)fail();key=match[0];i+=key.length;}space();if(source[i++]!==':')fail();out[key]=value(depth+1);}
    else out.push(value(depth+1));
    space();if(source[i]===end)break;if(source[i++]!==',')fail();space();
   }i++;return out;
  }
  const token=source.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if(!token)fail();i+=token[0].length;return JSON.parse(token[0]);
 }
 const cart=value();space();if(source[i]!==';'&&i<source.length)fail();
 if(!cart||!Array.isArray(cart.items)&&!Array.isArray(cart.products))fail();
 const items=cartItems(cart);
 if(items.some(x=>!x||!Number.isInteger(Number(x.quantity))||Number(x.quantity)<0))fail();
 return cart;
}
// Tiendanube's HTML includes live item ids and quantities but omits properties.
// Keep only properties actually returned by a successful native cart response,
// keyed to that cart + item + variant; never infer them from a submitted request.
const memory=new Map();
const cartKey=cart=>'fl-cart-receipt-v1-'+String(cart.id??'empty');
function receipt(cart){
 try{const record=globalThis.localStorage?JSON.parse(globalThis.localStorage.getItem(cartKey(cart))||'null'):memory.get(cartKey(cart));return record?.items&&record?.pending?record:{items:{},pending:{}};}catch{return {items:{},pending:{}};}
}
function saveReceipt(cart,record){
 if(globalThis.localStorage)globalThis.localStorage.setItem(cartKey(cart),JSON.stringify(record));
 memory.set(cartKey(cart),record);
}
const itemId=x=>String(x.item_id??x.id);
function remember(cart){
 const record=receipt(cart);
 for(const item of cartItems(cart))if(properties(item)['FL Línea'])record.items[itemId(item)]={variantId:String(item.variant_id),properties:properties(item)};
 saveReceipt(cart,record);return cart;
}
function withReceipts(cart){
 const record=receipt(cart);
 for(const item of cartItems(cart)){
  const saved=record.items[itemId(item)];
  if(saved&&saved.variantId===String(item.variant_id)&&!item.properties)item.properties=saved.properties;
 }
 return cart;
}
function pending(cart,key,value){const holder={id:'pending'},record=receipt(holder);if(value===undefined)return !!record.pending[key];if(value)record.pending[key]=true;else delete record.pending[key];saveReceipt(holder,record);}
export async function readCart(){
 const res=await fetch('/comprar/?fl_cart_read='+Date.now(),{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('No se pudo leer el carrito (HTTP '+res.status+'). Tu diseño sigue guardado.');
 return withReceipts(parseCartPage(await res.text()));
}
export function groupIssues(cart){
 const groups=new Map();for(const item of cartItems(cart)){const p=properties(item),id=p['FL Grupo'];if(!id)continue;if(!groups.has(id))groups.set(id,{area:0,service:0,printed:0});const g=groups.get(id),q=Number(item.quantity)||0;
  if(p['FL Tipo']==='Estampado')g.service+=q;else if(p['FL Tipo']==='Con logo'){const a=Number(p['FL cm2/prenda']);if(!(a>0))return ['Hay un diseño sin medidas verificables.'];g.area+=a*q;g.printed+=q;}
 }
 return [...groups].filter(([,g])=>Math.ceil(Number(g.area.toFixed(6)))!==g.service).map(([id])=>'La cantidad de estampas del diseño '+id.slice(0,8)+' no coincide con sus prendas.');
}
export async function addLines(lines,group,onProgress=()=>{},initialCart){
 let cart=initialCart||await readCart();
 for(let i=0;i<lines.length;i++){
  const line=lines[i],key=group+':'+i,find=()=>cartItems(cart).filter(x=>properties(x)['FL Línea']===key);
  let found=find(),present=found.reduce((n,x)=>n+Number(x.quantity),0);
  if(present===line.quantity){if(found.some(x=>String(x.variant_id)!==String(line.variantId)))throw Error('La variante del grupo cambió. Revisá el carrito.');pending(cart,key,false);continue;}
  if(present!==0)throw Error('Este grupo ya está en el carrito con otra cantidad. Revisalo antes de repetir.');
  if(pending(cart,key))throw Error('El envío anterior de esta línea no tuvo confirmación. Revisá el carrito antes de volver a agregarla.');
  const beforeCart=cart;pending(beforeCart,key,true);
  const form=new URLSearchParams({add_to_cart:line.productId,variant_id:line.variantId,quantity:String(line.quantity),add_to_cart_enhanced:'1'});
  for(const [index,value]of (line.variations||[]).entries())form.set('variation['+index+']',value);
  const props={...line.properties,'FL Grupo':group,'FL Línea':key};for(const [k,v]of Object.entries(props))form.append('properties['+k+']',String(v));
  onProgress('Agregando al carrito · '+(i+1)+' / '+lines.length);
  let result,error;
  try{const res=await fetch('/comprar/',{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(20000)});if(!res.ok){if(res.status>=400&&res.status<500&&res.status!==408)pending(beforeCart,key,false);throw Error('La tienda no confirmó la carga al carrito (HTTP '+res.status+').');}result=await res.json();if(result.success===false){pending(beforeCart,key,false);throw Error('La tienda no pudo agregar la cantidad solicitada.');}if(result.success&&result.cart)remember(result.cart);}catch(e){error=e;}
  // Never repeat a POST blindly. Read back exactly the group/line identifier.
  cart=result?.success&&result.cart?result.cart:await readCart();found=find();present=found.reduce((n,x)=>n+Number(x.quantity),0);
  if(present!==line.quantity&&result?.cart){cart=await readCart();found=find();present=found.reduce((n,x)=>n+Number(x.quantity),0);}
  if(present!==line.quantity)throw Error((error?.message||'No se confirmó la línea con su referencia de diseño.')+' Revisá el carrito; no se repitió el envío.');
  if(found.some(x=>String(x.variant_id)!==String(line.variantId)))throw Error('La variante recibida no coincide. Revisá el carrito.');
  pending(beforeCart,key,false);pending(cart,key,false);
 }
 if(groupIssues(cart).length)throw Error('El grupo quedó incompleto. Revisá prendas y estampas en el carrito.');
 return cart;
}
export function installCheckoutGuard(){
 if(window.__flCheckoutGuard)return;window.__flCheckoutGuard=true;let checking=false,replay=false;
 async function intercept(event){
  if(replay)return;
  const target=event.type==='submit'?event.submitter:event.target.closest?.('a,button,input');
  const form=event.type==='submit'?event.target:target?.form;
  if(!target&&!form)return;
  const isCheckout=target?.matches?.('.js-go-checkout-btn,#go-to-checkout,[name="checkout"],a[href*="/checkout"]')||event.type==='submit'&&form?.matches('[data-store="cart-form"]')&&target?.name==='checkout';
  if(!isCheckout)return;
  event.preventDefault();event.stopImmediatePropagation();if(checking)return;checking=true;
  try{const issues=groupIssues(await readCart());if(issues.length)throw Error(issues.join('\n')+' Volvé al producto para completar el grupo o quitá ese grupo del carrito.');
   replay=true;if(event.type==='submit')form.requestSubmit(target);else target.click();replay=false;
  }catch(e){window.alert(e.message);}finally{checking=false;}
 }
 document.addEventListener('click',intercept,true);document.addEventListener('submit',intercept,true);
}
