import express from 'express';
import session from 'express-session';
import * as client from 'openid-client';

const app = express();

const tenantId = 'f0a1c148-75c0-43a6-8d51-17fe5e004cc2';
const clientId = '1e5ddd88-0301-4e06-89da-6d0db89139f5';
const redirectUri = 'http://localhost:3001/auth/callback';

if (!process.env.LEDGERFLOW_CLIENT_SECRET) {
  throw new Error('LEDGERFLOW_CLIENT_SECRET is not set');
}

const issuer = new URL(
  `https://login.microsoftonline.com/${tenantId}/v2.0`
);

const config = await client.discovery(
  issuer,
  clientId,
  {},
  client.ClientSecretPost(process.env.LEDGERFLOW_CLIENT_SECRET)
);

app.use(
  session({
    secret: 'ledgerflow-oidc-lab-session',
    resave: false,
    saveUninitialized: false,
  })
);

app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.send(`
      <h1>LedgerFlow</h1>
      <p>Enterprise Expense Management</p>
      <p>Autumn Solutions</p>
      <a href="/login">Sign in with Microsoft Entra ID</a>
    `);
  }

  res.send(`
    <h1>LedgerFlow</h1>
    <h2>OIDC Sign-In Successful</h2>
    <p><strong>Name:</strong> ${req.session.user.name || 'Not provided'}</p>
    <p><strong>Username:</strong> ${req.session.user.preferred_username || 'Not provided'}</p>
    <p><strong>Object ID:</strong> ${req.session.user.oid || 'Not provided'}</p>

    <p><a href="/claims">View ID Token Claims</a></p>
    <p><a href="/graph">View Microsoft Graph Profile</a></p>
  `);
});

app.get('/login', async (req, res) => {
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  req.session.codeVerifier = codeVerifier;
  req.session.state = state;

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile email User.Read',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  res.redirect(authUrl.href);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const currentUrl = new URL(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`
    );

    const tokens = await client.authorizationCodeGrant(
      config,
      currentUrl,
      {
        pkceCodeVerifier: req.session.codeVerifier,
        expectedState: req.session.state,
      }
    );

    req.session.user = tokens.claims();
    req.session.accessToken = tokens.access_token;

    res.redirect('/');
  } catch (err) {
    console.error('\n=== ENTRA TOKEN ERROR ===');
    console.error('Error:', err.error || err.message || 'Unknown');
    console.error('Description:', err.error_description || 'No description');
    console.error('=========================\n');

    res.status(500).send(
      'OIDC token exchange failed. Check Terminal for the Entra error.'
    );
  }
});

app.get('/claims', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const safeClaims = {
    name: req.session.user.name,
    preferred_username: req.session.user.preferred_username,
    oid: req.session.user.oid,
    tid: req.session.user.tid,
    aud: req.session.user.aud,
    iss: req.session.user.iss,
  };

  res.send(`
    <h1>LedgerFlow OIDC Claims</h1>
    <pre>${JSON.stringify(safeClaims, null, 2)}</pre>
    <p><a href="/">Back to LedgerFlow</a></p>
  `);
});

app.get('/graph', async (req, res) => {
  if (!req.session.accessToken) {
    return res.redirect('/login');
  }

  const graphResponse = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName,jobTitle,department,id',
    {
      headers: {
        Authorization: `Bearer ${req.session.accessToken}`,
      },
    }
  );

  const graphData = await graphResponse.json();

  if (!graphResponse.ok) {
    console.error('Graph error:', graphData);

    return res.status(500).send(`
      <h1>Microsoft Graph Call Failed</h1>
      <pre>${JSON.stringify(graphData, null, 2)}</pre>
      <p><a href="/">Back to LedgerFlow</a></p>
    `);
  }

  res.send(`
    <h1>LedgerFlow</h1>
    <h2>OAuth 2.0 Microsoft Graph Call Successful</h2>
    <p>LedgerFlow used a delegated OAuth access token to call Microsoft Graph.</p>

    <pre>${JSON.stringify(graphData, null, 2)}</pre>

    <p><a href="/">Back to LedgerFlow</a></p>
  `);
});

app.listen(3001, () => {
  console.log('LedgerFlow OIDC is running at http://localhost:3001');
});
