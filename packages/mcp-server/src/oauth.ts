// The HTTP deployment requires one bounded private-workspace grant for every tool.
export const OAUTH_SECURITY_SCHEMES = [{ type: 'oauth2', scopes: ['armature:edit'] }];

export function oauthChallenge(metadataUrl: string, insufficientScope = false): string {
  return `Bearer resource_metadata="${metadataUrl}", scope="armature:edit", error="${insufficientScope ? 'insufficient_scope' : 'invalid_token'}", error_description="Sign in to Armature to continue"`;
}
