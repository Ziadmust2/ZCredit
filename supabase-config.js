// ZCredit Supabase configuration
// Replace these two values with your Supabase project's credentials.
// Project Settings -> API -> Project URL and Publishable/Anon key.
const SUPABASE_URL = "https://ddpmwasfrnufgbwrawvz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkcG13YXNmcm51Zmdid3Jhd3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODk2NDksImV4cCI6MjEwNDQ2NTY0OX0.tpLV7MWuz6YqiaDz-IwD9NGD2oqVnDzhY14_IU6Sab4";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
