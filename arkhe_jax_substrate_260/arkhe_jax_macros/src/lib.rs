//! Procedural Macros — #[differentiable]
//!
//! Deriva implementação automática do trait Differentiable.

use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(Differentiable)]
pub fn derive_differentiable(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = input.ident;

    let expanded = quote! {
        impl arkhe_jax_core::autograd::Differentiable for #name {
            type Tangent = Vec<f64>;

            fn jvp(&self, tangent: &Self::Tangent) -> Self::Tangent {
                tangent.clone()
            }

            fn vjp(&self, cotangent: &Self::Tangent) -> Vec<Self::Tangent> {
                vec![cotangent.clone()]
            }
        }
    };

    TokenStream::from(expanded)
}
