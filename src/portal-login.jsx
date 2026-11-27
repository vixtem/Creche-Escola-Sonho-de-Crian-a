import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, FlaskConical, ShieldCheck, UsersRound } from 'lucide-react';
import { isGoogleSignInEnabled } from './portal-api.js';

const minPassword = 8;
const returnTo = staff => new URL(staff ? './portal.html?area=secretaria' : './portal.html', window.location.href).href;
const familyCopy = {
  enter: { title: 'Entre na sua conta', button: 'Entrar', detail: 'Acompanhe suas pré-matrículas e cadastre as crianças da família.' },
  signup: { title: 'Crie sua conta', button: 'Criar conta', detail: 'Use um e-mail ao qual você tenha acesso para confirmar o cadastro.' },
  forgot: { title: 'Recupere sua senha', button: 'Enviar link de recuperação', detail: 'Informe o e-mail da sua conta para receber um link de recuperação.' },
  reset: { title: 'Defina uma nova senha', button: 'Salvar nova senha', detail: 'Escolha uma nova senha para voltar a acessar o Portal da Família.' },
};

function PasswordField({ label, name, autoComplete, minimum }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return <div className="enrollment-field">
    <label htmlFor={name}>{label}</label>
    <div className="portal-password">
      <input id={name} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
        minLength={minimum} maxLength={128} required />
      <button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(value => !value)}>
        <Icon size={19} aria-hidden="true" />
      </button>
    </div>
  </div>;
}

export function PortalLogin({ client, staff, recovery, onRecovered, onDemo }) {
  const [mode, setMode] = useState('enter');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const activeMode = recovery ? 'reset' : mode;
  const offerGoogle = !staff && !client.demo;
  const staffOtp = staff && activeMode === 'otp';
  const newPassword = activeMode === 'signup' || activeMode === 'reset';
  let copy = familyCopy[activeMode];
  if (staffOtp) {
    copy = { title: sent ? 'Confira seu e-mail' : 'Acesso por e-mail',
      button: sent ? 'Entrar com código' : 'Enviar acesso por e-mail',
      detail: 'Use o e-mail autorizado pela escola para receber um link ou código.' };
  } else if (staff && activeMode === 'enter') {
    copy = { title: 'Acesso da equipe', button: 'Entrar',
      detail: 'Entre com seu e-mail autorizado e senha para analisar as solicitações.' };
  } else if (staff && activeMode === 'reset') {
    copy = { ...copy, detail: 'Escolha uma nova senha para voltar a acessar a Secretaria.' };
  }

  useEffect(() => {
    if (!offerGoogle) return;
    let active = true;
    isGoogleSignInEnabled().then(enabled => { if (active) setGoogleEnabled(enabled); });
    return () => { active = false; };
  }, [offerGoogle]);

  async function signInWithGoogle() {
    if (!offerGoogle || !googleEnabled || busy || activeMode !== 'enter') return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: returnTo(false),
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch {
      setError('Não foi possível entrar com o Google. Tente novamente ou use e-mail e senha.');
      setBusy(false);
    }
  }

  function changeMode(next) {
    setMode(next);
    setSent(false);
    setError('');
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    if (client.demo || busy) return;
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const address = email.trim();
    if (newPassword && password !== form.get('confirm-password')) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (staffOtp && sent) {
        const { error } = await client.auth.verifyOtp({ email: address, token: form.get('code').trim(), type: 'email' });
        if (error) throw error;
      } else if (staffOtp) {
        const { error } = await client.auth.signInWithOtp({
          email: address, options: { shouldCreateUser: false, emailRedirectTo: returnTo(true) },
        });
        if (error) throw error;
        setSent(true);
        setNotice('Use o link ou o código recebido por e-mail. Confira também a caixa de spam.');
      } else if (activeMode === 'signup') {
        const { error } = await client.auth.signUp({ email: address, password, options: { emailRedirectTo: returnTo(false) } });
        if (error) throw error;
        changeMode('enter');
        setNotice('Confira seu e-mail para confirmar o cadastro. Se a mensagem não chegou à caixa de entrada, verifique também a pasta de spam ou lixo eletrônico.');
      } else if (activeMode === 'forgot') {
        const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo: returnTo(staff) });
        if (error) throw error;
        setNotice('Se o e-mail estiver cadastrado, você receberá um link de recuperação.');
      } else if (activeMode === 'reset') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        onRecovered();
      } else {
        const { error } = await client.auth.signInWithPassword({ email: address, password });
        if (error) throw error;
      }
    } catch (err) {
      if (err.code === 'over_email_send_rate_limit') {
        setError('O limite temporário de envio de e-mails foi atingido. Aguarde até uma hora e tente novamente.');
      } else if (err.code === 'over_request_rate_limit' || err.status === 429) {
        setError('Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.');
      } else if (err.code === 'email_not_confirmed') setError('Confirme o e-mail de cadastro antes de entrar.');
      else if (err.code === 'weak_password') setError('Escolha uma senha mais forte.');
      else if (staffOtp && sent) setError('Código inválido ou expirado. Solicite um novo acesso por e-mail.');
      else if (activeMode === 'enter') setError('Não foi possível entrar. Confira o e-mail e a senha.');
      else setError('Não foi possível concluir. Tente novamente em alguns instantes.');
    } finally {
      setBusy(false);
    }
  }

  const RoleIcon = staff ? ShieldCheck : UsersRound;
  return <section className={`portal-login portal-screen ${staff ? 'portal-login--staff' : 'portal-login--family'}`}>
    <div className="portal-login-heading">
      <div className="portal-login-icon"><RoleIcon size={27} aria-hidden="true" /></div>
      <div><h2>{copy.title}</h2><p>{copy.detail}</p></div>
    </div>
    {offerGoogle && googleEnabled && activeMode === 'enter' && (
      <div className="portal-login-alternative">
        <button type="button" className="portal-login-google" disabled={busy} onClick={signInWithGoogle}>
          <img src="https://developers.google.com/static/identity/images/g-logo.png" width="20" height="20"
            alt="" referrerPolicy="no-referrer" />
          Entrar com Google
        </button>
        <p>Ou entre com e-mail e senha</p>
      </div>
    )}
    <form onSubmit={submit}>
      <fieldset className="portal-login-fields" disabled={busy || client.demo}>
        {activeMode !== 'reset' && <div className="enrollment-field">
          <label htmlFor="portal-email">{staff ? 'E-mail autorizado' : 'E-mail'}</label>
          <input id="portal-email" name="email" type="email" autoComplete="username" maxLength={254} required
            readOnly={sent} value={email} onChange={e => setEmail(e.target.value)} />
        </div>}
        {!staffOtp && activeMode !== 'forgot' && <PasswordField key={activeMode} name="password"
          label={newPassword ? 'Nova senha' : 'Senha'} minimum={newPassword ? minPassword : undefined}
          autoComplete={newPassword ? 'new-password' : 'current-password'} />}
        {newPassword && <PasswordField key="confirm" name="confirm-password" label="Confirme a senha"
          minimum={minPassword} autoComplete="new-password" />}
        {staffOtp && sent && <div className="enrollment-field">
          <label htmlFor="portal-code">Código recebido por e-mail</label>
          <input id="portal-code" name="code" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6,10}" maxLength={10} required />
        </div>}
        <button type="submit" className="button portal-login-submit">
          {copy.button}<ArrowRight size={18} aria-hidden="true" />
        </button>
      </fieldset>
      {error && <p className="portal-login-error" role="alert">{error}</p>}
      {notice && <p className="portal-login-feedback" role="status">{notice}</p>}
    </form>
    {staffOtp && sent && <button className="text-link" type="button" disabled={busy} onClick={() => changeMode('otp')}>
      Trocar e-mail ou solicitar novo acesso
    </button>}
    {activeMode === 'enter' && <div className="portal-login-links">
      {staff ? <button className="text-link" type="button" disabled={busy} onClick={() => changeMode('otp')}>Acessar por link ou código</button>
        : <button className="text-link" type="button" disabled={busy} onClick={() => changeMode('signup')}>Criar conta</button>}
      <button className="text-link" type="button" disabled={busy} onClick={() => changeMode('forgot')}>Esqueci minha senha</button>
    </div>}
    {['signup', 'forgot', 'otp'].includes(activeMode) && <button className="text-link" type="button"
      disabled={busy} onClick={() => changeMode('enter')}>Voltar à entrada</button>}
    {client.demo && <div className="portal-login-demo">
      <div><FlaskConical size={19} aria-hidden="true" /><p>O login real está desativado durante os testes.</p></div>
      <button className="button" type="button" onClick={onDemo}>Acessar sem login</button>
    </div>}
  </section>;
}
