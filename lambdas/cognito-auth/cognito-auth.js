// Autenticación de editores con Amazon Cognito (Managed Login + Authorization Code + PKCE).
// La aplicación NUNCA recibe ni guarda contraseñas: el usuario las escribe en la página
// de Cognito, y aquí solo llegan tokens firmados (JWT) que expiran.

const COGNITO = {
  // Valores del paso 1.4 de la bitácora (Cognito > User pool > App clients / Domain).
  domain: 'https://us-east-2jp2104rcp.auth.us-east-2.amazoncognito.com',
  clientId: 'p3tes6h020tgpcp14jl4fnjek',
  scopes: 'openid email profile',
  editorGroup: 'editores'
};

const Auth = (() => {
  const TOKENS_KEY = 'gaceta.auth.tokens';
  const PKCE_KEY = 'gaceta.auth.pkce';

  // Debe coincidir EXACTAMENTE con una "Allowed callback URL" del app client.
  function redirectUri() {
      const path = location.pathname.endsWith('/') ? `${location.pathname}index.html` : location.pathname;
      return `${location.origin}${path}`;
  }

  const base64url = (bytes) => btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randomString = (size) => base64url(crypto.getRandomValues(new Uint8Array(size)));

  async function sha256(text) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return new Uint8Array(digest);
  }

  // Solo decodifica para mostrar datos en la interfaz. La VALIDACIÓN real la hace la Lambda.
  function decode(jwt) {
      try {
          const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
          return JSON.parse(new TextDecoder().decode(bytes));
      } catch {
          return null;
      }
  }

  function load() {
      try { return JSON.parse(sessionStorage.getItem(TOKENS_KEY)); } catch { return null; }
  }
  const save = (tokens) => sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  const clear = () => sessionStorage.removeItem(TOKENS_KEY);

  async function tokenRequest(fields) {
      const response = await fetch(`${COGNITO.domain}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: COGNITO.clientId, ...fields })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error_description || data.error || 'No se pudo iniciar sesión.');
      return {
          access: data.access_token,
          id: data.id_token,
          refresh: data.refresh_token || fields.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000
      };
  }

  async function login() {
      if (!window.isSecureContext) {
          throw new Error('El inicio de sesión requiere HTTPS (o http://localhost).');
      }
      const verifier = randomString(48);
      const state = randomString(16);
      sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
      const params = new URLSearchParams({
          response_type: 'code',
          client_id: COGNITO.clientId,
          redirect_uri: redirectUri(),
          scope: COGNITO.scopes,
          state,
          code_challenge: base64url(await sha256(verifier)),
          code_challenge_method: 'S256'
      });
      location.assign(`${COGNITO.domain}/oauth2/authorize?${params}`);
  }

  // Se ejecuta al cargar la página: si Cognito nos regresó con ?code=..., lo cambia por tokens.
  async function handleRedirect() {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const error = params.get('error');
      if (!code && !error) return false;
      history.replaceState(null, '', redirectUri());
      if (error) throw new Error(params.get('error_description') || error);

      const pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null');
      sessionStorage.removeItem(PKCE_KEY);
      if (!pkce || pkce.state !== params.get('state')) throw new Error('Respuesta de inicio de sesión inválida.');

      save(await tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri(),
          code_verifier: pkce.verifier
      }));
      return true;
  }

  async function getAccessToken() {
      const tokens = load();
      if (!tokens) return null;
      if (Date.now() < tokens.expiresAt - 60_000) return tokens.access;
      if (!tokens.refresh) { clear(); return null; }
      try {
          const renewed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
          save(renewed);
          return renewed.access;
      } catch {
          clear();
          return null;
      }
  }

  function user() {
      const tokens = load();
      if (!tokens) return null;
      const id = decode(tokens.id) || {};
      const access = decode(tokens.access) || {};
      return { email: id.email || access.username, groups: access['cognito:groups'] || [] };
  }

  function logout() {
      clear();
      const params = new URLSearchParams({ client_id: COGNITO.clientId, logout_uri: redirectUri() });
      location.assign(`${COGNITO.domain}/logout?${params}`);
  }

  return {
      login,
      logout,
      handleRedirect,
      getAccessToken,
      user,
      isEditor: () => Boolean(user()?.groups.includes(COGNITO.editorGroup))
  };
})();
