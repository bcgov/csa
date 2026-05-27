import { registerAs } from '@nestjs/config'

export default registerAs('openshift', () => ({
  // Namespace is auto-detected from service account in OpenShift
  // Only needed for local dev if you want to override
  namespace: process.env.OPENSHIFT_NAMESPACE, // Optional override
  enabled: process.env.OPENSHIFT_ENABLED !== 'false', // Enabled by default in OpenShift
}))
