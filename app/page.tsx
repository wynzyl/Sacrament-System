// app/page.tsx
// Login page - first page users see

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const data = await response.json();
          // Redirect based on role if already logged in
          switch (data.user.role) {
            case 'ADMIN':
              router.push('/admin');
              break;
            case 'PRIEST':
              router.push('/priest');
              break;
            case 'CASHIER':
              router.push('/cashier');
              break;
          }
        }
      } catch (error) {
        // Not logged in, stay on login page
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [router]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call login API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Redirect based on user role (session cookie is set automatically by server)
      switch (data.user.role) {
        case 'ADMIN':
          router.push('/admin');
          break;
        case 'PRIEST':
          router.push('/priest');
          break;
        case 'CASHIER':
          router.push('/cashier');
          break;
        default:
          setError('Invalid user role');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-white opacity-5 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-white opacity-5 rounded-full translate-x-1/2 translate-y-1/2"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Header section with icon */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-6 shadow-lg">
            <span className="text-4xl">✝️</span>
          </div>
          <p className="text-blue-100 text-xl">Immaculate Conception Cathedral Parish</p>
          <h1 className="text-4xl font-bold text-white mb-3">
            Church Management
          </h1>
          <p className="text-blue-100 text-lg">Sacrament Schedule & Payment Tracking</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-4 rounded-lg animate-shake">
                <p className="font-semibold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="admin@church.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-400 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Logging in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Credentials section */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-center text-sm font-semibold text-gray-700 mb-4">Demo Credentials</p>
            <div className="space-y-3">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-900">ADMIN</p>
                <p className="text-xs text-blue-700">admin@church.com</p>
                <p className="text-xs text-blue-700">password123</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-purple-900">PRIEST</p>
                <p className="text-xs text-purple-700">priest@church.com</p>
                <p className="text-xs text-purple-700">password123</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-green-900">CASHIER</p>
                <p className="text-xs text-green-700">cashier@church.com</p>
                <p className="text-xs text-green-700">password123</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-blue-100 text-xs mt-6">
          © 2026 Sacrament Management and Payment Monitoring System. 
          <p className="text-center text-blue-100 text-xs mt-1">All rights reserved.</p>
        </p>
      </div>
    </div>
  );
}
