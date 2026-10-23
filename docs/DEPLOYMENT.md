# Deployment of the APCOSYS application

This repository builds a browser application for the existing APCOSYS website HTTP and WebSocket API. It does not replace the client's identity, billing, scanning or search backend. The production container serves static assets and proxies API traffic through the same public origin. It can run on an existing VPS, container service or the client's own infrastructure; no particular hosting or database vendor is required.

## Build and local development

Use Node 24 and the committed npm lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev:demo` uses the explicit demonstration adapter. It does not contact the client's backend and does not prove live integration. `npm run dev` and production default to live mode. The production container always writes `dataMode: 'live'` at startup.

`npm run preview` previews a local build; it is not the production web server. See the [Vite deployment documentation](https://vite.dev/guide/static-deploy.html).

### Why the API has a prefix

The application needs `GET /auth/login` and `GET /auth/signup` as client routes. The backend owns `POST /auth/login` and `POST /auth/signup`. Proxying every `/auth/` request would break refreshes and direct links to the login screen.

Production therefore uses this mapping:

| Browser request | Destination |
| --- | --- |
| `GET /auth/login`, `/account/security`, `/billing/return` | SPA `index.html` |
| `POST /backend/auth/login` | Existing backend `POST /auth/login` |
| `GET /backend/whoami` | Existing backend `GET /whoami` |
| `GET /backend/ws` with Upgrade | Existing backend `GET /ws` |
| `POST /backend/download/bulk/stream` | Existing backend streaming response |
| `/auth/google/callback`, `/auth/telegram/callback` | Existing backend callback, same path |
| `/google/link/callback`, `/telegram/link/callback` | Existing backend linking callback, same path |
| `GET /s?...` | Existing backend short-link redirect |

`api.url()` retains `/backend/` for HTTP paths and sign-in/link redirects. The WebSocket client derives its URL from that same prefix. API errors never become SPA HTML, and the proxy does not retry mutations.

For live development, use the same prefix in `VITE_API_BASE_URL=/backend/` and configure the Vite proxy with `APCOSYS_DEV_API_TARGET` to the real backend origin. Live login requires HTTPS because the documented session cookie is `Secure`. A local HTTP demonstration session is not an authentication acceptance test.

## Container configuration

The Docker build uses a Node build stage and the official Nginx Alpine runtime. All fonts and Figma assets are local. Runtime settings are public browser configuration, not a place for secrets.

```sh
docker build --pull -t apcosys-app:release .
docker run --detach --name apcosys-app \
  --publish 127.0.0.1:8080:8080 \
  --env APCOSYS_API_UPSTREAM="$APCOSYS_EXISTING_API_ORIGIN" \
  --env APCOSYS_PUBLIC_SCHEME=https \
  apcosys-app:release
```

Set `APCOSYS_EXISTING_API_ORIGIN` to the client's verified backend origin before running this command. There is deliberately no invented hostname or default production API. The value accepts only an HTTP(S) origin with a hostname and optional port, with no credentials, path, query, fragment or trailing slash. A trailing `/backend/` belongs to the browser configuration, not the upstream origin. The included validator supports DNS names and IPv4; an IPv6-only upstream requires a reviewed template change.

| Variable | Purpose |
| --- | --- |
| `APCOSYS_API_UPSTREAM` | Required internal or HTTPS origin of the existing backend. |
| `APCOSYS_API_HOST` | Optional Host header required by upstream routing; defaults to the upstream authority. |
| `APCOSYS_PUBLIC_SCHEME` | Public browser protocol; defaults to `https`. `http` is only for an isolated protocol fixture or local non-auth testing. |
| `NODE_IMAGE` build argument | Override the Node build image with a reviewed tag or digest. |
| `NGINX_IMAGE` build argument | Override the Nginx runtime image with a reviewed tag or digest. |

For a reproducible release, record the built image digest and resolved base-image digests. Promotion should reuse that image rather than rebuilding mutable tags. Keep the previous image and its runtime settings available for rollback. Switching images does not migrate or delete backend data.

The container's `/healthz` proves Nginx liveness only. It intentionally does not claim that search, authentication or payment services are healthy. Readiness for release also requires the backend checks below.

## Public HTTPS, cookies and OAuth

Terminate TLS at the client's trusted reverse proxy or load balancer, and forward the application origin to port 8080. Certificates, DNS and public domains are deployment inputs. They are not generated or assumed by this repository.

The supplied API contract defines `session_id` as `HttpOnly; Secure; SameSite=None; Path=/`. This app sends credentialed requests and never reads, stores or fabricates the cookie. Nginx preserves cookie flags and paths. There is no JWT in local storage and no browser API key used as a substitute for a session.

The proxy forwards the actual `Origin`, sets `X-Forwarded-Host`, and sets `X-Forwarded-Proto` from trusted runtime configuration. The public ingress must preserve the original public `Host` authority, including a nondefault port, and accept only the configured application hosts. Configure the existing backend to trust only the intended proxy and to allow the exact public origin for cookie-authenticated HTTP and WebSocket operations. Cookie-bearing cross-site WebSocket requests need server-side Origin validation; the frontend cannot enforce that on the server's behalf. See the [OWASP WebSocket security guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

For Google OAuth, the backend's public API origin and registered callback must resolve to the same public HTTPS origin that issued the `oauth_state` cookie. A callback on a different upstream host will not receive a host-only cookie set through the frontend proxy. The template supports the documented root callback paths as well as callbacks through `/backend/`. Configure the real backend and provider consistently, including the backend's frontend redirect URL. The app handles `/login?2FA=true` through its compatibility route; Telegram's pending challenge can also be detected by the `whoami` 401 message. Validate both with an actual staging account.

Telegram login requires the client's real Telegram bot username and widget configuration. That value is absent from the supplied API contract. The application explains its unavailable state rather than using a fabricated bot. Existing account linking uses the documented backend redirect routes.

Card checkout and the billing portal open validated HTTPS URLs returned by the authenticated backend. They are not embedded in the app. A checkout URL, browser return URL or completed redirect is not payment confirmation: the app checks server payment state and refreshes subscription/billing data.

## Proxy behavior and operational limits

The Nginx configuration passes WebSocket Upgrade and Connection headers, uses HTTP/1.1 explicitly and allows a 60-minute idle read window. It streams downloads without response buffering. Upstream HTTPS verifies its certificate against the runtime CA bundle and uses the upstream hostname for SNI. See [Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html) and the [proxy module reference](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

The included runtime serves the application at `/`. Hosting beneath a path requires coordinated Vite `base`, router basename, asset, callback and proxy changes; changing only one value is insufficient. The current upload/request body cap is 10 MiB. Raise it only when the existing API and the client's intended workloads require it.

The content policy permits local scripts, local fonts and local images, with data/blob images for authenticator QR codes. `connect-src` includes both `'self'` and an explicit WebSocket source for the incoming public authority, including its port. The runtime derives `wss` from the validated public `https` setting and `ws` only from `http`; it leaves Nginx's `$http_host` variable intact. This avoids relying on browsers treating `'self'` as a WebSocket scheme match, which is not universal; see the [MDN connect-src documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src). It does not permit arbitrary WebSocket destinations.

The policy does not allow an arbitrary external widget. A configured Telegram widget needs an explicit, reviewed CSP update for Telegram's actual script/frame origins. Headers prevent framing, disable camera/microphone/geolocation and suppress referrers. Runtime config and HTML are not cached; hashed build assets can be cached immutably. The app's image and font assets do not depend on temporary Figma URLs.

Application access logs include the method, path, status and timings, without query strings, headers or request bodies. Review upstream and ingress error logs and any telemetry separately: their own policies can still include OAuth query values, private searches or account data. Do not capture passwords, cookie values, API keys, TOTP secrets, backup codes or private query bodies in monitoring.

## Continuous integration and release gates

`.github/workflows/ci.yml` uses read-only repository permission and full commit pins for the official actions. It runs typechecking, unit/transport tests, the production build and the browser suite. A separate Docker job builds the complete image and exercises it against an isolated protocol fixture.

The proxy smoke test checks the concrete routing risks: login page deep links return SPA HTML; the CSP explicitly names the public WebSocket scheme, authority and port; API login preserves 202 and cookie attributes; the original Origin survives; a backend 404 stays JSON; the OAuth callback remains a redirect; an intentionally open NDJSON response reaches the browser before completion; and `/backend/ws` upgrades to a WebSocket at upstream `/ws`. The fixture has no production fallback path and no real credentials.

The workflow never deploys automatically, configures client DNS, creates a database, or performs real payments. A production deployment workflow can be added once the client identifies the existing registry, host and release controls. Running this CI does not substitute for a live backend test.

Before accepting a live release, record actual staging evidence for:

1. HTTPS session creation, reload persistence, expiry and logout of all sessions; 202 login and both TOTP and one-time backup code completion.
2. Signup email verification and password recovery, including wrong/expired codes and the 18-character signup versus 6-character login/reset minimums.
3. Google callback and pending 2FA on the configured public origin; Telegram only after its actual integration configuration is supplied.
4. Credentialed WebSocket authorization, correlation, disconnect/unknown mutation handling and guest limits without silent fallback or paid-query retry.
5. Provider sandbox checkout, cancellation/resumption and payment confirmation followed by actual entitlement refresh. No test should spend real money unless explicitly authorized.
6. Streaming export and permitted plan caps against the client's backend, with interrupted transfers and access denial visible to the user.

The development workspace used to prepare this repository did not contain a Docker daemon. Local source, build and browser evidence must be reported separately from the container CI run and the client's live acceptance. Do not mark the container, provider callbacks or live backend scenarios passed until those executions exist.

## Official action pins

Pins were checked against the official repositories on 23 October 2026:

- [actions/checkout v7.0.1](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1)
- [actions/setup-node v7.1.0](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1)
- [actions/upload-artifact v7.0.2](https://github.com/actions/upload-artifact/commit/cf430e030ddbb5b0abf93d22962f4752f3646cd9)

Dependency upgrades should keep the lockfile, browser version and CI pins together and re-run the checks.

