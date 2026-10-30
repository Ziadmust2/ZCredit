-- ZCredit leaderboard
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Returns every account ranked by balance, exposing ONLY username and balance
-- (never card numbers, names or user ids). `is_me` marks the caller's own row.
-- It's a function rather than a direct table read, so it keeps working even if the
-- profiles table's read policy is tightened later. Logged-in users only.

create or replace function public.get_leaderboard()
returns table (rank bigint, username text, balance numeric, is_me boolean)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by p.balance desc, p.created_at asc, p.username asc) as rank,
         p.username,
         p.balance,
         (p.id = auth.uid()) as is_me
  from profiles p
  order by p.balance desc, p.created_at asc, p.username asc
  limit 1000
$$;

revoke all on function public.get_leaderboard() from public, anon;
grant execute on function public.get_leaderboard() to authenticated;
