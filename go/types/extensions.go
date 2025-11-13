package types

type ResourceServiceExtension interface {
	Key() string
	EnrichDeclaration(declaration interface{}, transportContext interface{}) interface{}
}

