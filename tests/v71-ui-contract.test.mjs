import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync('src/main.tsx','utf8');
const css=readFileSync('src/style.css','utf8');
const rules=readFileSync('src/installment-rules.mjs','utf8');
test('deposit supports multiple members, individual amounts, editable obligations, Maryam destination, past-date confirmation',()=>{
 for(const pattern of [/function DepositForm/,/saveMany\(batch\)/,/type="checkbox"/,/مبلغ دنگ این عضو/,/حساب مقصد دریافت وجه/,/maryam-card/,/validateDepositBatch/,/تاریخ دریافت.*قدیمی‌تر/])assert.match(main,pattern);
});
test('installments automatically refresh when product, amount, purchase date, provider, or type changes',()=>{
 assert.match(main,/buildProviderSchedule/);
 assert.match(main,/\[provider,count,amount,purchaseDate,firstDue\]/);
 assert.match(main,/قسط اول در روز خرید سررسید دارد/);
 assert.match(rules,/tara-two/);assert.match(rules,/pay-next-month/);assert.match(rules,/four-with-downpayment/);
});
test('finance history has all requested color-coded operation categories',()=>{
 assert.match(main,/record-kind-\$\{cancelled\?'reversal':event.kind\}/);
 for(const color of ['deposit','purchase','reversal','payment','waiver','creditMove','transfer','refund','obligationAdjust'])assert.match(css,new RegExp('record-kind-'+color+'\\b'));
});
test('historical custody purchases remain distinct from member-funded installment payments',()=>{
 assert.match(main,/custodyBalances\(store\)\['maryam-card'\]/);
 assert.match(main,/isFunded\?'fund':'personal'/);
 assert.match(main,/paymentSourceOptions\(store\)/);
 assert.match(main,/resolvePaymentSource\(store,source\)/);
 assert.match(main,/حساب پرداخت‌کننده بازپرداخت/);
});