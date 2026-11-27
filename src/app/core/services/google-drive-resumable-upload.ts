// No Angular HTTP interceptors, credentials, storage or telemetry on provider requests.
export const CHUNK_BYTES=8*1024*1024;
export function validateUploadUri(value:string):string {
  const url=new URL(value);
  if(url.origin!=='https://www.googleapis.com'||url.username||url.password||url.hash||
     url.pathname!=='/upload/drive/v3/files'||url.searchParams.get('uploadType')!=='resumable'||
     !/^[A-Za-z0-9_-]{1,4096}$/.test(url.searchParams.get('upload_id')||'')||
     Array.from(url.searchParams.keys()).some(k=>!['uploadType','upload_id','upload_protocol'].includes(k)||
       url.searchParams.getAll(k).length!==1)||
     (url.searchParams.has('upload_protocol')&&url.searchParams.get('upload_protocol')!=='resumable'))
    throw new Error('Sessão do Google inválida.');
  return url.href;
}

export function confirmedOffset(response:Response,total:number):number {
  if(response.status===200||response.status===201)return total;
  if(response.status===404||response.status===410)throw new Error('Sessão expirada no Google. Cancele e inicie outro envio.');
  if(response.status!==308)throw new Error('Google não confirmou o envio. Tente retomar.');
  const range=response.headers.get('Range');
  // CORS can hide Range. Do not guess the offset or resend blindly.
  if(!range)throw new Error('Google não disponibilizou a posição confirmada. Não é seguro continuar; tente retomar ou cancelar.');
  const match=/^bytes=0-(\d+)$/.exec(range);
  const end=match?Number(match[1]):-1;
  if(!Number.isSafeInteger(end)||end<0||end>=total-1)throw new Error('Posição de envio inválida.');
  return end+1;
}

async function put(uri:string,body:Blob,range:string,signal:AbortSignal):Promise<Response>{
  const timeout=new AbortController();
  const abort=()=>timeout.abort();
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  const timer=setTimeout(abort,120000);
  try {
    return await fetch(uri,{method:'PUT',body,headers:{'Content-Range':range},
      credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',signal:timeout.signal});
  } catch {
    // Never propagate a browser error that could contain the capability URI.
    throw new Error('Transferência interrompida. Tente retomar.');
  } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

export async function uploadChunks(file:File,rawUri:string,signal:AbortSignal,resume:boolean,
    onProgress:(bytes:number)=>void):Promise<void>{
  const uri=validateUploadUri(rawUri);
  let offset=0;
  if(resume){
    const status=await put(uri,new Blob([]),'bytes */'+file.size,signal);
    offset=confirmedOffset(status,file.size);
    if(signal.aborted)return;
    onProgress(offset);
  }
  while(offset<file.size){
    if(signal.aborted)return;
    const end=Math.min(offset+CHUNK_BYTES,file.size);
    const response=await put(uri,file.slice(offset,end,file.type||'application/octet-stream'),
      'bytes '+offset+'-'+(end-1)+'/'+file.size,signal);
    const next=confirmedOffset(response,file.size);
    if(signal.aborted)return;
    if(next<=offset||next>end)throw new Error('Posição inesperada do Google. Tente retomar.');
    offset=next;onProgress(offset);
  }
}
