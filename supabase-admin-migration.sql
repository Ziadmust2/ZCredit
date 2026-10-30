-- ZCredit Admin Panel — RLS migration
-- Run this once in the Supabase SQL Editor (after the original supabase-schema.sql).
--
-- This is what actually secures the admin panel. admin.html/admin.js only
-- hide the UI for non-admins as a convenience — the database itself refuses
-- writes from anyone whose auth.uid() isn't this one account.

-- Admin accounts: yousef67 (yousef islam), ziadmust2 (Ziad Mohammed)
-- ids: 47b47d7b-32dd-4ad6-975b-3dfbb0697c84, 5f65415b-a349-4f73-8bcd-8f0f82aeebd9

-- Let the admin see and update ALL deposit requests (not just their own)
drop policy if exists "admin_select_deposit_requests" on public.deposit_requests;
create policy "admin_select_deposit_requests" on public.deposit_requests
for select to authenticated using (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid));

drop policy if exists "admin_update_deposit_requests" on public.deposit_requests;
create policy "admin_update_deposit_requests" on public.deposit_requests
for update to authenticated
using (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid))
with check (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid));

-- Let the admin see and update ALL transfer requests (not just ones they're party to)
drop policy if exists "admin_select_transfer_requests" on public.transfer_requests;
create policy "admin_select_transfer_requests" on public.transfer_requests
for select to authenticated using (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid));

drop policy if exists "admin_update_transfer_requests" on public.transfer_requests;
create policy "admin_update_transfer_requests" on public.transfer_requests
for update to authenticated
using (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid))
with check (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid));

-- Let the admin update ANY user's balance (needed to approve deposits/transfers)
drop policy if exists "admin_update_profiles" on public.profiles;
create policy "admin_update_profiles" on public.profiles
for update to authenticated
using (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid))
with check (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid));

-- Let the admin insert transaction records for ANY user (to log approvals)
drop policy if exists "admin_insert_transactions" on public.transactions;
create policy "admin_insert_transactions" on public.transactions
for insert to authenticated
with check (auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid));

-- Add a 'rejected' status so declined requests are kept (not just pending/completed)
alter table public.deposit_requests drop constraint if exists deposit_requests_status_check;
alter table public.deposit_requests add constraint deposit_requests_status_check
  check (status in ('pending','completed','rejected'));

alter table public.transfer_requests drop constraint if exists transfer_requests_status_check;
alter table public.transfer_requests add constraint transfer_requests_status_check
  check (status in ('pending','completed','rejected'));
