import { NgZone } from '@angular/core';
import { GoogleDrivePickerBrowser, PickerCallbacks, isConfiguredRoot } from './google-drive-picker-browser';

describe('GoogleDrivePickerBrowser',()=>{
  const config={clientId:'fixture.apps.googleusercontent.com',apiKey:'fixture_key',
    projectNumber:'123',folderId:'fixture_folder',googleSubject:'institution-subject',googleEmail:'institution@example.invalid'};
  const folderMime='application/vnd.google-apps.folder';
  const host=window as Window & {google?:unknown};
  let previousGoogle:unknown;
  let browser:GoogleDrivePickerBrowser;
  let callbacks: jasmine.SpyObj<PickerCallbacks>;
  let tokenCallback:(response:{access_token:string})=>void;
  let pickerCallback:(response:unknown)=>void;
  let view:jasmine.SpyObj<any>;
  let builder:jasmine.SpyObj<any>;
  let picker:jasmine.SpyObj<any>;
  let fetchSpy:jasmine.Spy;
  let close:(()=>void)|undefined;

  beforeEach(()=>{
    previousGoogle=host.google;
    browser=new GoogleDrivePickerBrowser(new NgZone({enableLongStackTrace:false}));
    callbacks=jasmine.createSpyObj('callbacks',['picked','canceled','failed']);
    view=jasmine.createSpyObj('view',['setIncludeFolders','setParent','setMode','setSelectFolderEnabled','setMimeTypes','setFileIds']);
    ['setIncludeFolders','setParent','setMode','setSelectFolderEnabled','setMimeTypes','setFileIds'].forEach(k=>view[k].and.returnValue(view));
    builder=jasmine.createSpyObj('builder',['addView','setOAuthToken','setDeveloperKey','setAppId','setOrigin','setSelectableMimeTypes','setCallback','build']);
    ['addView','setOAuthToken','setDeveloperKey','setAppId','setOrigin','setSelectableMimeTypes'].forEach(k=>builder[k].and.returnValue(builder));
    builder.setCallback.and.callFake((cb:(response:unknown)=>void)=>{pickerCallback=cb;return builder;});
    picker=jasmine.createSpyObj('picker',['setVisible']);
    builder.build.and.returnValue(picker);
    host.google={
      accounts:{oauth2:{initTokenClient:(options:{callback:typeof tokenCallback})=>{
        tokenCallback=options.callback;return {requestAccessToken:()=>{}};
      }}},
      picker:{DocsView:function(){return view;},ViewId:{DOCS:'docs',FOLDERS:'folders'},
        DocsViewMode:{LIST:'list'},PickerBuilder:function(){return builder;},Action:{PICKED:'picked',CANCEL:'cancel'}}
    };
    fetchSpy=spyOn(window,'fetch');
  });
  afterEach(()=>{close?.();close=undefined;if(previousGoogle===undefined)delete host.google;else host.google=previousGoogle;});

  async function authorize(subject:string):Promise<void>{
    fetchSpy.and.returnValue(Promise.resolve({ok:true,json:()=>Promise.resolve({sub:subject,email_verified:true})}));
    close=browser.open(config,'root',callbacks);
    tokenCallback({access_token:'fixture-browser-token'});
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
  }

  it('rejects a different Google subject before constructing the Picker',async()=>{
    await authorize('wrong-subject');
    expect(callbacks.failed).toHaveBeenCalledWith('Selecione a conta Google institucional.');
    expect(builder.build).not.toHaveBeenCalled();
  });

  it('restricts the institutional view to the configured folder and rejects another folder',async()=>{
    await authorize(config.googleSubject);
    expect(view.setFileIds).toHaveBeenCalledWith(config.folderId);
    expect(view.setSelectFolderEnabled).toHaveBeenCalledWith(true);
    expect(view.setParent).not.toHaveBeenCalled();
    expect(builder.setAppId).toHaveBeenCalledWith(config.projectNumber);
    pickerCallback({action:'picked',docs:[{id:'another',mimeType:folderMime}]});
    expect(callbacks.failed).toHaveBeenCalled();
    expect(callbacks.picked).not.toHaveBeenCalled();
  });

  it('accepts only the configured folder and ignores repeated callbacks',async()=>{
    await authorize(config.googleSubject);
    const file={id:config.folderId,mimeType:folderMime};
    pickerCallback({action:'picked',docs:[file]});
    pickerCallback({action:'picked',docs:[file]});
    expect(callbacks.picked).toHaveBeenCalledOnceWith(file);
    expect(isConfiguredRoot({id:config.folderId,mimeType:'text/plain'},config.folderId)).toBeFalse();
  });
});
