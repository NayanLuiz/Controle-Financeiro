import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client.js';

export interface LoginViewProps {
  readonly onLoginSuccess: () => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (password.length === 0) {
      setErrorMessage('Informe a senha de acesso.');
      passwordInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.login({ password });
      onLoginSuccess();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 429) {
          const seconds = err.retryAfterSeconds ?? 900;
          const minutes = Math.max(1, Math.ceil(seconds / 60));
          setErrorMessage(
            `Muitas tentativas de acesso. Por segurança, aguarde ${minutes} minutos (${seconds}s) antes de tentar novamente.`,
          );
        } else if (err.status === 401) {
          setErrorMessage('Senha inválida');
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage('Não foi possível conectar ao servidor.');
      }
      passwordInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <section className="card" style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <h1 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.5rem' }}>
          Controle Financeiro Pessoal
        </h1>
        <p style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--color-text-secondary)' }}>
          Informe sua credencial de acesso para desbloquear seus dados financeiros.
        </p>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: '1rem' }}>
          <div className="field-group">
            <label htmlFor="login-password-input" className="field-label">
              Senha ou PIN de acesso
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={passwordInputRef}
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="input-control"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? 'login-error-msg' : undefined}
              />
              <button
                type="button"
                className="btn btn-secondary"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              </button>
            </div>
            {errorMessage && (
              <div
                id="login-error-msg"
                className="alert-banner"
                role="alert"
                style={{ marginTop: '0.5rem' }}
              >
                {errorMessage}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
