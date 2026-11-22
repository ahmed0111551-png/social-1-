# Social App — Auth & User Modules

Node.js · Express · TypeScript · MongoDB (Mongoose) · JWT · Zod

## Run
```bash
npm install
cp .env.example .env      # fill MONGO_URI + the two JWT secrets
npm run dev               # http://localhost:3000
npm run build && npm start
```
In development (no `SMTP_HOST`) the OTP emails are **printed in the console**.

## Structure
```
src/
  config/        env (zod-validated), db
  models/        user, session (refresh tokens), follow
  middlewares/   auth (Bearer), validate (zod), error
  modules/
    auth/        routes → controller → service (+ validation)
    user/        routes → controller → service (+ validation)
  utils/         jwt, otp, mailer, AppError, asyncHandler, pagination
```

## Auth Module — `/api/v1/auth`
| Feature | Endpoint | Body |
|---|---|---|
| Register (sends 6-digit OTP) | `POST /register` | firstName, lastName, email, password |
| Verify email | `POST /verify-email` | email, otp |
| Resend code (60s cooldown) | `POST /resend-verification` | email |
| Login → access + refresh token | `POST /login` | email, password |
| Refresh (rotation) | `POST /refresh` | refreshToken |
| Revoke this session | `POST /logout` | refreshToken |
| Revoke all sessions | `POST /logout-all` (Bearer) | — |
| Forgot password (OTP) | `POST /forgot-password` | email |
| Reset password | `POST /reset-password` | email, otp, newPassword |
| Google sign-in | `POST /google` | idToken (Google ID token from the client) |

**How sessions work**
- Access token: 15 min, sent as `Authorization: Bearer <token>`.
- Refresh token: 7 days, stored server-side as a session row (`jti`), **rotated on every refresh**.
- **Reuse detection**: sending an already-used refresh token revokes the entire login session.
- Logout / password change / password reset revoke sessions immediately (the access token is checked against live sessions).
- OTPs are stored hashed, expire in 10 min, max 5 attempts. Forgot/resend responses never reveal if an email exists.

## User Module — `/api/v1/users` (all require Bearer token)
| Feature | Endpoint |
|---|---|
| My profile / update | `GET /me` · `PATCH /me` (firstName, lastName, bio, avatar URL) |
| View a profile (privacy-aware) | `GET /:id` |
| Follow / unfollow | `POST /:id/follow` · `DELETE /:id/follow` |
| Followers / following lists | `GET /:id/followers` · `GET /:id/following` |
| Pending follow requests (private accounts) | `GET /me/follow-requests` · `POST /me/follow-requests/:userId/accept` · `DELETE /me/follow-requests/:userId` |
| Search users by name | `GET /search?q=ahmed&page=1&limit=10` |
| Suggestions (mutual follows, then newest) | `GET /suggestions?limit=10` |
| Privacy settings | `GET /me/settings` · `PATCH /me/settings` `{ "isPrivate": true }` |
| Change password | `PATCH /me/password` `{ oldPassword, newPassword }` |

**Privacy rules**
- Public account → following is instant.
- Private account → following creates a `pending` request; the owner accepts/rejects it.
- Non-followers of a private account only see name, avatar, counts (`restricted: true`); bio and follower lists are hidden (403 on lists).
- Switching private → public auto-accepts pending requests.

## Google OAuth setup
Create an OAuth **Web client ID** in Google Cloud Console, put it in `GOOGLE_CLIENT_ID`, then have your frontend get an `idToken` (Google Identity Services) and POST it to `/auth/google`.

## Response format
```json
{ "success": true, "message": "...", "data": { } }
{ "success": false, "message": "Validation failed", "details": [{ "field": "email", "message": "Invalid email" }] }
```
