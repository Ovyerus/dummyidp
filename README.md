# DummyIDP

![](screenshot.png)

This is a fork of [ssoready/dummyidp](https://github.com/ssoready/dummyidp) with
fixes to make it work correctly with WorkOS (and likely other strict SAML/SCIM
consumers). The original project has several protocol-compliance gaps that cause
failures with WorkOS out of the box. These fixes were written by Claude under
human oversight and have been verified working with WorkOS, but have not been
tested against other SSO/SCIM services — they should be broadly compatible since
the changes bring the implementation closer to spec.

**Changes from upstream:**

- SAML: `<samlp:Response>` now includes required `ID`, `Version`,
  `IssueInstant`, `Destination`, `InResponseTo`, `<saml2:Issuer>`, and
  `<saml2p:Status>` elements
- SAML: `<ds:Reference URI>` now correctly references the assertion ID
- SAML: `<saml2:SubjectConfirmation>` now includes required `Method`,
  `Recipient`, and `NotOnOrAfter` attributes
- SAML: `email` attribute added to `AttributeStatement` so SPs can read it
  directly
- SAML: `RelayState` is forwarded in the POST back to the SP's ACS URL
- SAML: HTTP-Redirect binding `SAMLRequest` is now correctly decompressed
  (`deflate-raw`) before display
- SAML metadata: `Content-Type` changed to `application/samlmetadata+xml`
- SCIM: outbound push requests now include `Content-Type: application/json`,
  `schemas`, `emails`, and `active` fields required by strict SCIM consumers
- UI: added "Auto-submit login" option to skip the manual proceed step

---

[DummyIDP](https://ssoready.com/docs/dummyidp) is a website you can use to test
your application's SAML and SCIM support end-to-end. From your application's
perspective, it's exactly like the identity provider ("IDP") your customers use,
but unlike commercial IDPs there's no "input your email" or "talk to sales" step
to use DummyIDP.

DummyIDP implements the "Identity Provider" side of the SAML and SCIM protocols.
It is meant for use as a way to test your application's support for the "Service
Provider" side of the SAML and SCIM protocols. See
["DummyIDP Security Posture"](https://ssoready.com/docs/dummyidp#dummyidp-security-posture)
for details.

## Local development / self-hosting

DummyIDP is available for free online at https://dummyidp.com. You can also
self-host it or hack on it locally.

DummyIDP is a Next.js application. It is deployed in production on Vercel. You
can hack on it yourself by running:

```bash
npm install
npm run dev
```
