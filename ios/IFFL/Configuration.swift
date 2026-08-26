import Foundation

/// Centralized configuration. The Supabase URL + anon key are intentionally
/// public — the anon key is RLS-gated by design. Service role key never lives
/// in this app; it's only used by edge functions and the Python sync worker.
enum Configuration {
    static let supabaseURL = URL(string: "https://kffweisltdmiivcwnurq.supabase.co")!

    /// Supabase anon (publishable) key — safe to embed in client source.
    static let supabaseAnonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmZndlaXNsdGRtaWl2Y3dudXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzY0NTgsImV4cCI6MjA5Mjk1MjQ1OH0." +
        "H8FYAdSUTofFW-eo_j_fPy5Mh0e8MEqUatwIRJuVWkY"

    /// Google Sign-In iOS client ID. This is the iOS client ID registered in GCP.
    /// Note: the matching reverse-DNS form is also added to Info.plist URL types.
    static let googleClientId =
        "1018921424251-pm6hfho43sd9o2lbqb97o1d7ot1ss208.apps.googleusercontent.com"
}
