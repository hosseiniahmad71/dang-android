import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {homedir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {validateStore} from './validate.mjs';

export const externalDirectory=()=>resolve(process.env.DANG_EXTERNAL_BACKUP_DIR||join(homedir(),'storage','downloads','DangBackups'));
export function encryptDb(bytes,passphrase){
 if(typeof passphrase!=='string'||passphrase.length<12)throw Error('رمز بک‌آپ حداقل ۱۲ نویسه باشد.');
 const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(passphrase,salt,32);
 const cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return {format:'dang-sqlite-encrypted-v1',kdf:'scrypt',cipher:'aes-256-gcm',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function decryptDb(envelope,passphrase){
 if(!envelope||envelope.format!=='dang-sqlite-encrypted-v1'||envelope.kdf!=='scrypt'||envelope.cipher!=='aes-256-gcm')throw Error('فرمت بک‌آپ SQLite رمزگذاری‌شده نامعتبر است.');
 if(typeof passphrase!=='string'||passphrase.length<12)throw Error('رمز بک‌آپ الزامی است.');
 try{const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64'),data=Buffer.from(envelope.data,'base64');
 if(salt.length!==16||iv.length!==12||tag.length!==16||data.length<20||data.length>50_000_000)throw Error('اندازه فایل نامعتبر است.');
 const decipher=createDecipheriv('aes-256-gcm',scryptSync(passphrase,salt,32),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]);
 }catch{throw Error('بک‌آپ دستکاری شده یا رمز نادرست است. بازیابی انجام نشد.');}
}
export async function writeExternalSnapshot(sqlitePath,dbDir,passphrase,externalDir=externalDirectory()){
 const resolved=resolve(externalDir);if(resolved===resolve(dbDir)||resolved.startsWith(resolve(dbDir)+sep))throw Error('محل بک‌آپ خارجی باید خارج از پوشه دیتابیس Termux باشد.');
 const bytes=await readFile(sqlitePath),encrypted=encryptDb(bytes,passphrase);
 await mkdir(resolved,{recursive:true});
 const stamp=new Date().toISOString().replaceAll(':','-');
 const filename=`dang-${stamp}-${randomBytes(4).toString('hex')}.dangbak`;
 const target=join(resolved,filename),temporary=target+'.tmp';
 try{await writeFile(temporary,JSON.stringify(encrypted),{flag:'wx',mode:0o600});await rename(temporary,target);return {filename,location:target,size:bytes.length};}
 catch(e){await rm(temporary,{force:true});throw e}
}
export async function readExternalStore(envelope,passphrase,dbDir){
 const bytes=decryptDb(envelope,passphrase);
 const file=join(dbDir,`restore-check-${randomBytes(8).toString('hex')}.sqlite`);
 let db;
 try{await writeFile(file,bytes,{flag:'wx',mode:0o600});db=new DatabaseSync(file,{readOnly:true});
 const row=db.prepare('SELECT body FROM state WHERE id=1').get();if(!row)throw Error('فایل SQLite فاقد وضعیت مالی است.');
 const result=db.prepare('PRAGMA integrity_check').get();if(result.integrity_check!=='ok')throw Error('بک‌آپ SQLite ناسالم است.');
 return validateStore(JSON.parse(row.body));
 }finally{db?.close();await rm(file,{force:true});}
}
