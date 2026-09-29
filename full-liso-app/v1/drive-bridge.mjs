// Apps Script HTML service RPC avoids the failing ContentService redirect.
const connections=new Map();
const googleOrigin=origin=>{try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||/^[a-z0-9-]+-script\.googleusercontent\.com$/.test(u.hostname));}catch{return false;}};
export function connectDrive(endpoint){
 if(connections.has(endpoint))return connections.get(endpoint);
 const task=new Promise((resolve,reject)=>{
  const frame=globalThis.document.createElement('iframe'),channel=crypto.randomUUID(),waiting=new Map();let peer,peerOrigin;
  frame.title='Conexión de archivos Full Liso';frame.hidden=true;frame.setAttribute('aria-hidden','true');
  const url=new URL(endpoint);url.searchParams.set('bridge','1');url.searchParams.set('parentOrigin',location.origin);url.searchParams.set('channel',channel);frame.src=url.href;
  const timer=setTimeout(()=>{globalThis.removeEventListener('message',receive);frame.remove();connections.delete(endpoint);reject(Error('No se pudo abrir la conexión de archivos. Verificá que Apps Script tenga la versión nueva.'));},25000);
  function receive(event){
   const data=event.data;if(!data||data.channel!==channel||!googleOrigin(event.origin))return;
   if(data.type==='fl-drive-ready'&&!peer){peer=event.source;peerOrigin=event.origin;clearTimeout(timer);resolve({request(payload){return new Promise((ok,fail)=>{const requestId=crypto.randomUUID(),timeout=setTimeout(()=>{waiting.delete(requestId);fail(Error('Google no confirmó el guardado a tiempo. Tu diseño sigue guardado; reintentá para continuar.'));},45000);waiting.set(requestId,{ok,fail,timeout});peer.postMessage({type:'fl-drive-request',channel,requestId,payload:JSON.stringify(payload)},peerOrigin);});}});return;}
   if(event.source!==peer||event.origin!==peerOrigin||data.type!=='fl-drive-result')return;
   const pending=waiting.get(data.requestId);if(!pending)return;waiting.delete(data.requestId);clearTimeout(pending.timeout);if(data.error)pending.fail(Error(data.error));else pending.ok(data.result);
  }
  globalThis.addEventListener('message',receive);globalThis.document.body.append(frame);
 });connections.set(endpoint,task);return task;
}
export async function sendDrive(endpoint,payload,onWait=()=>{}){
 const start=Date.now(),timer=setInterval(()=>onWait(Math.round((Date.now()-start)/1000)),5000);
 try{const bridge=await connectDrive(endpoint),data=await bridge.request(payload);if(!data?.ok)throw Error(data?.error||'Google no pudo guardar el diseño.');return data;}finally{clearInterval(timer);}
}
