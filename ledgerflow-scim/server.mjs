import express from 'express';
import fs from 'fs';
import crypto from 'crypto';

const app = express();
const PORT = 4000;
const DB_FILE = './users.json';

app.use(express.json({ type: ['application/json', 'application/scim+json'] }));

function loadUsers() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function requireAuth(req, res, next) {
  const expected = `Bearer ${process.env.SCIM_BEARER_TOKEN}`;

  if (!process.env.SCIM_BEARER_TOKEN || req.headers.authorization !== expected) {
    return res.status(401).type('application/scim+json').json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Unauthorized'
    });
  }

  next();
}

function scimUser(user, req) {
  return {
    ...user,
    meta: {
      ...(user.meta || {}),
      resourceType: 'User',
      location: `${req.protocol}://${req.get('host')}/scim/v2/Users/${user.id}`
    }
  };
}

app.get('/health', (req, res) => {
  res.json({ application: 'LedgerFlow SCIM', status: 'running' });
});

app.use('/scim/v2', requireAuth);

app.get('/scim/v2/ServiceProviderConfig', (req, res) => {
  res.type('application/scim+json').json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'Bearer Token',
        description: 'Static bearer token for the LedgerFlow IAM lab'
      }
    ]
  });
});

app.get('/scim/v2/ResourceTypes', (req, res) => {
  res.type('application/scim+json').json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        schemaExtensions: [
          {
            schema: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
            required: false
          }
        ]
      }
    ]
  });
});

app.get('/scim/v2/Schemas', (req, res) => {
  res.type('application/scim+json').json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:User',
        name: 'User',
        description: 'LedgerFlow User',
        attributes: []
      }
    ]
  });
});

app.get('/scim/v2/Users', (req, res) => {
  let users = loadUsers();
  const filter = req.query.filter;

  if (filter) {
    const match = filter.match(/^(.+?)\s+eq\s+"([^"]+)"$/i);

    if (match) {
      const attribute = match[1];
      const value = match[2];

      if (attribute === 'userName') {
        users = users.filter(
          u => (u.userName || '').toLowerCase() === value.toLowerCase()
        );
      } else if (attribute === 'externalId') {
        users = users.filter(u => u.externalId === value);
      } else if (attribute.includes('emails')) {
        users = users.filter(u =>
          (u.emails || []).some(
            e => (e.value || '').toLowerCase() === value.toLowerCase()
          )
        );
      } else {
        users = [];
      }
    }
  }

  res.type('application/scim+json').json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: users.length,
    startIndex: 1,
    itemsPerPage: users.length,
    Resources: users.map(u => scimUser(u, req))
  });
});

app.get('/scim/v2/Users/:id', (req, res) => {
  const user = loadUsers().find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).type('application/scim+json').json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '404',
      detail: 'User not found'
    });
  }

  res.type('application/scim+json').json(scimUser(user, req));
});

app.post('/scim/v2/Users', (req, res) => {
  const users = loadUsers();

  if (!req.body.userName) {
    return res.status(400).type('application/scim+json').json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '400',
      detail: 'userName is required'
    });
  }

  if (users.some(u =>
    (u.userName || '').toLowerCase() === req.body.userName.toLowerCase()
  )) {
    return res.status(409).type('application/scim+json').json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '409',
      scimType: 'uniqueness',
      detail: 'userName already exists'
    });
  }

  const now = new Date().toISOString();

  const user = {
    ...req.body,
    schemas: req.body.schemas || [
      'urn:ietf:params:scim:schemas:core:2.0:User'
    ],
    id: crypto.randomUUID(),
    active: req.body.active !== false,
    meta: {
      resourceType: 'User',
      created: now,
      lastModified: now
    }
  };

  users.push(user);
  saveUsers(users);

  const result = scimUser(user, req);

  res
    .status(201)
    .location(result.meta.location)
    .type('application/scim+json')
    .json(result);
});

app.patch('/scim/v2/Users/:id', (req, res) => {
  const users = loadUsers();
  const index = users.findIndex(u => u.id === req.params.id);

  if (index === -1) {
    return res.status(404).type('application/scim+json').json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '404',
      detail: 'User not found'
    });
  }

  const user = users[index];

  for (const operation of req.body.Operations || []) {
    const op = (operation.op || '').toLowerCase();

    if ((op === 'replace' || op === 'add') && operation.path) {
      const path = operation.path;

      if (path === 'active') {
        user.active = operation.value;
      } else if (path === 'displayName') {
        user.displayName = operation.value;
      } else if (path === 'title') {
        user.title = operation.value;
      } else if (path === 'userName') {
        user.userName = operation.value;
      } else if (path === 'externalId') {
        user.externalId = operation.value;
      } else if (path.includes('emails')) {
        user.emails = [{
          value: operation.value,
          type: 'work',
          primary: true
        }];
      } else if (path.endsWith(':department')) {
        const enterprise =
          'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';

        user[enterprise] ||= {};
        user[enterprise].department = operation.value;
      }
    } else if ((op === 'replace' || op === 'add') && operation.value) {
      Object.assign(user, operation.value);
    }
  }

  user.meta ||= {};
  user.meta.lastModified = new Date().toISOString();

  users[index] = user;
  saveUsers(users);

  res.type('application/scim+json').json(scimUser(user, req));
});

app.delete('/scim/v2/Users/:id', (req, res) => {
  const users = loadUsers();
  const remaining = users.filter(u => u.id !== req.params.id);

  if (remaining.length === users.length) {
    return res.status(404).end();
  }

  saveUsers(remaining);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`LedgerFlow SCIM running at http://localhost:${PORT}`);
});
