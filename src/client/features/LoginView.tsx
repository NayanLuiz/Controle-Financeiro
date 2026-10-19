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
      <div className="auth-container">
        <div className="auth-card">
          <div className="brand-header" style={{ marginBottom: '1.5rem' }}>
            <div className="brand-mark" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 800 }}>FinPulse</h1>
              <p
                style={{
                  margin: '0.15rem 0 0 0',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.8125rem',
                }}
              >
                Controle financeiro pessoal com contas individuais isoladas
              </p>
            </div>
          </div>

          <div
            className="segmented-control"
            role="tablist"
            aria-label="Modo de acesso"
            style={{ marginBottom: '1.5rem' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className="segmented-btn"
              onClick={() => switchMode('login')}
            >
              Entrar na conta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className="segmented-btn"
              onClick={() => switchMode('register')}
            >
              Criar nova conta
            </button>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            noValidate
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {mode === 'register' && (
              <div className="field-group">
                <label htmlFor="auth-name-input" className="field-label">
                  Seu nome
                </label>
                <input
                  id="auth-name-input"
                  type="text"
                  className="input-control"
                  placeholder="Ex.: Nayan ou Maria"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isDisabled}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="field-group">
              <label htmlFor="auth-username-input" className="field-label">
                {mode === 'register'
                  ? 'Usuário de acesso'
                  : 'Usuário (ou deixe em branco para admin)'}
              </label>
              <input
                id="auth-username-input"
                type="text"
                className="input-control"
                placeholder={mode === 'register' ? 'Ex.: maria' : 'Ex.: nayan, maria ou admin'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isDisabled}
                autoComplete="username"
              />
            </div>

            <div className="field-group">
              <label htmlFor="login-password-input" className="field-label">
                Senha de acesso
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  ref={passwordInputRef}
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  placeholder={mode === 'register' ? 'Mínimo de 4 caracteres' : 'Digite sua senha'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isDisabled}
                  aria-invalid={errorMessage ? 'true' : 'false'}
                  aria-describedby={errorMessage ? 'login-error-msg' : undefined}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

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
                minHeight: '46px',
                fontSize: '0.9375rem',
                marginTop: '0.25rem',
              }}
              disabled={isDisabled}
            >
              {isSubmitting
                ? 'Autenticando...'
                : mode === 'register'
                  ? 'Criar minha conta e entrar'
                  : 'Entrar'}
            </button>
          </form>

          <p
            style={{
              margin: '1.25rem 0 0 0',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
            }}
          >
            {mode === 'register'
              ? 'Sua conta já virá configurada com 9 categorias iniciais de receitas e despesas.'
              : 'Cada conta possui categorias, lançamentos e metas 100% independentes.'}
          </p>
        </div>
      </div>
    </main>
  );
}
