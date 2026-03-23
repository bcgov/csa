// Keycloak silent SSO check - posts current location to parent frame
parent.postMessage(location.href, location.origin);
