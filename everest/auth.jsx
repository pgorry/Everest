// Auth: magic-link sign-in + useAuth hook.

function useAuth() {
  // session: undefined = loading, null = signed out, object = signed in
  const [session, setSession] = React.useState(undefined);

  React.useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    // shouldCreateUser:false — invite-only. Only pre-created users can sign in.
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async function signOut() {
    await sb.auth.signOut();
  }

  return { session, signIn, signOut };
}

function SignInPage({ signIn }) {
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    // Swallow errors (e.g. "signups not allowed") so we never leak whether an
    // email is on the invite list. Always show the confirmation screen.
    try { await signIn(email.trim()); } catch {}
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="signin-wrap">
      <div className="signin-card">
        <h1 className="serif signin-title">Everest Challenge</h1>
        {sent ? (
          <p className="signin-sub">If that email is on the list, a sign-in link is on its way.</p>
        ) : (
          <form onSubmit={submit}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
              className="signin-input"
            />
            <button type="submit" className="btn accent signin-btn" disabled={loading}>
              {loading ? 'Sending…' : 'Continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { useAuth, SignInPage });
