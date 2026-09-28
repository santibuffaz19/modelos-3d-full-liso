export function properties(item){const p=item.properties||{};return Array.isArray(p)?Object.fromEntries(p.map(x=>[x.name||x.key,x.value])):p;}
export function cartItems(cart){return cart.products||cart.items||[];}
async function request(body){
 const response=await fetch('/cart/update/',{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Content-Type':'application/x-www-form-urlencoded'},body:body||'',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('No se pudo verificar el carrito.');const data=await response.json();if(!data.cart)throw Error('La tienda no devolvió el carrito.');return data.cart;
}
export const readCart=()=>request('');
export function groupIssues(cart){
 const groups=new Map();for(const item of cartItems(cart)){const p=properties(item),id=p['FL Grupo'];if(!id)continue;if(!groups.has(id))groups.set(id,{area:0,service:0,printed:0});const g=groups.get(id),q=Number(item.quantity)||0;
  if(p['FL Tipo']==='Estampado')g.service+=q;else if(p['FL Tipo']==='Con logo'){const a=Number(p['FL cm2/prenda']);if(!(a>0))return ['Hay un diseño sin medidas verificables.'];g.area+=a*q;g.printed+=q;}
 }
 return [...groups].filter(([,g])=>Math.ceil(Number(g.area.toFixed(6)))!==g.service).map(([id])=>'La cantidad de estampas del diseño '+id.slice(0,8)+' no coincide con sus prendas.');
}
export async function addLines(lines,group,onProgress=()=>{}){
 let cart=await readCart();
 for(let i=0;i<lines.length;i++){
  const line=lines[i],key=group+':'+i,find=()=>cartItems(cart).filter(x=>properties(x)['FL Línea']===key);
  let found=find(),present=found.reduce((n,x)=>n+Number(x.quantity),0);
  if(present===line.quantity){if(found.some(x=>String(x.variant_id)!==String(line.variantId)))throw Error('La variante del grupo cambió. Revisá el carrito.');continue;}
  if(present!==0)throw Error('Este grupo ya está en el carrito con otra cantidad. Revisalo antes de repetir.');
  const form=new URLSearchParams({add_to_cart:line.productId,variant_id:line.variantId,quantity:String(line.quantity),add_to_cart_enhanced:'1'});
  const props={...line.properties,'FL Grupo':group,'FL Línea':key};for(const [k,v]of Object.entries(props))form.append('properties['+k+']',String(v));
  onProgress('Agregando al carrito · '+(i+1)+' / '+lines.length);
  let result,error;
  try{const res=await fetch('/comprar/',{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('La tienda rechazó una prenda.');result=await res.json();if(!result.success)throw Error('La tienda no pudo agregar la cantidad solicitada.');}catch(e){error=e;}
  // Never repeat a POST blindly. Read back exactly the group/line identifier.
  cart=result?.success&&result.cart?result.cart:await readCart();found=find();present=found.reduce((n,x)=>n+Number(x.quantity),0);
  if(present!==line.quantity&&result?.cart){cart=await readCart();found=find();present=found.reduce((n,x)=>n+Number(x.quantity),0);}
  if(present!==line.quantity)throw Error((error?.message||'No se confirmó la línea con su referencia de diseño.')+' Revisá el carrito; no se repitió el envío.');
  if(found.some(x=>String(x.variant_id)!==String(line.variantId)))throw Error('La variante recibida no coincide. Revisá el carrito.');
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
