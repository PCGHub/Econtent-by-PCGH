\set ON_ERROR_STOP on
create temporary table billing_test_ids(user_one uuid,user_two uuid,project_one uuid,export_one uuid,export_two uuid,payment_one uuid);
grant select,update on billing_test_ids to authenticated;
grant all on billing_test_ids to service_role;
insert into billing_test_ids values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',null,null,null,null);
insert into auth.users(id,email_confirmed_at) select user_one,clock_timestamp() from billing_test_ids
union all select user_two,clock_timestamp() from billing_test_ids;

set role authenticated;
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.projects(title) values('Billing fixture');
reset role;

update billing_test_ids set project_one=(select id from public.projects where title='Billing fixture');
insert into public.credit_wallets(owner_id,available_credits) select user_one,10 from billing_test_ids;
insert into public.credit_wallets(owner_id,available_credits) select user_two,0 from billing_test_ids;

set role authenticated;
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$
declare q jsonb; first jsonb; replay jsonb;
begin
  q:=public.quote_export_credits(61,array['basic_export']);
  if (q->>'totalCredits')::integer<>5 or (q->>'totalAmountKobo')::integer<>5000 then raise exception 'basic quote differs'; end if;
  first:=public.reserve_export_credits('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',61,array['basic_export'],
    (select project_one from billing_test_ids));
  replay:=public.reserve_export_credits('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',61,array['basic_export'],
    (select project_one from billing_test_ids));
  if first->>'exportId'<>replay->>'exportId' or (replay->>'replayed')::boolean is not true then raise exception 'reservation replay failed'; end if;
  update billing_test_ids set export_one=(first->>'exportId')::uuid;
  perform public.submit_export_candidate((first->>'exportId')::uuid,repeat('a',64),1200,61000);
end $$;
reset role;

do $$ begin
  if (select available_credits<>5 or reserved_credits<>5 from public.credit_wallets where owner_id=(select user_one from billing_test_ids)) then
    raise exception 'reservation balances differ'; end if;
  if (select count(*)<>1 from public.credit_ledger where entry_type='export_reserve') then raise exception 'duplicate reserve ledger entry'; end if;
  if (select state<>'verification_pending' from public.export_billing where id=(select export_one from billing_test_ids)) then
    raise exception 'browser candidate incorrectly settled or missing'; end if;
end $$;

set role authenticated;
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ declare second jsonb; begin
  second:=public.reserve_export_credits('cccccccc-cccc-4ccc-8ccc-cccccccccccc',30,array['basic_export'],null);
  update billing_test_ids set export_two=(second->>'exportId')::uuid;
  perform public.request_export_cancellation((second->>'exportId')::uuid);
end $$;
reset role;
set role service_role;
set request.jwt.claims='{"role":"service_role"}';
do $$ begin
  perform billing_private.release_export((select export_two from billing_test_ids),'verified local cancellation');
  perform billing_private.release_export((select export_two from billing_test_ids),'verified local cancellation');
end $$;
reset role;
do $$ begin
  if (select available_credits<>5 or reserved_credits<>5 from public.credit_wallets
      where owner_id=(select user_one from billing_test_ids)) then raise exception 'cancel/release balances differ'; end if;
  if (select count(*)<>1 from public.credit_ledger where entry_type='export_release') then raise exception 'duplicate release'; end if;
end $$;

set role authenticated;
set request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin
  begin perform public.submit_export_candidate((select export_one from billing_test_ids),repeat('b',64),1000,1000);
    raise exception 'cross-account candidate unexpectedly succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.reserve_export_credits('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',30,array['basic_export'],null);
    raise exception 'insufficient wallet unexpectedly reserved'; exception when raise_exception then
      if sqlerrm<>'Insufficient credits' then raise; end if; end;
  begin perform billing_private.settle_export((select export_one from billing_test_ids),'forged','forged-receipt');
    raise exception 'client settled an export'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set role service_role;
set request.jwt.claims='{"role":"service_role"}';
do $$ begin
  if not billing_private.settle_export((select export_one from billing_test_ids),'local-test-verifier','receipt-0001') then
    raise exception 'service settlement failed'; end if;
  if not billing_private.settle_export((select export_one from billing_test_ids),'local-test-verifier','receipt-0001') then
    raise exception 'settlement replay failed'; end if;
end $$;
reset role;

do $$ begin
  if (select available_credits<>5 or reserved_credits<>0 or lifetime_spent_credits<>5
      from public.credit_wallets where owner_id=(select user_one from billing_test_ids)) then raise exception 'settled balances differ'; end if;
  if (select count(*)<>1 from public.credit_ledger where entry_type='export_settle') then raise exception 'duplicate settlement'; end if;
end $$;

insert into public.payment_records(owner_id,gateway,payment_reference,provider_transaction_id,amount_kobo,credits,status,verified_at)
select user_one,'local_gateway','payment-reference-0001','provider-transaction-0001',50000,50,'verified',clock_timestamp()
from billing_test_ids;
do $$ begin
  begin insert into public.payment_records(owner_id,gateway,payment_reference,provider_transaction_id,amount_kobo,credits,status)
    select user_one,'local_gateway','payment-reference-duplicate','provider-transaction-0001',50000,50,'pending' from billing_test_ids;
    raise exception 'duplicate provider callback inserted'; exception when unique_violation then null; end;
end $$;
update billing_test_ids set payment_one=(select id from public.payment_records where payment_reference='payment-reference-0001');
set role service_role;
set request.jwt.claims='{"role":"service_role"}';
do $$ begin
  perform billing_private.credit_verified_payment((select payment_one from billing_test_ids));
  perform billing_private.credit_verified_payment((select payment_one from billing_test_ids));
end $$;
reset role;
do $$ begin
  if (select available_credits<>55 or lifetime_funded_credits<>50 from public.credit_wallets
      where owner_id=(select user_one from billing_test_ids)) then raise exception 'idempotent payment credit differs'; end if;
  if (select count(*)<>1 from public.credit_ledger where entry_type='payment_credit') then raise exception 'duplicate payment credit'; end if;
  begin update public.credit_ledger set description='tampered' where true; raise exception 'ledger update succeeded';
    exception when object_not_in_prerequisite_state then null; end;
end $$;

select 'PASS: quotes, ownership, insufficient balance, idempotent reservation/payment/settlement, untrusted candidate and immutable ledger' as result;

