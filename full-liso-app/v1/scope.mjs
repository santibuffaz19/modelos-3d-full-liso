export function scopeDocument(id){
 const real=globalThis.document,root=real.getElementById(id).shadowRoot,body=root.querySelector('.fl-app');
 return new Proxy(real,{get(target,key){
  if(key==='body')return body;
  if(key==='activeElement')return root.activeElement;
  if(key==='querySelector'||key==='querySelectorAll')return root[key].bind(root);
  if(key==='getElementById')return root.getElementById.bind(root);
  if(key==='addEventListener'||key==='removeEventListener')return (type,...args)=>(['keydown','keyup','click','input','change'].includes(type)?root:real)[key](type,...args);
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
export async function mountShadow(id,markup,styles,classes){
 const host=globalThis.document.createElement('div');host.id=id;
 const root=host.attachShadow({mode:'open'}),reset=globalThis.document.createElement('style');
 reset.textContent=':host{display:block;color:#171717;font:14px Arial,sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}button,input,select,textarea{font:inherit}button,a{touch-action:manipulation}';root.append(reset);
 const loaded=styles.map(name=>new Promise((resolve,reject)=>{const link=globalThis.document.createElement('link');link.rel='stylesheet';link.href=new URL(name,import.meta.url).href;link.onload=resolve;link.onerror=()=>reject(Error('No se pudieron cargar los estilos.'));root.append(link);}));
 const app=globalThis.document.createElement('div');app.className='fl-app '+(classes||'');app.innerHTML=markup;root.append(app);
 return {host,root,app,ready:Promise.all(loaded)};
}
