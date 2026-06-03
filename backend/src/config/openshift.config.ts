import { registerAs } from '@nestjs/config'

export default registerAs('openshift', () => ({
  // Optional override for local kubeconfig testing against a remote cluster
  namespace: process.env.OPENSHIFT_NAMESPACE,
  // 'true' | 'false' | unset — when unset, the launcher auto-detects in-cluster config
  enabled: process.env.OPENSHIFT_ENABLED,
}))
