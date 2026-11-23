// app/page.tsx
// Landing page for Immaculate Conception Cathedral Parish (Urdaneta City, Pangasinan)
// Displays real photographs of the Immaculate Conception Cathedral as the hero background
// and gallery, sacrament information, and buttons/links redirecting users to the /auth
// Sign In & Sign Up page.

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CHURCH_NAME,
  SACRAMENT_ICONS,
  SACRAMENT_LABELS,
} from '@/lib/constants';
import { BOOKING_CONFIG } from '@/lib/scheduling';

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerifiedAt?: string | null;
}

const CATHEDRAL_BACKGROUNDS = [
  {
    src: '/images/cathedral-hero.jpg',
    caption: 'Immaculate Conception Cathedral — Urdaneta City, Pangasinan',
    credit: 'Photo: Elmer B. Domingo (Wikimedia Commons, CC BY-SA 3.0)',
  },
  {
    src: '/images/cathedral-facade.jpg',
    caption: 'Cathedral Bell Tower & Main Facade — Diocese of Urdaneta',
    credit: 'Photo: Patrick Roque (Wikimedia Commons, CC BY-SA 4.0)',
  },
  {
    src: '/images/cathedral-interior.jpg',
    caption: 'Cathedral Grounds & Parish Sanctuary — Urdaneta City',
    credit: 'Photo: Ramon F. Velasquez (Wikimedia Commons, CC BY-SA 3.0)',
  },
];

const SACRAMENT_DESCRIPTIONS: Record<string, string> = {
  BAPTISM:
    'Welcome your child into the Christian community. View godparent & birth certificate requirements and request a schedule online.',
  WEDDING:
    'Celebrate the Sacrament of Holy Matrimony at the Cathedral. Check canonical interview, Pre-Cana seminar, and banns requirements.',
  CONFIRMATION:
    'Receive the gifts of the Holy Spirit. Schedule confirmation after verifying baptismal and First Communion certificates.',
  FIRST_COMMUNION:
    'Prepare children for their First Holy Eucharist with parish catechesis and baptismal record verification.',
  MASS_INTENTION:
    'Offer thanksgiving, special intentions, healing, or eternal repose prayers at the daily and Sunday Cathedral Masses.',
};

export default function CathedralLandingPage() {
  const [bgIndex, setBgIndex] = useState(0);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % CATHEDRAL_BACKGROUNDS.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const dashboardHref =
    user?.role === 'ADMIN'
      ? '/admin'
      : user?.role === 'PRIEST'
      ? '/priest'
      : user?.role === 'CASHIER'
      ? '/cashier'
      : '/book';

  const currentBg = CATHEDRAL_BACKGROUNDS[bgIndex];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      {/* Top Navigation Bar */}
      <header className="relative z-30 border-b border-white/15 bg-slate-950/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-2xl shadow">
              ✝️
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-300 font-semibold">
                Diocese of Urdaneta • Urdaneta City, Pangasinan
              </p>
              <h1 className="text-lg sm:text-xl font-bold text-white">{CHURCH_NAME}</h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <a
              href="#sacraments"
              className="px-3 py-2 text-slate-200 hover:text-white transition-colors"
            >
              Sacraments
            </a>
            <a
              href="#how-it-works"
              className="px-3 py-2 text-slate-200 hover:text-white transition-colors"
            >
              How to Book
            </a>
            <Link
              href="/track"
              className="px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              Track Booking
            </Link>
            {user ? (
              <Link
                href={dashboardHref}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow transition-colors"
              >
                {user.role === 'PARISHIONER' ? 'Go to Booking Portal' : `Go to ${user.role} Portal`}
              </Link>
            ) : (
              <>
                <Link
                  href="/auth?tab=signin"
                  className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold border border-white/30 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth?tab=signup"
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg transition-colors"
                >
                  Create Email Account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section with Immaculate Conception Cathedral Background */}
      <section className="relative min-h-[82vh] flex items-center overflow-hidden">
        {/* Background Image Layers */}
        {CATHEDRAL_BACKGROUNDS.map((bg, idx) => (
          <div
            key={bg.src}
            aria-hidden={idx !== bgIndex}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
              idx === bgIndex ? 'opacity-100 scale-105' : 'opacity-0 scale-100'
            }`}
            style={{ backgroundImage: `url('${bg.src}')` }}
          />
        ))}

        {/* Dark Gradient Overlays for readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/75 to-slate-900/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/40" />

        {/* Hero Content */}
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-semibold uppercase tracking-wider">
              <span>⛪</span>
              <span>Immaculate Conception Cathedral Parish • Urdaneta City</span>
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-white">
              Sacrament Scheduling &amp;{' '}
              <span className="text-amber-400">Online Parish Portal</span>
            </h2>

            <p className="text-lg sm:text-xl text-slate-200 max-w-2xl leading-relaxed">
              Welcome to the official sacrament management and payment monitoring portal of the{' '}
              <strong>Immaculate Conception Cathedral Parish</strong> in Urdaneta City, Pangasinan.
              Verify your email account to request sacrament schedules, review canonical
              requirements, and track or settle offerings online.
            </p>

            {/* Primary CTA Buttons leading to /auth */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/auth?tab=signup&next=/book"
                className="px-6 py-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-base shadow-xl hover:shadow-amber-500/25 transition-all transform hover:-translate-y-0.5"
              >
                Sign Up with Email to Book →
              </Link>
              <Link
                href="/auth?tab=signin&next=/book"
                className="px-6 py-4 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold text-base backdrop-blur-sm transition-all"
              >
                Sign In to Your Account
              </Link>
              <Link
                href="/track"
                className="px-5 py-4 rounded-xl border border-amber-400/50 text-amber-200 hover:bg-amber-500/15 font-semibold text-base transition-all"
              >
                Track Existing Reference
              </Link>
            </div>

            {/* Email Verification Requirement Badge */}
            <div className="bg-slate-900/80 border border-blue-400/30 rounded-xl p-4 max-w-xl backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
                ✉️ Verified Email Account Required for Booking
              </p>
              <p className="text-sm text-slate-200 mt-1">
                To protect parishioner schedules and prevent automated spam, a valid{' '}
                <strong>email account</strong> is required before booking an appointment. We send an
                instant confirmation link to your email to verify account authenticity.
              </p>
            </div>
          </div>

          {/* Right Highlight Card: Cathedral Info & Background Switcher */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900/85 border border-white/20 rounded-2xl p-6 shadow-2xl backdrop-blur-md space-y-5">
              <div className="flex items-center justify-between border-b border-white/15 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-amber-300 font-bold">
                    Cathedral Parish Office
                  </p>
                  <h3 className="text-xl font-bold text-white mt-0.5">
                    Parishioner &amp; Staff Access
                  </h3>
                </div>
                <span className="text-3xl">🕊️</span>
              </div>

              <div className="space-y-3 text-sm text-slate-200">
                <div className="flex items-start gap-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                  <span className="text-lg">1️⃣</span>
                  <div>
                    <p className="font-bold text-white">Create or Sign In with Your Email</p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Email accounts only. Receive a confirmation link to verify your email address
                      authenticity.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                  <span className="text-lg">2️⃣</span>
                  <div>
                    <p className="font-bold text-white">Request Your Sacrament Schedule</p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Choose Baptism, Wedding, Confirmation, First Communion, or Mass Intention and
                      select an open time slot.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                  <span className="text-lg">3️⃣</span>
                  <div>
                    <p className="font-bold text-white">Parish Review &amp; Online Payment</p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Pay at the Cathedral Cashier or online via Maya, GCash, GrabPay, InstaPay, or
                      PESONet once your fee is set.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 space-y-2.5">
                <Link
                  href="/auth"
                  className="block w-full text-center py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-lg transition-all"
                >
                  Continue to Sign In / Sign Up Page →
                </Link>
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span>Staff (Admin, Priest, Cashier)?</span>
                  <Link href="/auth?tab=staff" className="text-amber-300 hover:underline font-semibold">
                    Staff Sign In →
                  </Link>
                </div>
              </div>

              {/* Cathedral Photo Selector */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                  <span className="font-medium truncate">{currentBg.caption}</span>
                  <div className="flex gap-1.5 shrink-0 ml-2">
                    {CATHEDRAL_BACKGROUNDS.map((item, idx) => (
                      <button
                        key={item.src}
                        type="button"
                        onClick={() => setBgIndex(idx)}
                        aria-label={`Show cathedral photo ${idx + 1}`}
                        className={`h-2.5 rounded-full transition-all ${
                          idx === bgIndex ? 'w-6 bg-amber-400' : 'w-2.5 bg-white/35 hover:bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">{currentBg.credit}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sacraments Offered Section */}
      <section id="sacraments" className="bg-slate-900 py-16 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Online Scheduling Available
              </p>
              <h2 className="text-3xl font-bold text-white mt-1">
                Sacraments &amp; Liturgical Services
              </h2>
            </div>
            <Link
              href="/auth?tab=signup&next=/book"
              className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors"
            >
              Sign In / Sign Up to Request Schedule →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {BOOKING_CONFIG.onlineSacraments.map((type) => (
              <div
                key={type}
                className="bg-slate-800/80 border border-white/10 rounded-2xl p-6 flex flex-col justify-between hover:border-amber-400/50 transition-colors"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-2xl mb-4">
                    {SACRAMENT_ICONS[type] || '✝️'}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{SACRAMENT_LABELS[type]}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {SACRAMENT_DESCRIPTIONS[type]}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Requires Verified Email</span>
                  <Link
                    href="/auth?tab=signin&next=/book"
                    className="text-sm font-semibold text-amber-400 hover:text-amber-300"
                  >
                    Book {SACRAMENT_LABELS[type]} →
                  </Link>
                </div>
              </div>
            ))}

            {/* Urgent In-Office Sacraments Card */}
            <div className="bg-gradient-to-br from-amber-950/60 to-slate-800/90 border border-amber-400/30 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-2xl mb-4">
                  🕯️
                </div>
                <h3 className="text-xl font-bold text-amber-200 mb-2">
                  Funeral &amp; Anointing of the Sick
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Because funerals and pastoral care for the sick often require immediate priest
                  coordination, please visit or call the Cathedral Parish Office directly in
                  Urdaneta City.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10 text-xs text-amber-300 font-medium">
                📍 Poblacion, Urdaneta City, Pangasinan • Monday–Saturday, 8:00 AM – 5:00 PM
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cathedral Gallery & How Email Verification Works */}
      <section id="how-it-works" className="bg-slate-950 py-16 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {CATHEDRAL_BACKGROUNDS.map((photo) => (
              <div
                key={photo.src}
                className="group relative rounded-2xl overflow-hidden border border-white/15 h-64 shadow-lg"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                  style={{ backgroundImage: `url('${photo.src}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-4">
                  <p className="text-sm font-bold text-white">{photo.caption}</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">{photo.credit}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-r from-blue-900/60 via-indigo-900/60 to-slate-900 border border-blue-400/30 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <h3 className="text-2xl font-bold text-white">
                Ready to Schedule a Sacrament at Immaculate Conception Cathedral?
              </h3>
              <p className="text-sm text-slate-200">
                Sign in or create your parishioner account using a valid email address. We will send
                a confirmation link to verify your email before you book your appointment.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <Link
                href="/auth?tab=signup&next=/book"
                className="px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm shadow-lg transition-colors"
              >
                Create Email Account
              </Link>
              <Link
                href="/auth?tab=signin&next=/book"
                className="px-6 py-3.5 rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-bold text-sm shadow-lg transition-colors"
              >
                Sign In to Portal
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/10 py-8 text-xs text-slate-400 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-200">{CHURCH_NAME}</p>
            <p className="mt-0.5">Urdaneta City, Pangasinan • Sacrament Management &amp; Payment Monitoring System</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth" className="hover:text-white underline">
              Sign In / Sign Up
            </Link>
            <Link href="/track" className="hover:text-white underline">
              Track Request
            </Link>
            <Link href="/auth?tab=staff" className="hover:text-white underline">
              Staff Portal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
