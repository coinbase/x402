export interface ResourceServerExtension {
  key: string;
  enrichDeclaration?: (declaration: unknown, transportContext: unknown) => unknown;
}
