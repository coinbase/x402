//! Tipos de dados numéricos — imutáveis por padrão (Substrato 912)

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum DType {
    Bool,
    U8, U16, U32, U64,
    I8, I16, I32, I64,
    F16, F32, F64,
    // Complexos para fase quântica (Substrato 899)
    C64, C128,
}

impl DType {
    pub fn size_bytes(&self) -> usize {
        match self {
            DType::Bool => 1,
            DType::U8 | DType::I8 => 1,
            DType::U16 | DType::I16 | DType::F16 => 2,
            DType::U32 | DType::I32 | DType::F32 => 4,
            DType::U64 | DType::I64 | DType::F64 => 8,
            DType::C64 => 8,
            DType::C128 => 16,
        }
    }
}
