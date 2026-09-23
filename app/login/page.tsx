import LoginForm from './LoginForm';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: '24rem', paddingTop: '18vh' }}>
      <p className="section-title" style={{ marginTop: 0 }}>Studio</p>
      {denied && <p className="notice error">That address doesn’t open this studio.</p>}
      <LoginForm />
    </main>
  );
}
