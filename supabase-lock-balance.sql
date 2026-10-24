-- ZCredit — stop users from editing their own balance
-- Run once in the Supabase SQL Editor (safe to re-run). Recommended.
--
-- Why: the original `profiles_update_own` policy lets a logged-in user update ANY column on
-- their own profile row, including `balance`. Anyone who opens the browser console can run
--   supabaseClient.from("profiles").update({balance: 999999}).eq("id", <their id>)
-- and succeed. Row Level Security can't restrict individual columns, so this trigger does.
--
-- Balance changes are still allowed for:
--   * the admin account (approving requests in the admin panel)
--   * claim_giveaway() (it sets a transaction-local flag)
--   * the Supabase dashboard / SQL editor / service role (no logged-in user = auth.uid() is null)
-- Everything else about profiles (username, card name, card number) is unaffected.

create or replace function public.guard_profile_balance()
returns trigger language plpgsql as $$
declare
  allowed boolean :=
       auth.uid() is null
    or public.is_zcredit_admin()
    or coalesce(current_setting('zcredit.allow_balance_change', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.balance <> 0 and not allowed then
      raise exception 'A new profile must start with a balance of 0.';
    end if;
  elsif new.balance is distinct from old.balance and not allowed then
    raise exception 'Balance can only be changed by an admin.';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_balance on public.profiles;
create trigger guard_profile_balance
before insert or update on public.profiles
for each row execute function public.guard_profile_balance();
