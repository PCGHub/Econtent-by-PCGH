-- REVIEW ONLY. Do not apply until the development backup and migration review pass.
-- Credits are integer units; money is integer kobo. One credit currently equals 1000 kobo (NGN 10).
-- Browser exports can reserve credits and submit a candidate, but only service_role may settle or release.

create schema if not exists billing_private;
revoke all on schema billing_private from public, anon, authenticated;
grant usage on schema billing_private to authenticated, service_role;

create table public.credit_pricing (
  feature_key text primary key check (feature_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  display_name text not null check (length(display_name) between 2 and 80),
  fixed_credits integer not null default 0 check (fixed_credits >= 0),
  credits_per_started_minute integer not null default 0 check (credits_per_started_minute >= 0),
  minimum_credits integer not null default 0 check (minimum_credits >= 0),
  provider_key text check (provider_key is null or provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  provider_cost_estimate_kobo integer check (provider_cost_estimate_kobo is null or provider_cost_estimate_kobo >= 0),
  estimate_only boolean not null default false,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.credit_pricing
  (feature_key,display_name,fixed_credits,minimum_credits,estimate_only)
values
  ('basic_export','Basic video export',5,5,false),
  ('background_removal','Background removal',20,20,true),
  ('ai_subtitles','AI subtitles',15,15,true),
  ('ai_voiceover','AI voice-over',25,25,true),
  ('ai_translation','AI translation',30,30,true),
  ('ai_enhancement','AI enhancement',40,40,true);

create table public.credit_wallets (
  owner_id uuid primary key references auth.users(id) on delete restrict,
  available_credits integer not null default 0 check (available_credits >= 0),
  reserved_credits integer not null default 0 check (reserved_credits >= 0),
  lifetime_funded_credits bigint not null default 0 check (lifetime_funded_credits >= 0),
  lifetime_spent_credits bigint not null default 0 check (lifetime_spent_credits >= 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  entry_type text not null check (entry_type in
    ('payment_credit','export_reserve','export_settle','export_release','export_refund','admin_adjustment')),
  available_delta integer not null,
  reserved_delta integer not null,
  available_after integer not null check (available_after >= 0),
  reserved_after integer not null check (reserved_after >= 0),
  reference_type text not null check (reference_type in ('payment','export','adjustment')),
  reference_id uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  description text not null check (length(description) between 2 and 240),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (owner_id,idempotency_key)
);
create index credit_ledger_owner_created_idx on public.credit_ledger(owner_id,created_at desc,id desc);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  gateway text not null check (gateway ~ '^[a-z][a-z0-9_-]{1,31}$'),
  payment_reference text not null check (length(payment_reference) between 8 and 160),
  provider_transaction_id text,
  amount_kobo integer not null check (amount_kobo > 0),
  credits integer not null check (credits > 0 and amount_kobo = credits * 1000),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending','verified','failed','refunded')),
  provider_payload_hash text check (provider_payload_hash is null or provider_payload_hash ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (gateway,payment_reference),
  unique (gateway,provider_transaction_id)
);
create index payment_records_owner_created_idx on public.payment_records(owner_id,created_at desc,id);

create table public.export_billing (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid not null,
  project_id uuid references public.projects(id) on delete set null,
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  feature_keys text[] not null check (cardinality(feature_keys) between 1 and 20),
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  quoted_credits integer not null check (quoted_credits > 0),
  quoted_amount_kobo integer not null check (quoted_amount_kobo = quoted_credits * 1000),
  state text not null default 'reserved' check (state in
    ('reserved','verification_pending','cancel_requested','settled','released','refunded','expired')),
  candidate_sha256 text check (candidate_sha256 is null or candidate_sha256 ~ '^[a-f0-9]{64}$'),
  candidate_size_bytes bigint check (candidate_size_bytes is null or candidate_size_bytes > 0),
  candidate_duration_ms integer check (candidate_duration_ms is null or candidate_duration_ms > 0),
  verifier text,
  verifier_receipt text,
  reserved_until timestamptz not null default clock_timestamp() + interval '45 minutes',
  candidate_submitted_at timestamptz,
  settled_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id,client_request_id)
);
create index export_billing_owner_created_idx on public.export_billing(owner_id,created_at desc,id);
create index export_billing_reconcile_idx on public.export_billing(state,reserved_until,id)
  where state in ('reserved','verification_pending','cancel_requested');

create table billing_private.billing_audit (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete restrict,
  actor_id uuid,
  event_type text not null check (length(event_type) between 3 and 80),
  target_type text not null check (length(target_type) between 3 and 40),
  target_id uuid,
  request_id text check (request_id is null or length(request_id) between 8 and 160),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default clock_timestamp()
);
create index billing_audit_target_idx on billing_private.billing_audit(target_type,target_id,occurred_at desc);

alter table public.credit_pricing enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.payment_records enable row level security;
alter table public.export_billing enable row level security;
alter table billing_private.billing_audit enable row level security;

create policy credit_pricing_read on public.credit_pricing for select to authenticated
  using (active);
create policy credit_wallet_read_own on public.credit_wallets for select to authenticated
  using (owner_id = (select auth.uid()));
create policy credit_ledger_read_own on public.credit_ledger for select to authenticated
  using (owner_id = (select auth.uid()));
create policy payment_records_read_own on public.payment_records for select to authenticated
  using (owner_id = (select auth.uid()));
create policy export_billing_read_own on public.export_billing for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.credit_pricing, public.credit_wallets, public.credit_ledger,
  public.payment_records, public.export_billing from public, anon, authenticated;
grant select on public.credit_pricing, public.credit_wallets, public.credit_ledger,
  public.payment_records, public.export_billing to authenticated;
revoke all on billing_private.billing_audit from public, anon, authenticated, service_role;

create function billing_private.reject_immutable_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Billing audit and ledger rows are immutable' using errcode = '55000'; end $$;
revoke all on function billing_private.reject_immutable_change() from public,anon,authenticated;
create trigger credit_ledger_immutable before update or delete on public.credit_ledger
  for each row execute function billing_private.reject_immutable_change();
create trigger billing_audit_immutable before update or delete on billing_private.billing_audit
  for each row execute function billing_private.reject_immutable_change();

create function billing_private.verified_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'Verified sign-in required' using errcode='42501';
  end if;
  return uid;
end $$;
revoke all on function billing_private.verified_user() from public,anon;
grant execute on function billing_private.verified_user() to authenticated;

create function billing_private.quote_export(p_duration_seconds integer,p_features text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; total integer;
begin
  if p_duration_seconds not between 1 and 86400 or cardinality(p_features) not between 1 and 20
    or 'basic_export' <> all(p_features) or cardinality(p_features) <> cardinality(array(select distinct x from unnest(p_features) x)) then
    raise exception 'Invalid export quote request' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_features) x left join public.credit_pricing p on p.feature_key=x
    where p.feature_key is null or not p.active) then raise exception 'Unknown or inactive pricing feature'; end if;
  select coalesce(sum(greatest(p.minimum_credits,p.fixed_credits +
    p.credits_per_started_minute * ceil(p_duration_seconds/60.0)::integer)),0),
    jsonb_build_object('creditValueKobo',1000,'durationSeconds',p_duration_seconds,'features',
      jsonb_agg(jsonb_build_object('key',p.feature_key,'name',p.display_name,'version',p.version,
        'credits',greatest(p.minimum_credits,p.fixed_credits+p.credits_per_started_minute*ceil(p_duration_seconds/60.0)::integer),
        'estimateOnly',p.estimate_only,'provider',p.provider_key,'providerCostEstimateKobo',p.provider_cost_estimate_kobo)
        order by p.feature_key))
    into total,result from public.credit_pricing p where p.feature_key=any(p_features);
  return result || jsonb_build_object('totalCredits',total,'totalAmountKobo',total*1000);
end $$;
revoke all on function billing_private.quote_export(integer,text[]) from public,anon;
grant execute on function billing_private.quote_export(integer,text[]) to authenticated,service_role;

create function public.quote_export_credits(duration_seconds integer,feature_keys text[] default array['basic_export']) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin perform billing_private.verified_user(); return billing_private.quote_export(duration_seconds,feature_keys); end $$;
revoke all on function public.quote_export_credits(integer,text[]) from public,anon;
grant execute on function public.quote_export_credits(integer,text[]) to authenticated;

create function public.credit_wallet_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare uid uuid := billing_private.verified_user(); result jsonb;
begin
  select jsonb_build_object('availableCredits',coalesce(w.available_credits,0),'reservedCredits',coalesce(w.reserved_credits,0),
    'nairaPerCredit',10,'availableNaira',coalesce(w.available_credits,0)*10,
    'ledger',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc,l.id desc) from
      (select * from public.credit_ledger where owner_id=uid order by created_at desc,id desc limit 100) l),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from
      (select id,gateway,payment_reference,amount_kobo,credits,currency,status,verified_at,refunded_at,created_at
       from public.payment_records where owner_id=uid order by created_at desc limit 100) p),'[]'::jsonb),
    'exports',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from
      (select id,project_id,duration_seconds,feature_keys,quoted_credits,quoted_amount_kobo,state,created_at,settled_at,released_at
       from public.export_billing where owner_id=uid order by created_at desc limit 100) e),'[]'::jsonb),
    'pricing',(select jsonb_agg(to_jsonb(x) order by x.feature_key) from
      (select feature_key,display_name,fixed_credits,credits_per_started_minute,minimum_credits,provider_key,
        provider_cost_estimate_kobo,estimate_only,version from public.credit_pricing where active) x)) into result
  from (select uid owner_id) u left join public.credit_wallets w on w.owner_id=u.owner_id;
  return result;
end $$;
revoke all on function public.credit_wallet_snapshot() from public,anon;
grant execute on function public.credit_wallet_snapshot() to authenticated;

create function public.reserve_export_credits(client_request_id uuid,duration_seconds integer,
  feature_keys text[] default array['basic_export'],project_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := billing_private.verified_user(); quote jsonb; cost integer; w public.credit_wallets; charge public.export_billing;
begin
  if client_request_id is null then raise exception 'Request id required' using errcode='22023'; end if;
  if project_id is not null and not exists(select 1 from public.projects where id=project_id and owner_id=uid) then
    raise exception 'Project not found' using errcode='42501'; end if;
  quote:=billing_private.quote_export(duration_seconds,feature_keys); cost:=(quote->>'totalCredits')::integer;
  select * into charge from public.export_billing where owner_id=uid and export_billing.client_request_id=reserve_export_credits.client_request_id;
  if found then
    if charge.duration_seconds<>duration_seconds or charge.feature_keys<>feature_keys or charge.project_id is distinct from reserve_export_credits.project_id then
      raise exception 'Idempotency key was already used for a different export' using errcode='23505'; end if;
    return jsonb_build_object('exportId',charge.id,'state',charge.state,'reservedCredits',charge.quoted_credits,
      'amountKobo',charge.quoted_amount_kobo,'reservedUntil',charge.reserved_until,'replayed',true);
  end if;
  insert into public.credit_wallets(owner_id) values(uid) on conflict(owner_id) do nothing;
  select * into w from public.credit_wallets where owner_id=uid for update;
  if w.available_credits<cost then raise exception 'Insufficient credits' using errcode='P0001',hint='INSUFFICIENT_CREDITS'; end if;
  update public.credit_wallets set available_credits=available_credits-cost,reserved_credits=reserved_credits+cost,
    version=version+1,updated_at=clock_timestamp() where owner_id=uid returning * into w;
  insert into public.export_billing(owner_id,client_request_id,project_id,duration_seconds,feature_keys,pricing_snapshot,
    quoted_credits,quoted_amount_kobo) values(uid,client_request_id,project_id,duration_seconds,feature_keys,quote,cost,cost*1000)
    returning * into charge;
  insert into public.credit_ledger(owner_id,entry_type,available_delta,reserved_delta,available_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,metadata)
    values(uid,'export_reserve',-cost,cost,w.available_credits,w.reserved_credits,'export',charge.id,
      'export:'||charge.id||':reserve','Credits reserved for export',jsonb_build_object('pricing',quote));
  insert into billing_private.billing_audit(owner_id,actor_id,event_type,target_type,target_id,request_id,details)
    values(uid,uid,'export_reserved','export',charge.id,client_request_id::text,jsonb_build_object('credits',cost));
  return jsonb_build_object('exportId',charge.id,'state',charge.state,'reservedCredits',cost,'amountKobo',cost*1000,
    'reservedUntil',charge.reserved_until,'replayed',false);
end $$;
revoke all on function public.reserve_export_credits(uuid,integer,text[],uuid) from public,anon;
grant execute on function public.reserve_export_credits(uuid,integer,text[],uuid) to authenticated;

create function public.submit_export_candidate(export_id uuid,sha256 text,size_bytes bigint,duration_ms integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=billing_private.verified_user(); charge public.export_billing;
begin
  if sha256 !~ '^[a-f0-9]{64}$' or size_bytes<=0 or duration_ms<=0 then raise exception 'Invalid completion candidate'; end if;
  select * into charge from public.export_billing where id=export_id and owner_id=uid for update;
  if not found then raise exception 'Export not found' using errcode='42501'; end if;
  if charge.state not in ('reserved','verification_pending') then raise exception 'Export cannot accept a candidate'; end if;
  if charge.candidate_sha256 is not null and (charge.candidate_sha256<>sha256 or charge.candidate_size_bytes<>size_bytes
    or charge.candidate_duration_ms<>duration_ms) then raise exception 'Candidate differs from the first submission'; end if;
  update public.export_billing set state='verification_pending',candidate_sha256=sha256,candidate_size_bytes=size_bytes,
    candidate_duration_ms=duration_ms,candidate_submitted_at=coalesce(candidate_submitted_at,clock_timestamp()),updated_at=clock_timestamp()
    where id=charge.id;
  insert into billing_private.billing_audit(owner_id,actor_id,event_type,target_type,target_id,details)
    values(uid,uid,'browser_candidate_received','export',charge.id,jsonb_build_object('sha256',sha256,'sizeBytes',size_bytes,
      'durationMs',duration_ms,'trustedProof',false));
  return jsonb_build_object('exportId',charge.id,'state','verification_pending','settled',false,
    'message','Candidate recorded; browser evidence cannot settle a paid export.');
end $$;
revoke all on function public.submit_export_candidate(uuid,text,bigint,integer) from public,anon;
grant execute on function public.submit_export_candidate(uuid,text,bigint,integer) to authenticated;

create function public.request_export_cancellation(export_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=billing_private.verified_user(); charge public.export_billing;
begin
  update public.export_billing set state='cancel_requested',updated_at=clock_timestamp()
    where id=export_id and owner_id=uid and state='reserved' returning * into charge;
  if not found then select * into charge from public.export_billing where id=export_id and owner_id=uid;
    if not found then raise exception 'Export not found' using errcode='42501'; end if; end if;
  return jsonb_build_object('exportId',charge.id,'state',charge.state,
    'message','Cancellation recorded. A trusted reconciler must release the reservation.');
end $$;
revoke all on function public.request_export_cancellation(uuid) from public,anon;
grant execute on function public.request_export_cancellation(uuid) to authenticated;

create function billing_private.require_service_role() returns void
language plpgsql stable security invoker set search_path='' as $$
begin if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if; end $$;
revoke all on function billing_private.require_service_role() from public,anon,authenticated;
grant execute on function billing_private.require_service_role() to service_role;

create function billing_private.settle_export(p_export_id uuid,p_verifier text,p_receipt text) returns boolean
language plpgsql security definer set search_path='' as $$
declare charge public.export_billing; w public.credit_wallets;
begin
  perform billing_private.require_service_role();
  if length(p_verifier) not between 2 and 80 or length(p_receipt) not between 8 and 240 then raise exception 'Verifier receipt required'; end if;
  select * into charge from public.export_billing where id=p_export_id for update;
  if not found then return false; end if; if charge.state='settled' then return true; end if;
  if charge.state<>'verification_pending' then raise exception 'Export is not awaiting verification'; end if;
  select * into w from public.credit_wallets where owner_id=charge.owner_id for update;
  update public.credit_wallets set reserved_credits=reserved_credits-charge.quoted_credits,
    lifetime_spent_credits=lifetime_spent_credits+charge.quoted_credits,version=version+1,updated_at=clock_timestamp()
    where owner_id=charge.owner_id returning * into w;
  update public.export_billing set state='settled',verifier=p_verifier,verifier_receipt=p_receipt,
    settled_at=clock_timestamp(),updated_at=clock_timestamp() where id=charge.id;
  insert into public.credit_ledger(owner_id,entry_type,available_delta,reserved_delta,available_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,metadata)
    values(charge.owner_id,'export_settle',0,-charge.quoted_credits,w.available_credits,w.reserved_credits,
      'export',charge.id,'export:'||charge.id||':settle','Verified export settled',jsonb_build_object('verifier',p_verifier,'receipt',p_receipt));
  insert into billing_private.billing_audit(owner_id,event_type,target_type,target_id,details)
    values(charge.owner_id,'export_settled','export',charge.id,jsonb_build_object('verifier',p_verifier,'receipt',p_receipt));
  return true;
end $$;
revoke all on function billing_private.settle_export(uuid,text,text) from public,anon,authenticated;
grant execute on function billing_private.settle_export(uuid,text,text) to service_role;

create function billing_private.release_export(p_export_id uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare charge public.export_billing; w public.credit_wallets;
begin
  perform billing_private.require_service_role();
  if length(p_reason) not between 3 and 160 then raise exception 'Release reason required'; end if;
  select * into charge from public.export_billing where id=p_export_id for update;
  if not found then return false; end if; if charge.state in ('released','expired') then return true; end if;
  if charge.state not in ('reserved','verification_pending','cancel_requested') then raise exception 'Export cannot be released'; end if;
  select * into w from public.credit_wallets where owner_id=charge.owner_id for update;
  update public.credit_wallets set available_credits=available_credits+charge.quoted_credits,
    reserved_credits=reserved_credits-charge.quoted_credits,version=version+1,updated_at=clock_timestamp()
    where owner_id=charge.owner_id returning * into w;
  update public.export_billing set state=case when reserved_until<=clock_timestamp() then 'expired' else 'released' end,
    released_at=clock_timestamp(),updated_at=clock_timestamp() where id=charge.id;
  insert into public.credit_ledger(owner_id,entry_type,available_delta,reserved_delta,available_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,metadata)
    values(charge.owner_id,'export_release',charge.quoted_credits,-charge.quoted_credits,w.available_credits,w.reserved_credits,
      'export',charge.id,'export:'||charge.id||':release','Export reservation released',jsonb_build_object('reason',p_reason));
  insert into billing_private.billing_audit(owner_id,event_type,target_type,target_id,details)
    values(charge.owner_id,'export_released','export',charge.id,jsonb_build_object('reason',p_reason));
  return true;
end $$;
revoke all on function billing_private.release_export(uuid,text) from public,anon,authenticated;
grant execute on function billing_private.release_export(uuid,text) to service_role;

create function billing_private.release_expired_exports(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare charge_id uuid; released integer:=0;
begin
  perform billing_private.require_service_role();
  if p_limit<1 or p_limit>500 then raise exception 'Cleanup limit must be between 1 and 500'; end if;
  for charge_id in
    select id from public.export_billing
    where state in('reserved','processing','verification_pending','release_requested') and reserved_until<=clock_timestamp()
    order by reserved_until,id for update skip locked limit p_limit
  loop
    if billing_private.release_export(charge_id,'reservation timeout') then released:=released+1; end if;
  end loop;
  return released;
end $$;
revoke all on function billing_private.release_expired_exports(integer) from public,anon,authenticated;
grant execute on function billing_private.release_expired_exports(integer) to service_role;

create function billing_private.refund_export(p_export_id uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare charge public.export_billing; w public.credit_wallets;
begin
  perform billing_private.require_service_role();
  if length(p_reason) not between 3 and 160 then raise exception 'Refund reason required'; end if;
  select * into charge from public.export_billing where id=p_export_id for update;
  if not found then return false; end if; if charge.state='refunded' then return true; end if;
  if charge.state<>'settled' then raise exception 'Only settled exports can be refunded'; end if;
  select * into w from public.credit_wallets where owner_id=charge.owner_id for update;
  update public.credit_wallets set available_credits=available_credits+charge.quoted_credits,
    lifetime_spent_credits=lifetime_spent_credits-charge.quoted_credits,version=version+1,updated_at=clock_timestamp()
    where owner_id=charge.owner_id and lifetime_spent_credits>=charge.quoted_credits returning * into w;
  if not found then raise exception 'Wallet accounting prevents this refund'; end if;
  update public.export_billing set state='refunded',released_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=charge.id;
  insert into public.credit_ledger(owner_id,entry_type,available_delta,reserved_delta,available_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,metadata)
    values(charge.owner_id,'export_refund',charge.quoted_credits,0,w.available_credits,w.reserved_credits,
      'export',charge.id,'export:'||charge.id||':refund','Settled export refunded',jsonb_build_object('reason',p_reason));
  insert into billing_private.billing_audit(owner_id,event_type,target_type,target_id,details)
    values(charge.owner_id,'export_refunded','export',charge.id,jsonb_build_object('reason',p_reason));
  return true;
end $$;
revoke all on function billing_private.refund_export(uuid,text) from public,anon,authenticated;
grant execute on function billing_private.refund_export(uuid,text) to service_role;

create function billing_private.record_verified_payment(p_owner_id uuid,p_gateway text,p_reference text,
  p_provider_transaction_id text,p_amount_kobo bigint,p_currency text,p_paid_at timestamptz,p_payload_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare payment_id uuid; existing public.payment_records;
begin
  perform billing_private.require_service_role();
  if p_owner_id is null or length(trim(p_gateway))<1 or length(trim(p_reference))<8 or length(trim(p_provider_transaction_id))<1 then
    raise exception 'Verified payment identity is incomplete';
  end if;
  if upper(p_currency)<>'NGN' or p_amount_kobo not in(50000,100000,200000,500000) then
    raise exception 'Payment amount is not an approved NGN top-up';
  end if;
  if p_paid_at is null or p_paid_at>clock_timestamp()+interval '5 minutes' or p_payload_hash!~'^[0-9a-f]{64}$' then
    raise exception 'Verified payment evidence is invalid';
  end if;
  select * into existing from public.payment_records
    where gateway=p_gateway and (payment_reference=p_reference or provider_transaction_id=p_provider_transaction_id) for update;
  if found then
    if existing.owner_id<>p_owner_id or existing.amount_kobo<>p_amount_kobo or existing.currency<>upper(p_currency) then
      raise exception 'Payment replay does not match the original payment';
    end if;
    if existing.provider_transaction_id is not null and existing.provider_transaction_id<>p_provider_transaction_id then
      raise exception 'Payment reference is already linked to another transaction';
    end if;
    update public.payment_records set provider_transaction_id=p_provider_transaction_id,status='verified',
      verified_at=p_paid_at,provider_payload_hash=lower(p_payload_hash),updated_at=clock_timestamp()
      where id=existing.id;
    perform billing_private.credit_verified_payment(existing.id);
    return existing.id;
  end if;
  insert into public.payment_records(owner_id,gateway,payment_reference,provider_transaction_id,amount_kobo,currency,
    credits,status,verified_at,provider_payload_hash)
  values(p_owner_id,trim(p_gateway),trim(p_reference),trim(p_provider_transaction_id),p_amount_kobo,upper(p_currency),
    (p_amount_kobo/1000)::integer,'verified',p_paid_at,lower(p_payload_hash)) returning id into payment_id;
  perform billing_private.credit_verified_payment(payment_id);
  return payment_id;
end $$;
revoke all on function billing_private.record_verified_payment(uuid,text,text,text,bigint,text,timestamptz,text) from public,anon,authenticated;
grant execute on function billing_private.record_verified_payment(uuid,text,text,text,bigint,text,timestamptz,text) to service_role;

create function billing_private.credit_verified_payment(p_payment_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare payment public.payment_records; w public.credit_wallets;
begin
  perform billing_private.require_service_role();
  select * into payment from public.payment_records where id=p_payment_id for update;
  if not found then return false; end if; if payment.status<>'verified' or payment.verified_at is null then raise exception 'Payment is not verified'; end if;
  if exists(select 1 from public.credit_ledger where owner_id=payment.owner_id and idempotency_key='payment:'||payment.id||':credit') then return true; end if;
  insert into public.credit_wallets(owner_id) values(payment.owner_id) on conflict(owner_id) do nothing;
  select * into w from public.credit_wallets where owner_id=payment.owner_id for update;
  update public.credit_wallets set available_credits=available_credits+payment.credits,
    lifetime_funded_credits=lifetime_funded_credits+payment.credits,version=version+1,updated_at=clock_timestamp()
    where owner_id=payment.owner_id returning * into w;
  insert into public.credit_ledger(owner_id,entry_type,available_delta,reserved_delta,available_after,reserved_after,
    reference_type,reference_id,idempotency_key,description,metadata)
    values(payment.owner_id,'payment_credit',payment.credits,0,w.available_credits,w.reserved_credits,'payment',payment.id,
      'payment:'||payment.id||':credit','Verified payment credited',jsonb_build_object('amountKobo',payment.amount_kobo,'gateway',payment.gateway));
  insert into billing_private.billing_audit(owner_id,event_type,target_type,target_id,details)
    values(payment.owner_id,'payment_credited','payment',payment.id,jsonb_build_object('credits',payment.credits,'amountKobo',payment.amount_kobo));
  return true;
end $$;
revoke all on function billing_private.credit_verified_payment(uuid) from public,anon,authenticated;
grant execute on function billing_private.credit_verified_payment(uuid) to service_role;

create function public.create_flutterwave_test_payment(p_owner_id uuid,p_reference text,p_amount_kobo integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare payment_id uuid;
begin
  perform billing_private.require_service_role();
  if p_owner_id is null or p_reference!~'^ect_test_[0-9a-f-]{36}$' or p_amount_kobo not in(50000,100000,200000,500000) then
    raise exception 'Invalid Flutterwave Test Mode payment request';
  end if;
  insert into public.payment_records(owner_id,gateway,payment_reference,amount_kobo,credits,status)
    values(p_owner_id,'flutterwave',p_reference,p_amount_kobo,p_amount_kobo/1000,'pending')
    on conflict(gateway,payment_reference) do update set updated_at=public.payment_records.updated_at
    returning id into payment_id;
  return payment_id;
end $$;
revoke all on function public.create_flutterwave_test_payment(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.create_flutterwave_test_payment(uuid,text,integer) to service_role;

create function public.finalize_flutterwave_test_payment(p_reference text,p_provider_transaction_id text,
  p_amount_kobo bigint,p_currency text,p_paid_at timestamptz,p_payload_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; payment_id uuid;
begin
  perform billing_private.require_service_role();
  select p.owner_id into owner_id from public.payment_records p
    where p.gateway='flutterwave' and p.payment_reference=p_reference for update;
  if not found then raise exception 'Unknown Econtent payment reference'; end if;
  payment_id:=billing_private.record_verified_payment(owner_id,'flutterwave',p_reference,p_provider_transaction_id,
    p_amount_kobo,p_currency,p_paid_at,p_payload_hash);
  return payment_id;
end $$;
revoke all on function public.finalize_flutterwave_test_payment(text,text,bigint,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.finalize_flutterwave_test_payment(text,text,bigint,text,timestamptz,text) to service_role;

