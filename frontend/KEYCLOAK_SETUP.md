# Keycloak SSO Integration

This application uses Keycloak for Single Sign-On (SSO) authentication with IDIR.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install keycloak-js
```

### 2. Environment Configuration

Create a `.env` file in the `frontend` directory with the following variables:

```env
# Keycloak Configuration
VITE_KEYCLOAK_URL=https://your-keycloak-server.com/auth
VITE_KEYCLOAK_REALM=your-realm-name
VITE_KEYCLOAK_CLIENT_ID=csa-frontend
```

**For BC Government SSO:**

```env
VITE_KEYCLOAK_URL=https://loginproxy.gov.bc.ca/auth
# or
VITE_KEYCLOAK_URL=https://sso.pathfinder.gov.bc.ca/auth

VITE_KEYCLOAK_REALM=standard
VITE_KEYCLOAK_CLIENT_ID=csa-frontend
```

### 3. Keycloak Client Configuration

You need to configure a Keycloak client with the following settings:

#### Client Settings:

- **Client ID**: `csa-frontend` (or your preferred client ID)
- **Client Protocol**: `openid-connect`
- **Access Type**: `public`
- **Standard Flow Enabled**: `ON`
- **Direct Access Grants Enabled**: `ON` (optional)
- **Implicit Flow Enabled**: `OFF`

#### Valid Redirect URIs:

Add these redirect URIs (adjust based on your environment):

- Development: `http://localhost:5173/*`
- Production: `https://your-production-domain.com/*`

#### Web Origins:

Add these web origins:

- Development: `http://localhost:5173`
- Production: `https://your-production-domain.com`

#### Valid Post Logout Redirect URIs:

- Development: `http://localhost:5173`
- Production: `https://your-production-domain.com`

### 4. Required Information from Keycloak Admin

Contact your Keycloak administrator to obtain:

1. **Keycloak Server URL** - The base URL of your Keycloak server
2. **Realm Name** - The realm your application belongs to
3. **Client ID** - The client identifier created for this application
4. **Client Configuration** - Ensure the client is properly configured as a public client

### 5. How Authentication Works

1. **User visits the app** → AuthProvider initializes Keycloak
2. **Check SSO status** → Keycloak checks if user is already authenticated
3. **If not authenticated** → User sees "Login with IDIR (SSO)" button
4. **User clicks login** → Redirected to Keycloak login page
5. **User authenticates** → Redirected back to app with token
6. **Token stored** → Token stored in localStorage and refreshed automatically
7. **User info available** → User details available via `useAuth` hook

### 6. Using Authentication in Components

```tsx
import { useAuth } from './context/AuthContext'

function MyComponent() {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!isAuthenticated) {
    return <button onClick={login}>Login</button>
  }

  return (
    <div>
      <p>Welcome, {user?.name}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

### 7. Available User Information

The `user` object from `useAuth()` contains:

- `name` - Full name of the user
- `email` - Email address
- `username` - Username (typically IDIR)
- `roles` - Array of roles assigned to the user

### 8. Token Management

- Tokens are automatically refreshed every minute
- Tokens are stored in localStorage as `authToken`
- Token refresh happens in the background (70 seconds before expiration)
- If token refresh fails, user needs to re-authenticate

### 9. Security Considerations

- Never store sensitive data in localStorage
- Tokens are automatically removed on logout
- Use HTTPS in production
- Configure proper CORS settings in Keycloak
- Set appropriate token lifespans in Keycloak

### 10. Troubleshooting

#### Login redirect loop

- Check that redirect URIs are properly configured in Keycloak
- Verify the Keycloak URL is correct
- Check browser console for errors

#### Token refresh fails

- Verify token lifespan settings in Keycloak
- Check network connectivity
- Review Keycloak server logs

#### User information not available

- Verify that user attributes are mapped in Keycloak client
- Check that realm_access roles are properly configured
- Review token claims in browser developer tools

### 11. Development vs Production

**Development (.env.local):**

```env
VITE_KEYCLOAK_URL=http://localhost:8080/auth
VITE_KEYCLOAK_REALM=dev-realm
VITE_KEYCLOAK_CLIENT_ID=csa-frontend-dev
```

**Production (.env.production):**

```env
VITE_KEYCLOAK_URL=https://sso.production.com/auth
VITE_KEYCLOAK_REALM=production-realm
VITE_KEYCLOAK_CLIENT_ID=csa-frontend
```

### 12. Testing

To test the integration:

1. Start the app: `npm run dev`
2. Navigate to `http://localhost:5173`
3. Click "Login with IDIR (SSO)"
4. You should be redirected to Keycloak login page
5. After successful login, you'll be redirected back to the app

### 13. For BC Government Projects

If you're deploying to BC Government infrastructure:

1. Submit an SSO integration request through the appropriate channels
2. Specify your redirect URIs for all environments (dev, test, prod)
3. Wait for client creation and configuration
4. Receive your client ID and realm information
5. Update your environment variables
6. Test in each environment

## Files Created

- `src/config/keycloak.config.ts` - Keycloak configuration
- `src/context/AuthContext.tsx` - Authentication context provider
- `src/components/ProtectedRoute.tsx` - Protected route wrapper
- `public/silent-check-sso.html` - Silent SSO check for Keycloak
- `.env.example` - Environment variables template

## Additional Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak JavaScript Adapter](https://www.keycloak.org/docs/latest/securing_apps/#_javascript_adapter)
- [BC Government SSO](https://github.com/bcgov/sso-keycloak)
