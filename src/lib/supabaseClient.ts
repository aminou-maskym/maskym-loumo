import { createClient } from "@supabase/supabase-js";

// ⚠️ Mets directement tes infos ici
const supabaseUrl = "https://foprwbmiyrhiflupvojf.supabase.co"; // ton URL Supabase
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvcHJ3Ym1peXJoaWZsdXB2b2pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMjAwNzUsImV4cCI6MjA3MTY5NjA3NX0.gpoBl-Wf89mDuyFu2---SJV-CopsczgXH2VTQpn4iUM"; // ta clé anonyme

export const supabase = createClient(supabaseUrl, supabaseAnonKey);