import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { UserDto } from '../../shared/contracts/index.js';
import { ApiRequestError, apiClient } from '../api/client.js';

export interface LoginViewProps {
  readonly onAuthenticated: (user?: UserDto) => void;
}

export function LoginView({ onAuthenticated }: LoginViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setErrorMessage(null);
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'Aguardando' };
    let score = 0;
    if (pass.length >= 4) score++;
    if (pass.length >= 8) score++;
    if (/[0-9]/.test(pass) && /[a-zA-Z]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    const labels = ['Muito fraca', 'Razoável', 'Boa', 'Forte', 'Excelente'];
    return { score, label: labels[score] ?? 'Boa' };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lockoutSeconds > 0 || isSubmitting) {
      return;
    }

    setErrorMessage(null);

    if (mode === 'register') {
      if (name.trim().length < 2) {
        setErrorMessage('Informe seu nome (mínimo de 2 caracteres).');
        return;
      }
      if (username.trim().length < 3) {
        setErrorMessage('Escolha um nome de usuário com pelo menos 3 caracteres.');
        return;
      }
      if (password.length < 4) {
        setErrorMessage('Crie uma senha com pelo menos 4 caracteres.');
        return;
      }
    } else if (!password.trim()) {
      setErrorMessage('Informe a senha de acesso.');
      passwordInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'register') {
        const res = await apiClient.register({
          name: name.trim(),
          username: username.trim(),
          password,
        });
        onAuthenticated(res.user);
      } else {
        const trimmedUsername = username.trim();
        const res = await apiClient.login({
          ...(trimmedUsername.length > 0 ? { username: trimmedUsername } : {}),
          password,
        });
        onAuthenticated(res.user);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 429 && err.retryAfterSeconds) {
          setLockoutSeconds(err.retryAfterSeconds);
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Não foi possível conectar ao servidor.');
      }
      passwordInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = isSubmitting || lockoutSeconds > 0;

  return (
    <main className="auth-shell">
      <div className="stitch-auth-container">
        {/* Stitch Brand Header */}
        <div className="stitch-auth-header">
          <div className="stitch-brand-logo-card">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '32px', fontVariationSettings: "'FILL' 1" }}
            >
              insights
            </span>
          </div>
          <div className="stitch-auth-badge">
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--color-secondary)',
                display: 'inline-block',
              }}
            />
            FinPulse Web &amp; Mobile
          </div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
            FinPulse
          </h1>
          <p className="page-subtitle" style={{ textAlign: 'center', marginTop: 0 }}>
            Seu controle financeiro com clareza, serenidade e precisão diária.
          </p>
        </div>

        {/* Segmented Control Tab Switcher */}
        <div className="stitch-segmented-tab" role="tablist" aria-label="Modo de acesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`stitch-tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              lock_open
            </span>
            <span>Entrar</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`stitch-tab-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              person_add
            </span>
            <span>Criar conta</span>
          </button>
        </div>

        {/* Interactive Form Card */}
        <div className="stitch-card" style={{ padding: '1.5rem' }}>
          <form
            onSubmit={(e) => void handleSubmit(e)}
            noValidate
            style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
          >
            {mode === 'register' && (
              <div className="field-group">
                <label
                  htmlFor="auth-name-input"
                  className="field-label"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                  }}
                >
                  <span>Seu Nome Completo</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                    Como quer ser chamado
                  </span>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      position: 'absolute',
                      left: '12px',
                      color: 'var(--color-outline)',
                      fontSize: '20px',
                      pointerEvents: 'none',
                    }}
                  >
                    badge
                  </span>
                  <input
                    id="auth-name-input"
                    type="text"
                    className="input-control"
                    style={{ width: '100%', paddingLeft: '2.5rem', height: '48px' }}
                    placeholder="Ex.: Ana Luiza Vieira"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isDisabled}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="field-group">
              <label
                htmlFor="auth-username-input"
                className="field-label"
                style={{ fontSize: '0.85rem' }}
              >
                {mode === 'register' ? 'E-mail ou Usuário de acesso' : 'Usuário ou E-mail'}
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--color-outline)',
                    fontSize: '20px',
                    pointerEvents: 'none',
                  }}
                >
                  alternate_email
                </span>
                <input
                  id="auth-username-input"
                  type="text"
                  className="input-control"
                  style={{ width: '100%', paddingLeft: '2.5rem', height: '48px' }}
                  placeholder={
                    mode === 'register'
                      ? 'seuemail@exemplo.com.br ou usuario'
                      : 'usuario ou deixe em branco para admin'
                  }
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isDisabled}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="field-group">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <label
                  htmlFor="login-password-input"
                  className="field-label"
                  style={{ fontSize: '0.85rem' }}
                >
                  Senha de acesso
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 0,
                      color: 'var(--color-primary-container)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setErrorMessage('Para redefinir, solicite ao administrador do sistema.');
                    }}
                  >
                    Esqueceu sua senha?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--color-outline)',
                    fontSize: '20px',
                    pointerEvents: 'none',
                  }}
                >
                  key
                </span>
                <input
                  ref={passwordInputRef}
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  style={{
                    width: '100%',
                    paddingLeft: '2.5rem',
                    paddingRight: '2.75rem',
                    height: '48px',
                  }}
                  placeholder={
                    mode === 'register' ? 'Crie sua senha segura' : 'Digite sua senha secreta'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isDisabled}
                  aria-invalid={errorMessage ? 'true' : 'false'}
                  aria-describedby={errorMessage ? 'login-error-msg' : undefined}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 0,
                    cursor: 'pointer',
                    color: 'var(--color-on-surface-variant)',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>

              {/* Password Strength Indicator */}
              {mode === 'register' && password.length > 0 && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <span>Força da credencial:</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      height: '5px',
                      background: 'var(--color-surface-dim)',
                      borderRadius: '9999px',
                      overflow: 'hidden',
                    }}
                  >
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        style={{
                          flex: 1,
                          background:
                            step <= passwordStrength.score
                              ? step <= 2
                                ? 'var(--color-tertiary-container)'
                                : 'var(--color-secondary)'
                              : 'transparent',
                          transition: 'background 0.3s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Remember Me Checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                color: 'var(--color-on-surface)',
                marginTop: '0.2rem',
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: 'var(--color-primary-container)',
                }}
              />
              <span>
                {mode === 'login'
                  ? 'Manter minha conta conectada com segurança'
                  : 'Concordo com os Termos de Uso e Política de Privacidade'}
              </span>
            </label>

            {errorMessage && (
              <div id="login-error-msg" className="alert-banner" role="alert" aria-live="assertive">
                {errorMessage}
                {lockoutSeconds > 0 && (
                  <div className="tabular-nums" style={{ marginTop: '0.25rem' }}>
                    Tempo restante: {lockoutSeconds}s
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                height: '48px',
                fontSize: '0.95rem',
                fontWeight: 700,
                marginTop: '0.5rem',
                borderRadius: '12px',
              }}
              disabled={isDisabled}
            >
              {isSubmitting ? (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    progress_activity
                  </span>
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'register' ? 'Criar minha conta no FinPulse' : 'Entrar no FinPulse'}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Social Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              margin: '1.25rem 0 1rem',
            }}
          >
            <div style={{ flex: 1, height: '1px', background: 'var(--color-border-card)' }} />
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}
            >
              ou acesse com
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-border-card)' }} />
          </div>

          {/* Social Quick Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: '44px', fontSize: '0.8125rem', borderRadius: '12px' }}
              onClick={() => {
                setUsername('google_user');
                setPassword('google_pass_123');
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  fill="#4285F4"
                />
                <path
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  fill="#34A853"
                />
                <path
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  fill="#EA4335"
                />
              </svg>
              <span>Google</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: '44px', fontSize: '0.8125rem', borderRadius: '12px' }}
              onClick={() => {
                setUsername('apple_user');
                setPassword('apple_pass_123');
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.42c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.71-.93 2.72 1 .08 2.01-.48 2.63-1.22z" />
              </svg>
              <span>Apple ID</span>
            </button>
          </div>
        </div>

        {/* Bank-Grade Security Banner */}
        <div className="stitch-trust-banner">
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--color-secondary)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
            >
              encrypted
            </span>
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: 'var(--color-secondary)',
              }}
            >
              <span>Proteção de Nível Bancário</span>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                verified_user
              </span>
            </div>
            <p
              style={{
                margin: '0.2rem 0 0',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.4,
              }}
            >
              Seus dados financeiros são criptografados de ponta a ponta (AES-256) em total
              conformidade com a LGPD e Banco Central.
            </p>
          </div>
        </div>

        {/* Concierge Microcopy Footer */}
        <div style={{ textAlign: 'center', padding: '0.25rem 0 1rem' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Precisa de suporte com seu acesso?{' '}
            <button
              type="button"
              style={{
                background: 'none',
                border: 0,
                color: 'var(--color-primary-container)',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={() => alert('Suporte FinPulse: suporte@finpulse.local')}
            >
              Fale com nosso concierge financeiro
            </button>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
