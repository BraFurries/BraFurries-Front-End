import { CHUNK_BYTES, confirmedOffset, uploadChunks, validateUploadUri } from './google-drive-resumable-upload';

describe('Google Drive direct upload transport',()=>{
  const uri='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=secret';
  function partial(end:number){return new Response(null,{status:308,headers:{Range:'bytes=0-'+end}});}
  it('rejects unexpected or credential-bearing URLs',()=>{
    expect(validateUploadUri(uri)).toBe(uri);
    for(const value of [uri.replace('www.googleapis.com','evil.test'),uri+'&access_token=x',uri+'&upload_id=x',uri+'#fragment'])
      expect(()=>validateUploadUri(value)).toThrow();
  });
  it('uses Blob slices and never sends credentials or referrer',async()=>{
    const file=new File([new Uint8Array(CHUNK_BYTES+12)],'art.png',{type:'image/png'});
    const request=spyOn(window,'fetch').and.returnValues(Promise.resolve(partial(CHUNK_BYTES-1)),Promise.resolve(new Response(null,{status:201})));
    const progress:number[]=[];
    await uploadChunks(file,uri,new AbortController().signal,false,n=>progress.push(n));
    expect(progress).toEqual([CHUNK_BYTES,file.size]);
    const first=request.calls.argsFor(0)[1]!;
    expect((first.body as Blob).size).toBe(CHUNK_BYTES);
    expect(first.headers).toEqual({'Content-Range':'bytes 0-'+(CHUNK_BYTES-1)+'/'+file.size});
    expect(first.credentials).toBe('omit');expect(first.redirect).toBe('error');expect(first.referrerPolicy).toBe('no-referrer');
    expect((request.calls.argsFor(1)[1]!.body as Blob).size).toBe(12);
  });
  it('resumes from provider-confirmed offset rather than local progress',async()=>{
    const file=new File(['1234567890'],'file.txt');
    const request=spyOn(window,'fetch').and.returnValues(Promise.resolve(partial(3)),Promise.resolve(new Response(null,{status:200})));
    await uploadChunks(file,uri,new AbortController().signal,true,()=>{});
    expect(request.calls.argsFor(0)[1]!.headers).toEqual({'Content-Range':'bytes */10'});
    expect(request.calls.argsFor(1)[1]!.headers).toEqual({'Content-Range':'bytes 4-9/10'});
  });
  it('stops on missing Range instead of guessing the next position',async()=>{
    const file=new File(['hello'],'file.txt');
    const request=spyOn(window,'fetch').and.returnValue(Promise.resolve(new Response(null,{status:308})));
    await expectAsync(uploadChunks(file,uri,new AbortController().signal,false,()=>{})).toBeRejected();
    expect(request).toHaveBeenCalledTimes(1);
    expect(()=>confirmedOffset(partial(99),100)).toThrow();
  });
  it('does not start new blocks after abort',async()=>{
    const file=new File(['hello'],'file.txt');
    const request=spyOn(window,'fetch');
    const controller=new AbortController();controller.abort();
    await uploadChunks(file,uri,controller.signal,false,()=>{});
    expect(request).not.toHaveBeenCalled();
  });
});
