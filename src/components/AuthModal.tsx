import { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, X } from 'lucide-react';
import { signInWithGoogle, auth } from '../lib/firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot';
}

export function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setUsername('');
      setPassword('');
      setError('');
      setMessage('');
    }
  }, [isOpen, initialMode]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const targetEmail = username.includes('@') ? username : `${username}@perkup.local`;

    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, targetEmail, password);
        onClose();
      } else if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, targetEmail, password);
        onClose();
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, username); // Must provide a valid email to reset
        setMessage('Password reset email sent! Check your inbox.');
      }
    } catch (err: any) {
      // Improve error messages
      if (err.code === 'auth/email-already-in-use') {
        setError('This username/email is already registered.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid username/email or password.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is disabled. Please enable it in Firebase Console.');
      } else {
        setError(err.message || 'An error occurred. Make sure Email/Password sign-in is enabled in Firebase Console.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      if (err?.code !== 'auth/cancelled-popup-request' && err?.code !== 'auth/popup-closed-by-user') {
        setError('Google sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'customer' | 'store_owner' | 'staff' | 'admin') => {
    setLoading(true);
    setError('');
    const demoEmail = `demo_${role}@perkup.local`;
    const demoPassword = 'password123';

    try {
      await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        try {
          const creds = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
          if (role !== 'customer') {
            const { doc, setDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            await setDoc(doc(db, 'users', creds.user.uid), {
              email: creds.user.email,
              name: `Demo ${role}`,
              role: role,
              updatedAt: new Date(),
            }, { merge: true });
            
            // Reload to ensure the correct role is fetched by AuthContext if we overwrote it.
            setTimeout(() => {
              window.location.reload();
            }, 500);
          }
          onClose();
        } catch (createErr: any) {
          setError('Failed to create demo account: ' + createErr.message);
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is disabled. Please enable it in Firebase Console under Authentication > Sign-in method.');
      } else {
        setError('Demo login failed: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: 'signin' | 'signup' | 'forgot') => {
    setMode(newMode);
    setError('');
    setMessage('');
    setPassword('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-900 w-full max-w-[400px] max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors mx-4"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors mb-1">
              {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {mode === 'signin' ? 'Enter your details to sign in.' : mode === 'signup' ? 'Join PerkUp to earn rewards.' : 'We will send you a reset link.'}
            </p>
          </div>

          {(error || message) && (
            <div className={`p-3 rounded-xl mb-4 text-sm ${error ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
              {error || message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                {mode === 'forgot' ? 'Email Address' : 'Username'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <User className="h-5 w-5" />
                </div>
                <input
                  type={mode === 'forgot' ? "email" : "text"}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                  placeholder={mode === 'forgot' ? "name@example.com" : "e.g. john_doe"}
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signin' && (
              <div className="flex justify-end">
                <button 
                  type="button" 
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-500"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium py-3 px-4 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </button>
          </form>

          {mode !== 'forgot' && (
            <>
              <div className="mt-6 flex items-center text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest before:flex-1 before:border-t before:border-gray-200 dark:before:border-gray-800 before:mr-4 after:flex-1 after:border-t after:border-gray-200 dark:after:border-gray-800 after:ml-4">
                Or
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="mt-6 w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  <path d="M1 1h22v22H1z" fill="none"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => switchMode('signup')} className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
                  Sign up
                </button>
              </>
            ) : mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <button onClick={() => switchMode('signin')} className="text-gray-600 dark:text-gray-300 font-medium hover:underline">
                Back to sign in
              </button>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-widest font-semibold">Demo Accounts</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('customer')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('store_owner')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Store Owner
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('staff')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('admin')}
                className="text-xs py-2 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
