# Admin API Documentation

## Overview

The Admin API provides endpoints for user authentication management, permission verification, and access control. It decodes JWT tokens from Keycloak SSO and returns user information and permissions.

## Features

- **JWT Token Decoding**: Extract user information from Keycloak tokens
- **Permission Management**: Check user permissions and responsibilities
- **Access Control**: Verify user access levels for different resources
- **Mock Permissions**: Temporary mock implementation before ICM integration

## Installation

The required dependencies have been added to `package.json`:

```json
{
  "dependencies": {
    "@nestjs/jwt": "^10.2.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.7"
  }
}
```

To install (when Node.js version is updated to 22.12+):

```bash
npm install
```

## API Endpoints

### 1. Get User Information

**Endpoint**: `GET /v1/admin/user/info`

**Description**: Decodes JWT token and returns user profile information.

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "username": "john.doe@example.com",
  "email": "john.doe@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "sub": "a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6",
  "exp": 1674567890
}
```

**Example Usage** (Frontend):
```typescript
const getUserInfo = async () => {
  const token = localStorage.getItem('authToken');

  const response = await fetch('http://localhost:3000/v1/admin/user/info', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const userInfo = await response.json();
  console.log(userInfo);
};
```

---

### 2. Get User Permissions

**Endpoint**: `GET /v1/admin/user/permissions`

**Description**: Decodes token and returns all permissions and responsibilities for the authenticated user.

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "username": "john.doe@example.com",
  "permissions": [
    {
      "id": "applicants.read",
      "name": "Read Applicants",
      "description": "View applicant information",
      "resource": "applicants",
      "action": "read"
    },
    {
      "id": "batches.read",
      "name": "Read Batches",
      "description": "View batch information",
      "resource": "batches",
      "action": "read"
    }
  ],
  "responsibilities": ["user"],
  "retrievedAt": "2024-01-19T16:30:00Z"
}
```

**Example Usage** (Frontend):
```typescript
const getPermissions = async () => {
  const token = localStorage.getItem('authToken');

  const response = await fetch('http://localhost:3000/v1/admin/user/permissions', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const permissions = await response.json();
  console.log('User permissions:', permissions);
};
```

---

### 3. Get Permissions by Username

**Endpoint**: `GET /v1/admin/permissions/:username`

**Description**: Retrieves permissions for a specific username (admin access required).

**Headers**:
```
Authorization: Bearer <token>
```

**Parameters**:
- `username` (path) - Username to query

**Response** (200 OK):
```json
{
  "username": "other.user@example.com",
  "permissions": [...],
  "responsibilities": ["user"],
  "retrievedAt": "2024-01-19T16:30:00Z"
}
```

**Response** (401 Unauthorized):
```json
{
  "statusCode": 401,
  "message": "Admin access required to view other user permissions"
}
```

---

### 4. Check Permission

**Endpoint**: `GET /v1/admin/check/permission?permissionId=<permission>`

**Description**: Checks if the authenticated user has a specific permission.

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `permissionId` (required) - Permission ID to check (e.g., "applicants.read")

**Response** (200 OK):
```json
{
  "hasPermission": true,
  "username": "john.doe@example.com",
  "permissionId": "applicants.read"
}
```

**Example Usage** (Frontend):
```typescript
const checkPermission = async (permissionId: string) => {
  const token = localStorage.getItem('authToken');

  const response = await fetch(
    `http://localhost:3000/v1/admin/check/permission?permissionId=${permissionId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  const result = await response.json();

  if (result.hasPermission) {
    console.log(`User has ${permissionId} permission`);
  }
};
```

---

### 5. Check Responsibility

**Endpoint**: `GET /v1/admin/check/responsibility?responsibility=<role>`

**Description**: Checks if the authenticated user has a specific responsibility/role.

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `responsibility` (required) - Responsibility/role to check (e.g., "admin", "reviewer")

**Response** (200 OK):
```json
{
  "hasResponsibility": true,
  "username": "admin.user@example.com",
  "responsibility": "admin"
}
```

**Example Usage** (Frontend):
```typescript
const checkAdminAccess = async () => {
  const token = localStorage.getItem('authToken');

  const response = await fetch(
    `http://localhost:3000/v1/admin/check/responsibility?responsibility=admin`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  const result = await response.json();
  return result.hasResponsibility;
};
```

---

## Permission Types (Mock Data)

### Base Permissions (All Users)
- `applicants.read` - View applicant information
- `batches.read` - View batch information

### Reviewer Permissions
All base permissions plus:
- `applicants.review` - Review and comment on applications
- `batches.review` - Review batch submissions

### Admin Permissions
All base and reviewer permissions plus:
- `applicants.write` - Create and update applicants
- `applicants.delete` - Delete applicant records
- `batches.write` - Create and update batches
- `batches.delete` - Delete batch records
- `admin.access` - Full administrative access

## Responsibilities/Roles

- `user` - Regular user (default)
- `reviewer` - Can review applications
- `approver` - Can approve applications (admin only)
- `admin` - Full administrative access

## Mock Data Logic

The current implementation uses username patterns to assign permissions:

- Usernames containing "admin"->Admin permissions
- Usernames containing "reviewer"->Reviewer permissions
- Other users->Base permissions only

**Example**:
- `admin.user@example.com`->Admin permissions
- `reviewer.jane@example.com`->Reviewer permissions
- `john.doe@example.com`->Base permissions

## Integration with Frontend

### Storing User Info After Login

```typescript
// In your login success handler
const onLoginSuccess = async (keycloak) => {
  const token = keycloak.token;

  // Get user info from admin API
  const response = await fetch('http://localhost:3000/v1/admin/user/info', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const userInfo = await response.json();

  // Store in state or context
  setUser(userInfo);
};
```

### Permission-Based UI Rendering

```typescript
const [permissions, setPermissions] = useState<string[]>([]);

useEffect(() => {
  const fetchPermissions = async () => {
    const token = localStorage.getItem('authToken');
    const response = await fetch('http://localhost:3000/v1/admin/user/permissions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setPermissions(data.permissions.map(p => p.id));
  };

  fetchPermissions();
}, []);

// Conditional rendering
{permissions.includes('applicants.write') && (
  <Button>Create Applicant</Button>
)}
```

### Protected Routes

```typescript
const ProtectedRoute = ({ requiredPermission, children }) => {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `http://localhost:3000/v1/admin/check/permission?permissionId=${requiredPermission}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const result = await response.json();
      setHasPermission(result.hasPermission);
    };

    checkPermission();
  }, [requiredPermission]);

  return hasPermission ? children : <Navigate to="/unauthorized" />;
};
```

## Testing

Run the unit tests:

```bash
npm test src/api/admin
```

## Future Enhancements

### ICM Integration

Replace mock permissions with actual ICM API calls:

```typescript
// In admin.service.ts
private async getMockPermissions(username: string) {
  // TODO: Replace with actual ICM API call
  // const icmResponse = await this.icmService.getUserPermissions(username);
  // return icmResponse;

  // Current mock implementation...
}
```

### Token Verification

Add token signature verification:

```typescript
// Add to admin.service.ts
import { JwtService } from '@nestjs/jwt';

constructor(private jwtService: JwtService) {}

async verifyToken(token: string): Promise<any> {
  try {
    return await this.jwtService.verifyAsync(token, {
      secret: process.env.KEYCLOAK_PUBLIC_KEY,
      algorithms: ['RS256']
    });
  } catch (error) {
    throw new UnauthorizedException('Invalid token signature');
  }
}
```

## Error Handling

All endpoints return standard HTTP error codes:

- **200 OK**: Request successful
- **400 Bad Request**: Missing required parameters
- **401 Unauthorized**: Missing or invalid token
- **403 Forbidden**: Insufficient permissions
- **500 Internal Server Error**: Server error

Example error response:
```json
{
  "statusCode": 401,
  "message": "Authorization header is required",
  "error": "Unauthorized"
}
```

## Swagger Documentation

Access the interactive API documentation at:
```
http://localhost:3000/api
```

The Swagger UI provides:
- Interactive endpoint testing
- Request/response schemas
- Example payloads
- Authentication configuration

## Security Considerations

1. **Token Storage**: Store tokens securely in httpOnly cookies or localStorage
2. **HTTPS**: Always use HTTPS in production
3. **Token Expiration**: Check token expiration before making requests
4. **CORS**: Configure CORS properly to allow frontend access
5. **Rate Limiting**: Implement rate limiting for API endpoints
6. **Input Validation**: All inputs are validated and sanitized

## Troubleshooting

### "Cannot find module '@nestjs/jwt'"

Install dependencies after Node.js is updated to 22.12+:
```bash
npm install
```

### "Authorization header is required"

Ensure the token is sent in the Authorization header:
```typescript
headers: {
  'Authorization': `Bearer ${token}`
}
```

### "Invalid token"

Check that:
1. Token is not expired
2. Token format is correct (JWT)
3. Token was issued by the correct Keycloak realm

## Support

For questions or issues, contact the development team or create an issue in the repository.
