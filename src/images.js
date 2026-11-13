'use strict';
const {randomBytes}=require('node:crypto');
const path=require('node:path').posix;
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
async function pickImage(vscode,document) {
  if(document.isUntitled || document.uri.scheme==='untitled')return {message:'画像ファイルを追加する前に、Markdownファイルを保存してください。'};
  const files=await vscode.window.showOpenDialog({canSelectMany:false,canSelectFolders:false,openLabel:'画像を追加',filters:{画像:['png','jpg','jpeg','gif','webp','svg','bmp','ico']}});
  if(!files?.length)return {};
  const source=files[0],directory=vscode.Uri.joinPath(document.uri,'..');
  const ext=path.extname(source.path).toLowerCase();
  if(!['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico'].includes(ext))return {message:'対応していない画像形式です。'};
  const prefix=directory.path.replace(/\/$/,'')+'/';
  if(source.scheme===directory.scheme&&source.authority===directory.authority&&source.path.startsWith(prefix)) {
    return {path:source.path.slice(prefix.length).split('/').map(encode).join('/')};
  }
  const folder=vscode.Uri.joinPath(directory,'assets');
  const name=path.basename(source.path,ext).replace(/[^\p{L}\p{N}_.-]/gu,'-')+'-'+randomBytes(6).toString('hex')+ext;
  const target=vscode.Uri.joinPath(folder,name);
  // Import a copy next to the document so the preview can load it portably.
  const bytes=await vscode.workspace.fs.readFile(source);
  await vscode.workspace.fs.createDirectory(folder);
  await vscode.workspace.fs.writeFile(target,bytes);
  return {path:'assets/'+encode(name)};
}
module.exports={pickImage};
