const fs = require('fs');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy: SamlStrategy } = require('@node-saml/passport-saml');

const app = express();

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: 'ledgerflow-lab-session-secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

const entraCertificate = fs.readFileSync('./LedgerFlow.cer', 'utf8');

passport.use(
  new SamlStrategy(
    {
      entryPoint:
        'https://login.microsoftonline.com/f0a1c148-75c0-43a6-8d51-17fe5e004cc2/saml2',

      issuer:
        'http://localhost:3000/saml/metadata',

      callbackUrl:
        'http://localhost:3000/login/callback',

      idpCert: entraCertificate,

      wantAuthnResponseSigned: false,
      wantAssertionsSigned: true,

      identifierFormat: null,
      disableRequestedAuthnContext: true,
    },
    (profile, done) => {
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.get('/', (req, res) => {
  if (!req.user) {
    return res.send(`
      <h1>LedgerFlow</h1>
      <p>Enterprise Expense Management</p>
      <p>Autumn Solutions</p>
      <a href="/login">Sign in with Microsoft Entra ID</a>
    `);
  }

  res.send(`
    <h1>LedgerFlow</h1>
    <h2>SAML SSO Successful</h2>
    <p><strong>NameID:</strong> ${req.user.nameID || 'Not provided'}</p>
    <p><a href="/claims">View SAML Claims</a></p>
  `);
});

app.get(
  '/login',
  passport.authenticate('saml', {
    failureRedirect: '/',
  })
);

app.post(
  '/login/callback',
  passport.authenticate('saml', {
    failureRedirect: '/',
  }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/claims', (req, res) => {
  if (!req.user) {
    return res.redirect('/');
  }

  const safeClaims = {
    nameID: req.user.nameID,
    nameIDFormat: req.user.nameIDFormat,
    givenName:
      req.user.givenname ||
      req.user['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'],
    surname:
      req.user.surname ||
      req.user['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'],
    email:
      req.user.emailaddress ||
      req.user.email ||
      req.user.mail ||
      req.user['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
    userPrincipalName:
      req.user['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'],
    department:
      req.user.department
  };

  res.send(`
    <h1>LedgerFlow SAML Claims</h1>
    <pre>${JSON.stringify(safeClaims, null, 2)}</pre>
    <p><a href="/">Back to LedgerFlow</a></p>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    application: 'LedgerFlow',
    status: 'running',
  });
});

app.listen(3000, () => {
  console.log('LedgerFlow is running at http://localhost:3000');
});
