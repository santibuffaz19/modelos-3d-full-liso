// Keep each request comfortably below Apps Script's JSON body limit.
export function uploadBatches(entries,{maxChars=14*1024*1024,maxFiles=6}={}){
 const batches=[];let current=[],size=0;
 for(const entry of entries){const n=JSON.stringify(entry).length+2;if(current.length&&(size+n>maxChars||current.length>=maxFiles)){batches.push(current);current=[];size=0;}current.push(entry);size+=n;}
 if(current.length)batches.push(current);return batches;
}
export function shortReference(id){return 'FL-'+id.slice(0,8).toUpperCase();}
// Identical bytes can be copied in Drive; originals/final files still exist separately.
export function reuseIdentical(entries,confirmed={}){
 const seen=new Map(Object.entries(confirmed).map(([name,f])=>[f.mime+':'+f.sha256,name]));
 return entries.map(entry=>{const key=entry.mime+':'+entry.sha256,copyFrom=seen.get(key);seen.set(key,entry.fileName);if(!copyFrom)return entry;const {base64,...rest}=entry;return {...rest,copyFrom};});
}
