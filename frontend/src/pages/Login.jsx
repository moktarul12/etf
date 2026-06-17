import { BarChart2 } from 'lucide-react';

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5000/auth/google';
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <BarChart2 size={28} color="#fff" />
          </div>
          <h1>ETF Ki Dukan</h1>
          <p>by Mahesh Kaushik</p>
        </div>

        <div className="login-body">
          <h2>Welcome back</h2>
          <p>Sign in to access your personal ETF trading dashboard</p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Google login failed. Please try again.
            </div>
          )}

          <button className="btn-google" onClick={handleGoogleLogin}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.964L3.964 7.295C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p className="login-disclaimer">
            Demo app · Your data is private to your account · No real money involved
          </p>
        </div>
      </div>
    </div>
  );
}
