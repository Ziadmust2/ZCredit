-- Make yousef67 and ziadmust2 the ZCredit admins.
-- Paste this whole file into the Supabase SQL Editor and click Run. Safe to re-run.
--
-- Admin ids:
--   47b47d7b-32dd-4ad6-975b-3dfbb0697c84  (yousef67)
--   5f65415b-a349-4f73-8bcd-8f0f82aeebd9  (ziadmust2)
-- Anyone not in this list loses admin access.

-- 1) Single definition of who the admin is (also used by giveaways and the balance lock)
create or replace function public.is_zcredit_admin()
returns boolean language sql stable as $$
  select auth.uid() in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84'::uuid, '5f65415b-a349-4f73-8bcd-8f0f82aeebd9'::uuid)
$$;

-- 2) Admin policies, rebuilt to use that function
drop policy if exists "admin_select_deposit_requests" on public.deposit_requests;
create policy "admin_select_deposit_requests" on public.deposit_requests
for select to authenticated using (public.is_zcredit_admin());

drop policy if exists "admin_update_deposit_requests" on public.deposit_requests;
create policy "admin_update_deposit_requests" on public.deposit_requests
for update to authenticated
using (public.is_zcredit_admin()) with check (public.is_zcredit_admin());

drop policy if exists "admin_select_transfer_requests" on public.transfer_requests;
create policy "admin_select_transfer_requests" on public.transfer_requests
for select to authenticated using (public.is_zcredit_admin());

drop policy if exists "admin_update_transfer_requests" on public.transfer_requests;
create policy "admin_update_transfer_requests" on public.transfer_requests
for update to authenticated
using (public.is_zcredit_admin()) with check (public.is_zcredit_admin());

drop policy if exists "admin_update_profiles" on public.profiles;
create policy "admin_update_profiles" on public.profiles
for update to authenticated
using (public.is_zcredit_admin()) with check (public.is_zcredit_admin());

drop policy if exists "admin_insert_transactions" on public.transactions;
create policy "admin_insert_transactions" on public.transactions
for insert to authenticated
with check (public.is_zcredit_admin());

-- 3) Allow the 'rejected' status used by the admin panel
alter table public.deposit_requests drop constraint if exists deposit_requests_status_check;
alter table public.deposit_requests add constraint deposit_requests_status_check
  check (status in ('pending','completed','rejected'));
alter table public.transfer_requests drop constraint if exists transfer_requests_status_check;
alter table public.transfer_requests add constraint transfer_requests_status_check
  check (status in ('pending','completed','rejected'));

-- 4) Check: should list both admin accounts
select id, username from public.profiles
where id in ('47b47d7b-32dd-4ad6-975b-3dfbb0697c84', '5f65415b-a349-4f73-8bcd-8f0f82aeebd9');
