package types

type ResourceServerExtension interface {
	Key() string
	EnrichDeclaration(declaration interface{}, transportContext interface{}) interface{}
}
