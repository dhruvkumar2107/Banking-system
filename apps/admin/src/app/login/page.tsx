'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PiggyBank, LogIn, ShieldCheck, TrendingUp, Landmark } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authed') router.replace('/dashboard');
  }, [status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Brand hero ─────────────────────────────────────────────────── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-gradient p-12 text-white lg:flex">
        {/* Floating aurora orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 -top-16 h-72 w-72 animate-float rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 animate-float rounded-full bg-cyan-400/25 blur-3xl [animation-delay:-3s]" />
          <div className="absolute left-1/3 top-1/2 h-56 w-56 animate-float rounded-full bg-violet-400/25 blur-3xl [animation-delay:-6s]" />
        </div>
        {/* Fine grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%, #000 40%, transparent 100%)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 shadow-glow ring-1 ring-white/25 backdrop-blur">
            <PiggyBank size={24} />
          </span>
          <span className="text-xl font-bold tracking-tight">Digital Pigmee</span>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">
              Daily micro-savings,
              <br />
              managed with confidence.
            </h1>
            <p className="max-w-md text-[15px] leading-relaxed text-brand-100">
              Track village-wise collections, verify payments, and keep every rupee reconciled — all
              from one intelligent corporate console.
            </p>
          </div>
          <ul className="space-y-3.5">
            {[
              { icon: TrendingUp, text: 'Real-time collection analytics' },
              { icon: Landmark, text: 'Village-wise balances & reconciliation' },
              { icon: ShieldCheck, text: 'Bank-grade security & audit trail' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                  <Icon size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200">Corporate Bank · Micro-Savings Division</p>
      </div>

      {/* ── Sign-in panel (sits on the ambient aurora backdrop) ─────────── */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <PiggyBank size={22} />
            </span>
            <span className="text-lg font-bold text-gradient">Digital Pigmee</span>
          </div>

          <div className="card card-topline card-glow p-7">
            <h2 className="text-2xl font-bold tracking-tight text-ink">Welcome back</h2>
            <p className="mt-1 text-sm text-ink-muted">Sign in to your admin console to continue.</p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@bank.example"
                />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              {error && (
                <div className="animate-scale-in rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {error}
                </div>
              )}

              <Button type="submit" loading={submitting} className="w-full">
                <LogIn size={16} /> Sign in
              </Button>
            </form>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
            <ShieldCheck size={13} /> Secured with end-to-end encryption
          </p>
        </div>
      </div>
    </div>
  );
}
