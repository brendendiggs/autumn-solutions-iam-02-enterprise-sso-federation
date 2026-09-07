# Project 02 — Enterprise SSO & Federation

## Overview

Autumn Solutions integrated LedgerFlow, a fictional third-party expense management SaaS application, with Microsoft Entra ID.

The project demonstrates enterprise identity integration across four major areas:

- SAML 2.0 federation
- OpenID Connect authentication
- OAuth 2.0 delegated API authorization
- SCIM 2.0 automated provisioning and deprovisioning

The goal was to centralize authentication, automate account lifecycle management, reduce manual access administration, and demonstrate troubleshooting of real federation and provisioning issues.

---

## Architecture

### SAML

User → Microsoft Entra ID → Signed SAML Assertion → Service Provider

A custom LedgerFlow SAML service provider was built using Node.js and integrated directly with Microsoft Entra ID.

During testing, LedgerFlow initially rejected the SAML signature. Troubleshooting identified that the local service provider was still trusting an older Entra signing certificate. After updating LedgerFlow to trust the active Entra certificate and aligning the signing configuration, the custom service provider successfully validated the signed SAML assertion, authenticated the user, and consumed Entra identity claims.

The Microsoft Entra SAML Toolkit was also used during troubleshooting as an independent validation harness for the Entra federation configuration.

Configuration included:

- Entity ID
- Assertion Consumer Service URL
- SP-initiated SSO
- X.509 signing certificate
- NameID mapping
- custom claims
- group-based application assignment

### OpenID Connect

User → LedgerFlow → Microsoft Entra ID → Authorization Code + PKCE → ID Token → LedgerFlow

LedgerFlow uses OpenID Connect to authenticate users.

The application uses:

- Authorization Code flow
- PKCE
- single-tenant application registration
- confidential client authentication
- client secret stored outside source code in an environment variable

The ID token provides identity claims including:

- name
- preferred_username
- object ID
- tenant ID
- audience
- issuer

### OAuth 2.0

LedgerFlow → OAuth Access Token → Microsoft Graph → /me

LedgerFlow uses a delegated OAuth 2.0 access token with the `User.Read` permission to call Microsoft Graph on behalf of the signed-in user.

This demonstrates the difference between:

- ID Token — authentication / who the user is
- Access Token — authorization / what protected resource the application can access

### SCIM 2.0

Microsoft Entra Provisioning Service
→ Public HTTPS Endpoint
→ Cloudflare Quick Tunnel
→ LedgerFlow SCIM API
→ Persistent LedgerFlow User Store

A custom SCIM 2.0 server was built in Node.js and exposed to Microsoft Entra through a temporary Cloudflare HTTPS tunnel.

Supported lifecycle operations include:

- user lookup
- user creation
- attribute updates
- account disablement
- persistent local storage

---

## Identity Controls Implemented

### SAML Federation

- Non-gallery enterprise application concepts
- Entity ID and ACS configuration
- X.509 signing certificate trust
- NameID using userPrincipalName
- emailAddress NameID format
- default identity claims
- custom department claim
- direct and group-based application assignment
- SP-initiated SSO validation

### OIDC Authentication

- single-tenant application registration
- Web redirect URI
- Authorization Code flow
- PKCE
- confidential client authentication
- ID token claim inspection

### OAuth Authorization

- delegated `User.Read`
- OAuth access token acquisition
- Microsoft Graph `/me` request
- least-privilege delegated access

### SCIM Provisioning

- bearer-token authentication
- SCIM 2.0 `/Users` endpoint
- assignment-based provisioning scope
- userPrincipalName → userName
- userPrincipalName → work email
- displayName
- job title
- department
- active lifecycle state
- create
- update
- disable

---

## Lifecycle Validation

### Create

Alex Morgan was assigned to LedgerFlow and provisioned successfully through Microsoft Entra.

LedgerFlow persisted:

- username
- display name
- work email
- job title
- department
- active state
- SCIM resource ID
- created and modified timestamps

### Update

Alex Morgan's job title was changed from:

`IAM Engineer`

to:

`Senior IAM Engineer`

Entra detected the attribute difference and updated the existing LedgerFlow SCIM resource.

### Deprovision

Alex Morgan was removed from the LedgerFlow application assignment.

Entra updated the LedgerFlow SCIM account to:

`active = false`

The user object was retained rather than deleted.

---

## Troubleshooting Performed

### SAML XML Signature Validation

The custom LedgerFlow SAML service provider initially received Entra SAML responses but rejected the XML signature.

Troubleshooting included:

- validating the X.509 certificate format
- comparing Entra and local certificate thumbprints
- identifying that LedgerFlow was trusting a stale Entra signing certificate
- reviewing assertion vs response signing requirements
- aligning Entra to sign the SAML assertion
- replacing the stale certificate with the active Entra signing certificate
- validating the Entra federation configuration independently with Microsoft Entra SAML Toolkit

After remediation, LedgerFlow successfully validated the signed SAML assertion, completed SP-initiated SSO, and consumed Entra identity claims.

### OIDC Client Authentication

The authorization flow initially reached Entra successfully but token redemption failed with:

`AADSTS7000218`

The root cause was that the confidential web application was not sending its client credential during token redemption.

The configuration was corrected to use client secret POST authentication while keeping the secret outside source code.

### SCIM Scope

Initial provisioning skipped Alex because he was not assigned to the LedgerFlow enterprise application.

The assignment was corrected and provisioning advanced to the target write stage.

### SCIM Attribute Mapping

The original email mapping used the Entra `mail` attribute.

Because the target SCIM service required an email and the source value was not usable, the mapping was changed to:

`userPrincipalName → emails[type eq "work"].value`

### SCIM Test Environment Limitation

An external SCIM testing service was initially evaluated but its free environment did not provide the persistence required for a complete Entra provisioning lifecycle.

A custom persistent LedgerFlow SCIM API was therefore implemented instead.

### SCIM Connectivity

Microsoft Entra initially returned an Unauthorized error when connecting through the Cloudflare tunnel.

The bearer token was synchronized between the LedgerFlow SCIM server and Entra provisioning configuration, resulting in a successful connection.

---

## Security Considerations

- Client secrets are not hardcoded in application source code.
- SCIM access is protected with a bearer token.
- Raw OAuth tokens are not displayed in portfolio evidence.
- SAML signing certificates are used for federation trust.
- Application assignment limits provisioning scope.
- SCIM deprovisioning disables accounts instead of deleting identity records.
- Temporary Cloudflare Quick Tunnel is used only for lab testing and is not intended as production hosting.
- Production implementations should use durable HTTPS hosting, managed secret storage, certificate or workload identity authentication where supported, logging, monitoring, and formal key rotation.

---

## Technologies

- Microsoft Entra ID
- SAML 2.0
- OpenID Connect
- OAuth 2.0
- Microsoft Graph
- SCIM 2.0
- Node.js
- Express
- openid-client
- Cloudflare Tunnel

---

## Result

Autumn Solutions successfully demonstrated centralized SaaS identity integration across authentication, authorization, federation, and automated account lifecycle management.

The final environment supports:

Custom LedgerFlow SAML federation → OIDC authentication → OAuth delegated API authorization → SCIM Create / Update / Disable


## Public Portfolio

The completed project is also published as a recruiter-facing case study:

- https://brendendiggs.com/projects/iam-02-enterprise-sso-federation.html

Public portfolio evidence:

18. `18-IAM-02-Public-Portfolio-Case-Study.png`
