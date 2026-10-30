import {project} from './native-ledger.mjs';
// A virtual source preserves payment-by-person UX without creating a persisted bank account.
// Family-owned money physically held in a member's card is explicitly attributed to custody.
export const MEMBER_CASH_ACCOUNT = '__dong_member_cash__';
export function paymentSourceOptions(store) {
  const custody=project(store).custody;
  return [
    {value:'fund',label:'صندوق مشترک (موجودی اصلی)'},
    ...store.accounts.filter(a=>a.id!=='fund'&&!store.archivedAccounts.includes(a.id)&&(custody[a.id]||0)>0).map(a=>({
      value:'custody:'+a.id,label:'صندوق مشترک (وجه امانی '+a.name+')'
    })),
    ...store.members.filter(m=>!store.archivedMembers.includes(m.id)).map(m=>({
      value:'member:'+m.id,label:m.name+' (پول شخصی)'
    }))
  ];
}
export function resolvePaymentSource(store,source) {
  if(source==='fund')return {accountId:'fund',paidById:'',fundedBy:'fund'};
  if(typeof source==='string'&&source.startsWith('custody:')){
    const id=source.slice('custody:'.length);
    if(!store.accounts.some(a=>a.id===id&&id!=='fund'&&!store.archivedAccounts.includes(id))||(project(store).custody[id]||0)<=0)
      throw Error('حساب وجه امانی صندوق معتبر نیست یا موجودی ندارد.');
    return {accountId:id,paidById:'',fundedBy:'fund'};
  }
  if(typeof source!=='string'||!source.startsWith('member:'))throw Error('پرداخت‌کننده واقعی را انتخاب کنید.');
  const id=source.slice('member:'.length);
  const member=store.members.find(m=>m.id===id&&!store.archivedMembers.includes(id));
  if(!member)throw Error('عضو پرداخت‌کننده معتبر نیست یا بایگانی شده است.');
  return {accountId:MEMBER_CASH_ACCOUNT,paidById:id,fundedBy:'personal'};
}
