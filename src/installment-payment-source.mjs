// A virtual cash source for a household member's own money.
// It does not add a bank account or a second fund to persisted Store.
export const MEMBER_CASH_ACCOUNT = '__dong_member_cash__';
export function paymentSourceOptions(store) {
  return [
    {value:'fund',label:'صندوق مشترک (از موجودی صندوق)'},
    ...store.members.filter(m=>!store.archivedMembers.includes(m.id)).map(m=>({
      value:'member:'+m.id,label:m.name+' (پول شخصی)'
    }))
  ];
}
export function resolvePaymentSource(store,source) {
  if(source==='fund') return {accountId:'fund',paidById:'',fundedBy:'fund'};
  if(typeof source!=='string'||!source.startsWith('member:')) throw Error('پرداخت‌کننده واقعی را انتخاب کنید.');
  const id=source.slice('member:'.length);
  const member=store.members.find(m=>m.id===id&&!store.archivedMembers.includes(id));
  if(!member) throw Error('عضو پرداخت‌کننده معتبر نیست یا بایگانی شده است.');
  return {accountId:MEMBER_CASH_ACCOUNT,paidById:id,fundedBy:'personal'};
}
