export default function BackendSetup({
  signedIn = false,
  message
}: {
  signedIn?: boolean;
  message?: string;
}) {
  return (
    <main className="authShell">
      <section className="authCard">
        <p className="authEyebrow">SUPABASE SETUP</p>
        <h1>{signedIn ? "Database setup needed." : "Backend connection needed."}</h1>
        <p className="authIntro">
          {message ??
            "The login UI is ready, but this preview still needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before accounts can sign in."}
        </p>
        <p className="authMessage">
          Once the Supabase project is connected and the schema is applied, this screen automatically becomes the login screen.
        </p>
      </section>
    </main>
  );
}
